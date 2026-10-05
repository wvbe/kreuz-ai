import { getAiService } from "../ai/aiServiceRegistry";
import { getComponent, hasComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { canStore } from "../inventory/inventoryQueries";
import { positionComponent } from "../map/positionComponent";
import { skillLevel } from "../skills/skillLevels";
import { furnitureComponent } from "./furnitureComponent";
import { effectiveFilter, filterAccepts } from "./materialFilter";
import { canDepositInto, listStorage } from "./storageQueries";
import { stockpileComponent } from "./stockpileComponent";
import { getStorageService } from "./storageServiceRegistry";
import { affinityMinLevel } from "./storageTypes";

/**
 * The routing tiers of spec 018 FR-010; a lower number is tried first.
 */
export enum RouteTier {
  /**
   * A run with `deliverToZoneId`: storage inside that zone.
   */
  Zone = 0,
  /**
   * Storage in a zone whose skill affinity matches the hauler (skill level at least
   * `affinityMinLevel`, DECISIONS D-26); the zone needs no active effects.
   */
  Affinity = 1,
  /**
   * Storage with an own or default filter that accepts the material (even inside a stockpile).
   */
  Filtered = 2,
  /**
   * A stockpile without a matching filter that accepts everything.
   */
  Stockpile = 3,
  /**
   * Any other compatible furniture storage (never for currency, DECISIONS D-26).
   */
  Open = 4,
}

/**
 * Where goods are wanted: the hauler's position and what it carries.
 */
export type RouteRequest = {
  materialId: string;
  /**
   * Positive quantity to deliver (a destination needs room for at least one unit).
   */
  quantity: number;
  /**
   * The depositing actor (permission rules apply), or null for the system.
   */
  actorId: EntityId | null;
  mapId: number;
  /**
   * Cell the goods start from; distances are path costs from here.
   */
  fromCell: number;
  /**
   * Storages that must not be offered (a full one just visited).
   */
  excludeIds?: readonly EntityId[];
  /**
   * The zone a run must deliver to (`deliverToZoneId`, tier 0), or absent.
   */
  zoneId?: EntityId;
};

/**
 * One storage that could receive the goods, with its sort keys.
 */
export type StorageRoute = {
  entityId: EntityId;
  tier: RouteTier;
  /**
   * Stockpile priority (0 for storage that is not a stockpile).
   */
  priority: number;
  /**
   * Path cost from the start cell.
   */
  cost: number;
  /**
   * Units of the material that fit now.
   */
  free: number;
  mapId: number;
  cellIndex: number;
};

/**
 * Orders routes best first (spec 018 FR-010, DECISIONS D-26, plan 3.2): tier ascending (filter
 * match, then stockpile, then other storage), then stockpile priority descending, then path cost
 * ascending, then free capacity descending (more room is preferred), then entity id ascending.
 * The order is total, so there is no random tie-break.
 *
 * @param left - First route.
 * @param right - Second route.
 * @returns Negative when `left` is better.
 */
export function compareRoutes(left: StorageRoute, right: StorageRoute): number {
  if (left.tier !== right.tier) {
    return left.tier - right.tier;
  }
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  if (left.cost !== right.cost) {
    return left.cost - right.cost;
  }
  if (left.free !== right.free) {
    return right.free - left.free;
  }
  return left.entityId - right.entityId;
}

/**
 * Every storage that accepts the material now, best first. A storage qualifies when it is
 * claimable storage furniture (not a loose pile), is on the start map and reachable, the actor may
 * store into it, its filter accepts the material and at least one unit fits. Currency is never
 * routed to open storage (tier 4): only filtered or stockpile storage may take coins.
 *
 * @param engine - The engine.
 * @param request - Material, start position, actor and exclusions.
 * @returns Routes sorted by {@link compareRoutes}; empty when no storage qualifies.
 */
export function routeCandidates(engine: GameEngine, request: RouteRequest): StorageRoute[] {
  const costs = new Map<number, number>();
  for (const reachable of getAiService(engine).pathfinding.reachable(
    request.mapId,
    request.fromCell,
  )) {
    costs.set(reachable.cell, reachable.cost);
  }
  const isCurrency = request.materialId === engine.materials.currencyId;
  const service = getStorageService(engine);
  const actor = request.actorId === null ? undefined : engine.store.get(request.actorId);
  const routes: StorageRoute[] = [];
  for (const entity of listStorage(engine)) {
    const place = getComponent(entity, positionComponent);
    const stockpile = getComponent(entity, stockpileComponent);
    const cost = place === undefined ? undefined : costs.get(place.cellIndex);
    if (
      place === undefined ||
      place.mapId !== request.mapId ||
      cost === undefined ||
      !hasComponent(entity, furnitureComponent) ||
      request.excludeIds?.includes(entity.id) === true ||
      !canDepositInto(engine, entity, request.materialId, request.actorId)
    ) {
      continue;
    }
    const zone = service.zoneRouteAt(place.mapId, place.cellIndex);
    if (zone?.excluded === true) {
      continue;
    }
    const filter = effectiveFilter(engine, entity);
    const isStockpile = stockpile !== undefined || zone?.stockpile === true;
    const tier =
      request.zoneId !== undefined && zone?.zoneId === request.zoneId
        ? RouteTier.Zone
        : zone?.skillId !== null &&
            zone?.skillId !== undefined &&
            actor !== undefined &&
            skillLevel(actor, zone.skillId) >= affinityMinLevel
          ? RouteTier.Affinity
          : filter !== null && filterAccepts(engine.materials, filter, request.materialId)
            ? RouteTier.Filtered
            : isStockpile
              ? RouteTier.Stockpile
              : RouteTier.Open;
    const free = canStore(
      engine.materials,
      entity,
      request.materialId,
      request.quantity,
    ).maxFittable;
    if (free < 1 || (isCurrency && tier === RouteTier.Open)) {
      continue;
    }
    routes.push({
      entityId: entity.id,
      tier,
      priority: stockpile?.priority ?? 0,
      cost,
      free,
      mapId: place.mapId,
      cellIndex: place.cellIndex,
    });
  }
  return routes.sort(compareRoutes);
}

/**
 * The best storage for the goods, see {@link routeCandidates}.
 *
 * @param engine - The engine.
 * @param request - Material, start position, actor and exclusions.
 * @returns The best route, or null when nothing accepts the goods (spec 018 FR-015).
 */
export function chooseRoute(engine: GameEngine, request: RouteRequest): StorageRoute | null {
  return routeCandidates(engine, request)[0] ?? null;
}
