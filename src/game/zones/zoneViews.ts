import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { zoneAffinity, zoneWorkers } from "./zoneAffinity";
import { getZoneService } from "./zoneServiceRegistry";
import type { MergeOffer, ZoneView } from "./zoneTypes";

/**
 * One zone as a plain view (queries `zone` and `zone-at`), or null when it does not exist.
 *
 * @param engine - The engine.
 * @param zoneId - The zone id.
 * @returns A copy of the zone state with its affinity and workers.
 */
export function buildZoneView(engine: GameEngine, zoneId: EntityId): ZoneView | null {
  const zone = getZoneService(engine).getZone(zoneId);
  if (zone === null) {
    return null;
  }
  const { data } = zone;
  return {
    id: zone.entity.id,
    zoneTypeId: data.zoneTypeId,
    mapId: data.mapId,
    tiles: [...data.tiles],
    isRoom: data.isRoom,
    active: data.active,
    status: data.status,
    gaps: data.gaps.map((gap) => ({ ...gap })),
    filter:
      data.filter === null
        ? null
        : { categories: [...data.filter.categories], materialIds: [...data.filter.materialIds] },
    createdTick: data.createdTick,
    affinity: zoneAffinity(engine, zone.entity.id),
    workers: zoneWorkers(engine, zone.entity.id),
  };
}

/**
 * All zones, ascending by id (query `zones`), optionally of one map.
 *
 * @param engine - The engine.
 * @param mapId - Only zones of this map, or absent for all.
 * @returns The views.
 */
export function buildZoneViews(engine: GameEngine, mapId?: number): ZoneView[] {
  const views: ZoneView[] = [];
  for (const entity of getZoneService(engine).zones()) {
    const view = buildZoneView(engine, entity.id);
    if (view !== null && (mapId === undefined || view.mapId === mapId)) {
      views.push(view);
    }
  }
  return views;
}

/**
 * The merge offers in force (query `zone-merge-offers`).
 *
 * @param engine - The engine.
 * @returns Copies of the offers, ascending by offer id.
 */
export function buildMergeOffers(engine: GameEngine): MergeOffer[] {
  return getZoneService(engine).mergeOffers();
}
