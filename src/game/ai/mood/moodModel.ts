import { truncDiv } from "../../engine/fixedPoint";
import { maxMoodInfluences } from "../aiTypes";
import type { MoodData, MoodInfluence } from "../aiTypes";
import { clampMeter } from "../needs/needMath";

/**
 * The influences of a mood that still count at a tick (`untilTick` not passed).
 *
 * @param mood - Mood data.
 * @param tick - Current tick.
 * @returns The active influences, oldest first.
 */
export function activeInfluences(mood: MoodData, tick: number): MoodInfluence[] {
  return mood.influences.filter((influence) => influence.untilTick >= tick);
}

/**
 * The level mood is pulled towards (spec 013 FR-004): the mean need satisfaction plus the sum of
 * the active influences plus the trait mood bonus, clamped to `0..100000`.
 *
 * @param meanNeedMilli - Mean level of all needs (milli-percent), 50000 when there are none.
 * @param influenceSumMilli - Sum of the active influence deltas.
 * @param traitBonusMilli - Sum of the traits' `moodBonus`.
 * @returns Target mood in milli-percent.
 */
export function moodTargetMilli(
  meanNeedMilli: number,
  influenceSumMilli: number,
  traitBonusMilli: number,
): number {
  return clampMeter(meanNeedMilli + influenceSumMilli + traitBonusMilli);
}

/**
 * Moves mood one tick towards its target: a `smoothingPermille` share of the gap, at least one
 * unit while a gap remains, so mood always converges and never overshoots.
 *
 * @param currentMilli - Current mood.
 * @param targetMilli - Target mood.
 * @param smoothingPermille - Share of the gap closed per tick (`moodSmoothing`).
 * @returns The new mood in milli-percent.
 */
export function stepMood(
  currentMilli: number,
  targetMilli: number,
  smoothingPermille: number,
): number {
  const gap = targetMilli - currentMilli;
  if (gap === 0) {
    return currentMilli;
  }
  const share = truncDiv(gap * smoothingPermille, 1000);
  const step = share === 0 ? Math.sign(gap) : share;
  return clampMeter(currentMilli + step);
}

/**
 * Records a new influence on a mood. Expired influences are dropped first; when the list is still
 * full the oldest influence makes room (cap {@link maxMoodInfluences}, DECISIONS D-25).
 *
 * @param mood - Mood data, changed in place.
 * @param influence - The influence to add.
 * @param tick - Current tick.
 */
export function addMoodInfluence(mood: MoodData, influence: MoodInfluence, tick: number): void {
  const kept = activeInfluences(mood, tick);
  kept.push({ ...influence });
  mood.influences = kept.slice(Math.max(0, kept.length - maxMoodInfluences));
}
