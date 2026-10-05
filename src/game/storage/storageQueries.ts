import { getAiService } from "../ai/aiServiceRegistry";
import { citizenComponent } from "../factions/citizenComponent";
import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { isOperationAllowed } from "../inventory/inventoryPermissions";
import { canStore, getTotal } from "../inventory/inventoryQueries";
import { InventoryOperation } from "../inventory/inventoryTypes";
import { positionComponent } from "../map/positionComponent";
import { furnitureComponent } from "./furnitureComponent";
import { effectiveFilter, filterAccepts } from "./materialFilter";
import { getStorageService } from "./storageServiceRegistry";
import { buildSitePrototypeId, loosePilePrototypeId } from "./storageTypes";
import type { StockSource, StockSummary } from "./storageTypes";

/**
 * Whether an entity is a loose pile of goods on the ground.
 *
 * @param entity - Any entity.
 * @returns True for the `loose_pile` prototype.
 */
export function isLoosePile(entity: Entity): boolean {
  return entity.prototype === loosePilePrototypeId;
}

/**
 * Whether an entity's inventory is claimable storage (spec 018 FR-011, DECISIONS D-09): furniture
 * with an inventory and loose piles count. Excluded are construction sites (staged building
 * materials), inventories flagged `queryable: false`, and everything that carries goods around
 * (citizens and other creatures): carried stock is no source.
 *
 * @param entity - Any entity.
 * @returns True when material queries may look into its inventory.
 */
export function isStorageEntity(entity: Entity): boolean {
  const inventory = getComponent(entity, inventoryComponent);
  return (
    inventory !== undefined &&
    inventory.queryable &&
    entity.prototype !== buildSitePrototypeId &&
    !hasComponent(entity, citizenComponent) &&
    (hasComponent(entity, furnitureComponent) || isLoosePile(entity))
  );
}

/**
 * All claimable storage entities, ascending by id.
 *
 * @param engine - The engine.
 * @returns Live entities for which {@link isStorageEntity} holds.
 */
export function listStorage(engine: GameEngine): Entity[] {
  return engine.store.entities().filter((entity) => isStorageEntity(entity));
}

/**
 * Whether a requester is allowed to take items out of an entity's inventory. A "locked chest"
 * (spec 018 FR-012) is a chest whose permission rules deny the requester `Retrieve`; there is no
 * other lock mechanic (DECISIONS D-09).
 *
 * @param engine - The engine.
 * @param entity - The storage entity.
 * @param requesterId - Who wants to take items, or null for the system.
 * @returns True when retrieving is allowed.
 */
export function canRetrieveFrom(
  engine: GameEngine,
  entity: Entity,
  requesterId: EntityId | null,
): boolean {
  const data = getComponent(entity, inventoryComponent);
  return (
    data !== undefined &&
    isOperationAllowed(
      { materials: engine.materials, actor: requesterId },
      data,
      InventoryOperation.Retrieve,
    )
  );
}

/**
 * Whether a requester may put items into an entity's inventory and the entity's filter accepts the
 * material (spec 018 FR-005).
 *
 * @param engine - The engine.
 * @param entity - The storage entity.
 * @param materialId - The material to deposit.
 * @param actorId - Who deposits, or null for the system.
 * @returns True when a deposit is allowed.
 */
export function canDepositInto(
  engine: GameEngine,
  entity: Entity,
  materialId: string,
  actorId: EntityId | null,
): boolean {
  const data = getComponent(entity, inventoryComponent);
  return (
    data !== undefined &&
    isOperationAllowed({ materials: engine.materials, actor: actorId }, data, InventoryOperation.Store) &&
    filterAccepts(engine.materials, effectiveFilter(engine, entity), materialId)
  );
}

/**
 * The stock of one material over all claimable storage (the query `stock`): `total` counts what
 * storage furniture and loose piles hold; construction sites, `queryable: false` inventories and
 * carried goods are not counted; `reserved` is the part held back by reservations; `free` is how
 * much more storage that accepts the material could take.
 *
 * @param engine - The engine.
 * @param materialId - Registered material id.
 * @returns Totals.
 */
export function stockOf(engine: GameEngine, materialId: string): StockSummary {
  engine.materials.require(materialId);
  const reservations = getStorageService(engine).reservations;
  let total = 0;
  let reserved = 0;
  let free = 0;
  for (const entity of listStorage(engine)) {
    total += getTotal(entity, materialId);
    reserved += reservations.reservedQuantity(entity.id, materialId);
    if (!isLoosePile(entity) && canDepositInto(engine, entity, materialId, null)) {
      free += canStore(engine.materials, entity, materialId, 1).maxFittable;
    }
  }
  return { materialId, total, reserved, available: total - reserved, free };
}

/**
 * The storages that can give a requester a material, nearest first (spec 018 FR-011/013): the
 * list covers the quantity from as many sources as needed (nearest first, ties lowest entity id);
 * each source offers what it holds minus what others reserved, and only storages the requester may
 * take from and can walk to on its own map are listed. When the stock is short the list holds
 * everything that exists, so the caller compares the sum with the request.
 *
 * @param engine - The engine.
 * @param requester - The entity that wants the goods; it needs a `Position`.
 * @param materialId - Registered material id.
 * @param quantity - Positive quantity wanted.
 * @returns The sources with the quantity each gives and their path cost.
 */
export function findSources(
  engine: GameEngine,
  requester: Entity,
  materialId: string,
  quantity: number,
): StockSource[] {
  const position = getComponent(requester, positionComponent);
  if (position === undefined) {
    return [];
  }
  const costs = new Map<number, number>();
  for (const reachable of getAiService(engine).pathfinding.reachable(
    position.mapId,
    position.cellIndex,
  )) {
    costs.set(reachable.cell, reachable.cost);
  }
  const reservations = getStorageService(engine).reservations;
  const candidates: StockSource[] = [];
  for (const entity of listStorage(engine)) {
    const place = getComponent(entity, positionComponent);
    const distance = place === undefined ? undefined : costs.get(place.cellIndex);
    const available = reservations.availableTo(entity.id, materialId, requester.id);
    if (
      place === undefined ||
      place.mapId !== position.mapId ||
      distance === undefined ||
      available < 1 ||
      !canRetrieveFrom(engine, entity, requester.id)
    ) {
      continue;
    }
    candidates.push({
      entityId: entity.id,
      quantity: available,
      distance,
      mapId: place.mapId,
      cellIndex: place.cellIndex,
    });
  }
  candidates.sort((left, right) =>
    left.distance === right.distance ? left.entityId - right.entityId : left.distance - right.distance,
  );
  const sources: StockSource[] = [];
  let missing = quantity;
  for (const candidate of candidates) {
    if (missing < 1) {
      break;
    }
    const taken = Math.min(candidate.quantity, missing);
    sources.push({ ...candidate, quantity: taken });
    missing -= taken;
  }
  return sources;
}
