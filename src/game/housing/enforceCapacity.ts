import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { dwellingCapacity } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { clearHome } from "./household";
import { EvictionReason, residentEvictedEvent } from "./housingTypes";

/**
 * Takes a resident's home away and queues `housing.resident.evicted` (spec 029 FR-020).
 *
 * @param engine - The engine.
 * @param entityId - The citizen.
 * @param dwellingId - The dwelling it leaves.
 * @param reason - Why.
 */
export function evictResident(
  engine: GameEngine,
  entityId: EntityId,
  dwellingId: EntityId,
  reason: EvictionReason,
): void {
  clearHome(engine, entityId);
  engine.bus.emit(residentEvictedEvent, { dwellingId, entityId, reason });
}

/**
 * Orders residents for eviction: the latest `homeAssignedTick` first, ties broken by the higher
 * entity id (spec 029 FR-012).
 *
 * @param residents - The residents of one dwelling.
 * @returns A new list, first to evict first.
 */
export function evictionOrder(residents: readonly Entity[]): Entity[] {
  return [...residents].sort((left, right) => {
    const leftTick = getComponent(left, citizenComponent)?.homeAssignedTick ?? 0;
    const rightTick = getComponent(right, citizenComponent)?.homeAssignedTick ?? 0;
    return leftTick === rightTick ? right.id - left.id : rightTick - leftTick;
  });
}

/**
 * Step 4 of the daily evaluation (spec 029 FR-012, DECISIONS D-28: every evaluation, whether or
 * not the level changed): while a dwelling holds more residents than its capacity
 * (`min(level capacity, beds)`), the residents who moved in last are evicted with
 * `CapacityReduced`.
 *
 * @param engine - The engine.
 * @param record - The dwelling.
 * @param residents - Its current residents.
 * @returns The evicted citizen ids, in eviction order.
 */
export function enforceCapacity(
  engine: GameEngine,
  record: DwellingRecord,
  residents: readonly Entity[],
): EntityId[] {
  const excess = residents.length - dwellingCapacity(engine, record);
  if (excess <= 0) {
    return [];
  }
  const evicted = evictionOrder(residents)
    .slice(0, excess)
    .map((entity) => entity.id);
  for (const id of evicted) {
    evictResident(engine, id, record.entity.id, EvictionReason.CapacityReduced);
  }
  return evicted;
}
