import { healthComponent } from "../ai/needs/healthComponent";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { animalComponent } from "./animalComponent";
import { animalDiedEvent, attackCooldownTicks } from "./faunaTypes";
import type { AnimalDeathCause, AnimalDied } from "./faunaTypes";

/**
 * Removes an animal from the world: emits `animal.died` and flags the entity for deletion (it
 * leaves at slot 17; its occupant cell, tasks and claims are cleaned by the delete hooks). Nothing
 * is dropped here: butchering and hunting pay their drops to the worker before they call this.
 *
 * @param engine - The engine.
 * @param entity - The animal; entities without `Animal` or already flagged are left alone.
 * @param cause - Why it leaves.
 * @returns True when the animal was removed.
 */
export function removeAnimal(engine: GameEngine, entity: Entity, cause: AnimalDeathCause): boolean {
  const animal = getComponent(entity, animalComponent);
  if (animal === undefined || engine.store.isPendingDelete(entity.id)) {
    return false;
  }
  const payload: AnimalDied = { entityId: entity.id, prototypeId: animal.prototypeId, cause };
  engine.bus.emit(animalDiedEvent, payload);
  engine.store.requestDelete(entity.id);
  return true;
}

/**
 * Whether the animal may attack at this tick (its cooldown is over).
 *
 * @param entity - The attacker.
 * @param tick - The current tick.
 * @returns True when ready; false for entities without `Animal`.
 */
export function canAttack(entity: Entity, tick: number): boolean {
  const animal = getComponent(entity, animalComponent);
  return animal !== undefined && tick >= animal.attackReadyTick;
}

/**
 * Starts the attack cooldown of an animal.
 *
 * @param entity - The attacker.
 * @param tick - The current tick.
 */
export function startAttackCooldown(entity: Entity, tick: number): void {
  const animal = getComponent(entity, animalComponent);
  if (animal !== undefined) {
    animal.attackReadyTick = tick + attackCooldownTicks;
  }
}

/**
 * Takes health off an entity, never below `floorMilli`.
 *
 * @param entity - The target; one without `Health` is unaffected.
 * @param damageMilli - Milli-percent to remove.
 * @param floorMilli - Lowest value the health may reach.
 * @returns The health left, or null when the target has no `Health`.
 */
export function damageHealth(
  entity: Entity,
  damageMilli: number,
  floorMilli: number,
): number | null {
  const health = getComponent(entity, healthComponent);
  if (health === undefined) {
    return null;
  }
  health.valueMilli = Math.max(
    Math.min(floorMilli, health.valueMilli),
    health.valueMilli - damageMilli,
  );
  return health.valueMilli;
}
