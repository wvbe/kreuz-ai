import { z } from "zod";

/**
 * Fixed-point units of DECISIONS D-04. Authored content may use decimals; state only ever holds
 * the integer produced here (Constitution II, spec 006 FR-014).
 */
export enum FixedUnit {
  /**
   * Plain integer; no fractional part allowed.
   */
  Int = "int",
  /**
   * Scale 1000 ("milli-units"), e.g. weights and perishable timers.
   */
  Milli = "milli",
  /**
   * Scale 1000 as a ratio, 1000 = 1.0 (multipliers, probabilities).
   */
  Permille = "permille",
}

/**
 * Thrown when a decimal cannot be converted to an exact fixed-point integer.
 */
export class FixedPointError extends Error {
  /**
   * Creates a fixed-point error.
   *
   * @param message - Description naming the offending value.
   */
  constructor(message: string) {
    super(message);
    this.name = "FixedPointError";
  }
}

/**
 * Number of decimal digits a unit keeps.
 *
 * @param unit - Fixed-point unit.
 * @returns 0 for `Int`, 3 otherwise.
 */
export function unitDigits(unit: FixedUnit): number {
  return unit === FixedUnit.Int ? 0 : 3;
}

const decimalPattern = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/;

/**
 * Converts an authored decimal to a fixed-point integer exactly, using the shortest decimal text
 * of the number so that float noise never leaks in. Values that need more fractional digits than
 * the unit keeps are rejected, never rounded.
 *
 * @param value - Authored number, e.g. `0.5` or `200`.
 * @param unit - Target unit.
 * @returns The scaled safe integer (`0.5` as `Milli` is `500`; `-0` becomes `0`).
 */
export function decimalToFixed(value: number, unit: FixedUnit): number {
  if (!Number.isFinite(value)) {
    throw new FixedPointError(`cannot convert ${String(value)} to fixed point`);
  }
  const match = decimalPattern.exec(String(value));
  if (!match) {
    throw new FixedPointError(`cannot read ${String(value)} as a decimal`);
  }
  const negative = match[1] === "-";
  const whole = match[2] ?? "0";
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  const digits = whole + fraction;
  const pointAt = whole.length + exponent;
  const keep = unitDigits(unit);
  const padded =
    pointAt < 0 ? "0".repeat(-pointAt) + digits : digits.padEnd(Math.max(pointAt, 0), "0");
  const integerLength = Math.max(pointAt, 0);
  const integerPart = padded.slice(0, integerLength) || "0";
  const fractionPart = padded.slice(integerLength);
  if (/[1-9]/.test(fractionPart.slice(keep))) {
    throw new FixedPointError(
      `${String(value)} needs more than ${keep} decimal digits for unit "${unit}"`,
    );
  }
  const scaled = Number(integerPart + fractionPart.slice(0, keep).padEnd(keep, "0"));
  if (!Number.isSafeInteger(scaled)) {
    throw new FixedPointError(`${String(value)} is too large for unit "${unit}"`);
  }
  return scaled === 0 || !negative ? scaled : -scaled;
}

/**
 * Zod schema for an authored decimal field that becomes a fixed-point integer at load.
 *
 * @param unit - Unit declared for the field.
 * @returns A schema from number to scaled integer; unrepresentable values become issues.
 */
export function fixedPointSchema(unit: FixedUnit): z.ZodType<number, number> {
  return z.number().transform((value, context) => {
    try {
      return decimalToFixed(value, unit);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "invalid decimal",
      });
      return z.NEVER;
    }
  });
}

/**
 * Integer division rounding toward negative infinity.
 *
 * @param numerator - Integer numerator.
 * @param denominator - Non-zero integer denominator.
 * @returns The floored quotient.
 */
export function floorDiv(numerator: number, denominator: number): number {
  assertDivisor(denominator);
  return Math.floor(numerator / denominator);
}

/**
 * Integer division rounding toward positive infinity.
 *
 * @param numerator - Integer numerator.
 * @param denominator - Non-zero integer denominator.
 * @returns The ceiled quotient (never `-0`).
 */
export function ceilDiv(numerator: number, denominator: number): number {
  assertDivisor(denominator);
  return Math.ceil(numerator / denominator) + 0;
}

/**
 * Integer division rounding toward zero.
 *
 * @param numerator - Integer numerator.
 * @param denominator - Non-zero integer denominator.
 * @returns The truncated quotient (never `-0`).
 */
export function truncDiv(numerator: number, denominator: number): number {
  assertDivisor(denominator);
  return Math.trunc(numerator / denominator) + 0;
}

function assertDivisor(denominator: number): void {
  if (!Number.isInteger(denominator) || denominator === 0) {
    throw new FixedPointError(`divisor must be a non-zero integer, got ${String(denominator)}`);
  }
}
