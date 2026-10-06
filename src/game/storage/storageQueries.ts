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
 * The dwelling whose household owns a storage entity (spec 029 FR-017): the zone that covers its
 * cell when that zone is a dwelling (the routing hooks of the zones mark it `excluded`).
 *
 * @param engine - The engine.
 * @param entity - A storage entity.
 * @returns The dwelling zone id, or null for settlement storage.
 */
export function householdOwnerOf(engine: GameEngine, entity: Entity): EntityId | null {
  const place = getComponent(entity, positionComponent);
  const zone =
    place === undefined
      ? null
      : getStorageService(engine).zoneRouteAt(place.mapId, place.cellIndex);
  return zone !== null && zone.excluded ? zone.zoneId : null;
}

/**
 * All claimable settlement storage entities, ascending by id. Household storage (furniture on the
 * tiles of a dwelling, spec 029 FR-017) is reserved to the residents and is not settlement stock:
 * it is left out here (see {@link listStorageFor} for what one citizen may use).
 *
 * @param engine - The engine.
 * @returns Live entities for which {@link isStorageEntity} holds, outside every dwelling.
 */
export function listStorage(engine: GameEngine): Entity[] {
  return engine.store
    .entities()
    .filter((entity) => isStorageEntity(entity) && householdOwnerOf(engine, entity) === null);
}

/**
 * The storage a requester may take from: the settlement storage of {@link listStorage} plus the
 * household storage of the requester's own dwelling (spec 029 FR-017).
 *
 * @param engine - The engine.
 * @param requester - The entity that wants goods.
 * @param includeHousehold - False to leave the requester's own household storage out too (the
 *   fetch chore wants goods from elsewhere).
 * @returns Storage entities, ascending by id.
 */
export function listStorageFor(
  engine: GameEngine,
  requester: Entity,
  includeHousehold: boolean,
): Entity[] {
  const home = includeHousehold
    ? (getComponent(requester, citizenComponent)?.homeDwellingId ?? null)
    : null;
  return engine.store.entities().filter((entity) => {
    if (!isStorageEntity(entity)) {
      return false;
    }
    const owner = householdOwnerOf(engine, entity);
    return owner === null || owner === home;
  });
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
    isOperationAllowed(
      { materials: engine.materials, actor: actorId },
      data,
      InventoryOperation.Store,
    ) &&
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
 * everything that exists, so the caller compares the sum with the request. The requester's own
 * household storage counts (spec 029 FR-017) unless `includeHousehold` is false; other
 * households' storage never does.
 *
 * @param engine - The engine.
 * @param requester - The entity that wants the goods; it needs a `Position`.
 * @param materialId - Registered material id.
 * @param quantity - Positive quantity wanted.
 * @param includeHousehold - Whether the requester's own household storage may give (default true).
 * @returns The sources with the quantity each gives and their path cost.
 */
export function findSources(
  engine: GameEngine,
  requester: Entity,
  materialId: string,
  quantity: number,
  includeHousehold = true,
): StockSource[] {
  const position = getComponent(requester, positionComponent);
  if (position === undefined) {
    return [];
  }
  const reservations = getStorageService(engine).reservations;
  const holders: { entityId: EntityId; quantity: number; mapId: number; cellIndex: number }[] = [];
  for (const entity of listStorageFor(engine, requester, includeHousehold)) {
    const place = getComponent(entity, positionComponent);
    const available = reservations.availableTo(entity.id, materialId, requester.id);
    if (
      place !== undefined &&
      place.mapId === position.mapId &&
      available >= 1 &&
      canRetrieveFrom(engine, entity, requester.id)
    ) {
      holders.push({
        entityId: entity.id,
        quantity: available,
        mapId: place.mapId,
        cellIndex: place.cellIndex,
      });
    }
  }
  if (holders.length === 0) {
    // Nothing to walk to: skip the reachability search (hungry settlers ask every tick).
    return [];
  }
  const costs = new Map<number, number>();
  for (const reachable of getAiService(engine).pathfinding.reachable(
    position.mapId,
    position.cellIndex,
  )) {
    costs.set(reachable.cell, reachable.cost);
  }
  const candidates: StockSource[] = [];
  for (const holder of holders) {
    const distance = costs.get(holder.cellIndex);
    if (distance !== undefined) {
      candidates.push({ ...holder, distance });
    }
  }
  candidates.sort((left, right) =>
    left.distance === right.distance
      ? left.entityId - right.entityId
      : left.distance - right.distance,
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
