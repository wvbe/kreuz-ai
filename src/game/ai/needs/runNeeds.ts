import { getComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { getAiService } from "../aiServiceRegistry";
import { entityDiedEvent, KnownNeed, maxMeterMilli, starvationCause } from "../aiTypes";
import type { EntityDied } from "../aiTypes";
import { updateMood } from "../mood/runMood";
import { getNeedValue } from "./needAccess";
import { clampMeter, decayAmountMilli } from "./needMath";
import { healthComponent } from "./healthComponent";
import { needsComponent } from "./needsComponent";

/**
 * Applies the health consequences of one tick (DECISIONS D-25): while hunger is zero health
 * falls by `starvationHealthPerTick`; when it reaches zero the entity dies (`entity.died` with
 * cause `Starvation`, deletion at slot 17). While no need is zero, health recovers by
 * `healthRegenPerTick`.
 *
 * @param engine - The engine.
 * @param entity - Entity with `Needs`; one without `Health` is unaffected.
 */
export function applyHealthConsequences(engine: GameEngine, entity: Entity): void {
  const health = getComponent(entity, healthComponent);
  if (health === undefined) {
    return;
  }
  const constants = engine.content.constants;
  if (getNeedValue(entity, KnownNeed.Hunger) === 0) {
    health.valueMilli = clampMeter(health.valueMilli - constants.starvationHealthPerTick);
    if (health.valueMilli === 0) {
      const payload: EntityDied = { entityId: entity.id, cause: starvationCause };
      engine.bus.emit(entityDiedEvent, payload);
      engine.store.requestDelete(entity.id);
    }
    return;
  }
  const anyZero = getComponent(entity, needsComponent)?.values.some(
    (value) => value.valueMilli === 0,
  );
  if (anyZero !== true && health.valueMilli < maxMeterMilli) {
    health.valueMilli = Math.min(maxMeterMilli, health.valueMilli + constants.healthRegenPerTick);
  }
}

/**
 * Slot 4 (needs and mood, DECISIONS section 2): for every entity with `Needs`, in ascending id,
 * decays each need (linear, scaled by the difficulty multiplier hook and the entity's trait
 * modifiers), applies starvation consequences and moves mood one step. Entities flagged for
 * deletion are skipped.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 */
export function runNeedsTick(engine: GameEngine, tick: number): void {
  const multiplier = getAiService(engine).needDecayMultiplierPermille();
  for (const entity of engine.store.entities()) {
    const needs = getComponent(entity, needsComponent);
    if (needs === undefined) {
      continue;
    }
    for (const value of needs.values) {
      const need = engine.content.needs.find(value.needId);
      if (need !== undefined) {
        value.valueMilli = clampMeter(
          value.valueMilli - decayAmountMilli(engine.content, entity, need, multiplier),
        );
      }
    }
    applyHealthConsequences(engine, entity);
    updateMood(engine, entity, tick);
  }
}
