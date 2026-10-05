import { InvalidQuantityError } from "./InventoryError";

/**
 * Throws {@link InvalidQuantityError} unless the value is a positive safe integer.
 *
 * @param quantity - Candidate quantity or amount.
 */
export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new InvalidQuantityError(quantity);
  }
}

/**
 * Exact floor division of non-negative safe integers (no float rounding of state values).
 *
 * @param dividend - Non-negative safe integer.
 * @param divisor - Positive safe integer.
 * @returns `floor(dividend / divisor)`.
 */
export function floorDivide(dividend: number, divisor: number): number {
  return (dividend - (dividend % divisor)) / divisor;
}

/**
 * Combines two permille multipliers (spec 027 FR-014): `sign * trunc(|b| * m / 1000)` with a
 * minimum magnitude of 1 unless either factor is zero.
 *
 * @param baseMilli - Base value in milli units.
 * @param multiplierMilli - Multiplier in permille (1000 = 1.0).
 * @returns The scaled integer.
 */
export function combineMilli(baseMilli: number, multiplierMilli: number): number {
  if (baseMilli === 0 || multiplierMilli === 0) {
    return 0;
  }
  const sign = baseMilli < 0 !== multiplierMilli < 0 ? -1 : 1;
  const scaled = floorDivide(Math.abs(baseMilli) * Math.abs(multiplierMilli), 1000);
  return sign * Math.max(1, scaled);
}
