/**
 * Largest integer whose square does not exceed `value` (Newton iteration, integers only).
 *
 * @param value - Non-negative safe integer.
 * @returns `floor(sqrt(value))`.
 */
export function integerSqrt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`integerSqrt needs a non-negative safe integer, got ${String(value)}`);
  }
  if (value < 2) {
    return value;
  }
  let guess = value;
  let next = Math.floor((guess + 1) / 2);
  while (next < guess) {
    guess = next;
    next = Math.floor((guess + Math.floor(value / guess)) / 2);
  }
  return guess;
}
