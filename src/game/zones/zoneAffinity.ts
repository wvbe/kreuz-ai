import { citizenComponent } from "../factions/citizenComponent";
import { hasComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { affinityScore } from "../skills/affinityScore";
import { getZoneService } from "./zoneServiceRegistry";

/**
 * The citizens standing on the tiles of a zone (its members and workers), ascending by id.
 *
 * @param engine - The engine.
 * @param zoneId - The zone; an unknown id gives no workers.
 * @returns Entity ids.
 */
export function zoneWorkers(engine: GameEngine, zoneId: EntityId): EntityId[] {
  const zone = getZoneService(engine).getZone(zoneId);
  if (zone === null) {
    return [];
  }
  const workers: EntityId[] = [];
  for (const tile of zone.data.tiles) {
    for (const id of engine.maps.occupants.occupantsOf(zone.data.mapId, tile)) {
      const entity = engine.store.get(id);
      if (entity !== undefined && hasComponent(entity, citizenComponent)) {
        workers.push(id);
      }
    }
  }
  return workers.sort((left, right) => left - right);
}

/**
 * The skill affinity a zone exposes (spec 015 FR-011, DECISIONS D-43): the best familiarity bucket
 * `0..10` among its workers in the skill of the zone type (`skillAffinityId`); 0 for a zone type
 * without an affinity skill or without workers. Haulers use the zone's skill through the routing
 * tier 1 of `storageRouting` (level at least `affinityMinLevel`), this number is for display and
 * for systems that pick a worker for a zone.
 *
 * @param engine - The engine.
 * @param zoneId - The zone.
 * @returns The bucket.
 */
export function zoneAffinity(engine: GameEngine, zoneId: EntityId): number {
  const zone = getZoneService(engine).getZone(zoneId);
  const skillId =
    zone === null ? undefined : engine.content.zones.find(zone.data.zoneTypeId)?.skillAffinityId;
  if (skillId === undefined) {
    return 0;
  }
  let best = 0;
  for (const id of zoneWorkers(engine, zoneId)) {
    const worker = engine.store.get(id);
    if (worker !== undefined) {
      best = Math.max(best, affinityScore(worker, [skillId]));
    }
  }
  return best;
}
