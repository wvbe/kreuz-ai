import { AiTaskPriority, AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { hasComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { joinFaction } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { assignIdentity } from "../identity/assignIdentity";
import { initializeCharacter } from "../skills/traitAssignment";
import { findArrivalCell } from "./arrivalCell";
import { levelDefinition } from "./dwellingLevels";
import { assignHome } from "./household";
import { getHousingService } from "./housingServiceRegistry";
import type { FreeDwelling } from "./houseHomeless";
import { housingStreamName, immigrantArrivedEvent, immigrationBlockedEvent } from "./housingTypes";

/**
 * Spawns one settler on a cell: the prototype, its place on the map, traits and starting skills,
 * membership of the government faction and a name (the sequence of the starting settlers, so the
 * identity of an arrival is drawn exactly like theirs).
 *
 * @param engine - The engine.
 * @param prototypeId - A humanoid prototype id.
 * @param mapId - Map of the arrival cell.
 * @param cellIndex - The arrival cell.
 * @returns The new entity id.
 */
export function spawnArrival(
  engine: GameEngine,
  prototypeId: string,
  mapId: number,
  cellIndex: number,
): EntityId {
  const entity = engine.store.spawn(prototypeId, { Position: { mapId, cellIndex } });
  engine.maps.placeEntity(entity.id, mapId, cellIndex);
  initializeCharacter(engine, entity.id);
  const government = governmentFactionId(engine);
  if (hasComponent(entity, citizenComponent) && government !== null) {
    joinFaction(engine, entity.id, government);
    assignIdentity(engine, entity.id);
  }
  return entity.id;
}

/**
 * Step 7 of the daily evaluation (spec 029 FR-015, DECISIONS D-17 and D-28): after the homeless
 * have been housed, `min(free slots, maxImmigrantsPerDay)` settlers arrive. Each takes the next
 * free slot in assignment order (highest level, lowest zone id); its prototype is drawn from that
 * level's `immigrantPrototypes` by weight on the stream `housing.immigration`; it appears on the
 * arrival cell (the border cell nearest the throne room), joins the government, is named, gets
 * its home at once (`homeAssignedTick` is the spawn tick) and starts walking to the dwelling.
 * `housing.immigrant.arrived` is queued for each (a Minor moment for the chronicle, not a Major
 * one). Without a seat of government or an arrival cell nobody comes and
 * `housing.immigration.blocked {reason}` is queued once.
 *
 * @param engine - The engine.
 * @param free - The dwellings that still have room after step 6 (their `free` counts are used up).
 * @param tick - The tick being processed.
 * @returns The ids of the settlers that arrived.
 */
export function admitSettlers(engine: GameEngine, free: FreeDwelling[], tick: number): EntityId[] {
  const slots = free.reduce((sum, entry) => sum + entry.free, 0);
  const count = Math.min(slots, engine.content.constants.maxImmigrantsPerDay);
  const service = getHousingService(engine);
  if (count < 1) {
    service.setBlocked(null);
    return [];
  }
  const arrival = findArrivalCell(engine);
  service.setBlocked(arrival.blocked);
  if (arrival.cell === null) {
    engine.bus.emit(immigrationBlockedEvent, { reason: arrival.blocked });
    return [];
  }
  const stream = engine.prng.stream(housingStreamName);
  const arrived: EntityId[] = [];
  for (let index = 0; index < count; index += 1) {
    const target = free.find((entry) => entry.free > 0);
    if (target === undefined) {
      break;
    }
    const options = levelDefinition(
      engine,
      target.record.dwelling.level,
    ).immigrantPrototypes.filter((option) => engine.prototypes.has(option.prototypeId));
    if (options.length === 0) {
      target.free = 0;
      continue;
    }
    const prototypeId = stream.weighted(
      options.map((option) => option.prototypeId),
      options.map((option) => option.weight),
    );
    const entityId = spawnArrival(engine, prototypeId, arrival.cell.mapId, arrival.cell.cellIndex);
    const dwellingId = target.record.entity.id;
    assignHome(engine, entityId, dwellingId, tick);
    target.free -= 1;
    const home = target.record.zone.tiles[0];
    if (home !== undefined && home !== arrival.cell.cellIndex) {
      engine.tasks.enqueue(entityId, {
        type: AiTaskType.Move,
        data: moveTaskData(target.record.zone.mapId, home),
        priority: AiTaskPriority.Idle,
      });
    }
    engine.bus.emit(immigrantArrivedEvent, { entityId, prototypeId, dwellingId });
    arrived.push(entityId);
  }
  return arrived;
}
