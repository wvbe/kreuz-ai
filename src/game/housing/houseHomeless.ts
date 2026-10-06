import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { dwellingCapacity } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { levelRank } from "./dwellingLevels";
import { assignHome } from "./household";

/**
 * One dwelling with room, in the order the homeless and the settlers fill them.
 */
export type FreeDwelling = {
  record: DwellingRecord;
  free: number;
};

/**
 * The active dwellings with free capacity in assignment order: highest level first, ties by
 * ascending zone entity id (spec 029 FR-014).
 *
 * @param engine - The engine.
 * @param dwellings - All dwellings.
 * @param residents - The residents of each dwelling.
 * @returns Dwellings with their free slots.
 */
export function freeDwellings(
  engine: GameEngine,
  dwellings: readonly DwellingRecord[],
  residents: ReadonlyMap<EntityId, readonly Entity[]>,
): FreeDwelling[] {
  return dwellings
    .filter((record) => record.zone.active)
    .map((record) => ({
      record,
      free: dwellingCapacity(engine, record) - (residents.get(record.entity.id)?.length ?? 0),
    }))
    .filter((entry) => entry.free > 0)
    .sort((left, right) =>
      left.record.dwelling.level === right.record.dwelling.level
        ? left.record.entity.id - right.record.entity.id
        : levelRank(right.record.dwelling.level) - levelRank(left.record.dwelling.level),
    );
}

/**
 * Step 6 of the daily evaluation (spec 029 FR-014): the homeless citizens, in ascending id order,
 * each move into the first dwelling of {@link freeDwellings} that still has room (the highest
 * level, then the lowest zone id). Each assignment sets the home and queues
 * `housing.resident.assigned`.
 *
 * @param engine - The engine.
 * @param free - The dwellings with room; their `free` counts are used up by the assignments.
 * @param homeless - The homeless citizens, ascending by id.
 * @param tick - The tick that becomes `homeAssignedTick`.
 * @returns The ids of the citizens that got a home.
 */
export function houseHomeless(
  engine: GameEngine,
  free: FreeDwelling[],
  homeless: readonly Entity[],
  tick: number,
): EntityId[] {
  const housed: EntityId[] = [];
  for (const citizen of homeless) {
    const target = free.find((entry) => entry.free > 0);
    if (target === undefined) {
      break;
    }
    assignHome(engine, citizen.id, target.record.entity.id, tick);
    target.free -= 1;
    housed.push(citizen.id);
  }
  return housed;
}
