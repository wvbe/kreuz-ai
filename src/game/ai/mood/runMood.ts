import { getComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import { truncDiv } from "../../engine/fixedPoint";
import type { GameEngine } from "../../engine/GameEngine";
import { moodNeedId } from "../../content/contentTypes";
import { needModifiers } from "../../skills/traitModifiers";
import { neutralMoodMilli } from "../aiTypes";
import { needsComponent } from "../needs/needsComponent";
import { moodComponent } from "./moodComponent";
import { activeInfluences, addMoodInfluence, moodTargetMilli, stepMood } from "./moodModel";

/**
 * Adds a mood influence to an entity (no-op without a `Mood` component).
 *
 * @param entity - Entity to influence.
 * @param source - Label of the cause, e.g. `consumed_hunger`.
 * @param deltaMilli - Signed milli-percent pushed onto the mood target.
 * @param untilTick - Last tick at which the influence counts.
 * @param tick - Current tick.
 */
export function addMoodInfluenceTo(
  entity: Entity,
  source: string,
  deltaMilli: number,
  untilTick: number,
  tick: number,
): void {
  const mood = getComponent(entity, moodComponent);
  if (mood !== undefined) {
    addMoodInfluence(mood, { source, deltaMilli, untilTick }, tick);
  }
}

/**
 * Updates the mood of one entity for a tick (spec 013 FR-004): drops expired influences, computes
 * the target (mean need level plus active influences plus the traits' mood bonus) and moves the
 * mood one smoothing step towards it. Mood therefore recovers towards what the entity's situation
 * deserves instead of jumping.
 *
 * @param engine - The engine (content constants and traits).
 * @param entity - Entity with a `Mood` component; others are ignored.
 * @param tick - Current tick.
 */
export function updateMood(engine: GameEngine, entity: Entity, tick: number): void {
  const mood = getComponent(entity, moodComponent);
  if (mood === undefined) {
    return;
  }
  mood.influences = activeInfluences(mood, tick);
  const values = getComponent(entity, needsComponent)?.values ?? [];
  const mean =
    values.length === 0
      ? neutralMoodMilli
      : truncDiv(
          values.reduce((sum, value) => sum + value.valueMilli, 0),
          values.length,
        );
  const influence = mood.influences.reduce((sum, item) => sum + item.deltaMilli, 0);
  const bonus = needModifiers(engine.content, entity, moodNeedId).moodBonusMilli;
  mood.valueMilli = stepMood(
    mood.valueMilli,
    moodTargetMilli(mean, influence, bonus),
    engine.content.constants.moodSmoothing,
  );
}
