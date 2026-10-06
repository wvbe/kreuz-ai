import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { isMember } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { residentAssignedEvent } from "./housingTypes";

/**
 * Whether a citizen can have a home (spec 029 FR-005, DECISIONS D-28): it is an adult humanoid
 * (a `Citizen` with a task queue; there is no ageing in v1, so every such citizen is an adult)
 * and a member of the player's government faction.
 *
 * @param engine - The engine.
 * @param entity - Any entity.
 * @returns True when the entity can be housed.
 */
export function isEligibleResident(engine: GameEngine, entity: Entity): boolean {
  const government = governmentFactionId(engine);
  return (
    government !== null &&
    !engine.store.isPendingDelete(entity.id) &&
    hasComponent(entity, citizenComponent) &&
    hasComponent(entity, taskQueueComponent) &&
    isMember(engine, entity.id, government)
  );
}

/**
 * The residents of every dwelling, derived from `Citizen.homeDwellingId`; each list ascends by
 * entity id.
 *
 * @param engine - The engine.
 * @returns A map from dwelling id to its residents.
 */
export function residentsByDwelling(engine: GameEngine): Map<EntityId, Entity[]> {
  const residents = new Map<EntityId, Entity[]>();
  for (const entity of engine.store.entities()) {
    const home = getComponent(entity, citizenComponent)?.homeDwellingId ?? null;
    if (home !== null && !engine.store.isPendingDelete(entity.id)) {
      const list = residents.get(home) ?? [];
      list.push(entity);
      residents.set(home, list);
    }
  }
  return residents;
}

/**
 * The residents of one dwelling, ascending by entity id.
 *
 * @param engine - The engine.
 * @param dwellingId - A zone entity id.
 * @returns The citizens whose home it is.
 */
export function residentsOf(engine: GameEngine, dwellingId: EntityId): Entity[] {
  return residentsByDwelling(engine).get(dwellingId) ?? [];
}

/**
 * The eligible citizens without a home, ascending by entity id.
 *
 * @param engine - The engine.
 * @returns The homeless.
 */
export function homelessCitizens(engine: GameEngine): Entity[] {
  return engine.store
    .entities()
    .filter(
      (entity) =>
        getComponent(entity, citizenComponent)?.homeDwellingId === null &&
        isEligibleResident(engine, entity),
    );
}

/**
 * Gives a citizen a home and queues `housing.resident.assigned` (spec 029 FR-014).
 *
 * @param engine - The engine.
 * @param entityId - The citizen.
 * @param dwellingId - The dwelling zone.
 * @param tick - The tick that becomes `homeAssignedTick`.
 */
export function assignHome(
  engine: GameEngine,
  entityId: EntityId,
  dwellingId: EntityId,
  tick: number,
): void {
  const citizen = getComponent(engine.store.require(entityId), citizenComponent);
  if (citizen === undefined) {
    return;
  }
  citizen.homeDwellingId = dwellingId;
  citizen.homeAssignedTick = tick;
  engine.bus.emit(residentAssignedEvent, { dwellingId, entityId });
}

/**
 * Clears a citizen's home (no event; evictions announce themselves).
 *
 * @param engine - The engine.
 * @param entityId - The citizen.
 */
export function clearHome(engine: GameEngine, entityId: EntityId): void {
  const citizen = getComponent(engine.store.require(entityId), citizenComponent);
  if (citizen !== undefined) {
    citizen.homeDwellingId = null;
    citizen.homeAssignedTick = 0;
  }
}
