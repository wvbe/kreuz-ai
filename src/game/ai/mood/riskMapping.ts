import { floorDiv } from "../../engine/fixedPoint";
import type { PrngStream } from "../../engine/Prng";

/**
 * Success chance of a risky action as a function of mood (spec 013 FR-005, DECISIONS D-04):
 * `p = clamp(200, 800, 200 + floor((mood - 10000) * 3 / 400))` in permille, mood in
 * milli-percent. Mood 10 percent gives 20 percent, 50 gives exactly 50 and 90 gives 80 (the
 * spec's `20 + (mood - 10) * 60 / 80`); outside 10..90 percent the result is clamped, never
 * extrapolated.
 *
 * @param moodMilli - Mood in milli-percent `0..100000`.
 * @returns Success probability in permille `200..800`.
 */
export function riskSuccessPermille(moodMilli: number): number {
  const mapped = 200 + floorDiv((moodMilli - 10_000) * 3, 400);
  return Math.min(800, Math.max(200, mapped));
}

/**
 * Rolls the outcome of a risky action for an entity in a given mood, with the `ai.risk` stream
 * the caller passes in (DECISIONS D-25).
 *
 * @param stream - The `ai.risk` stream.
 * @param moodMilli - Mood in milli-percent.
 * @returns True when the action succeeds.
 */
export function rollRisk(stream: PrngStream, moodMilli: number): boolean {
  return stream.chancePermille(riskSuccessPermille(moodMilli));
}
