import { describe, expect, it } from "vitest";
import {
  FixedPointError,
  FixedUnit,
  ceilDiv,
  decimalToFixed,
  fixedPointSchema,
  floorDiv,
  truncDiv,
  unitDigits,
} from "./fixedPoint";

describe("unitDigits", () => {
  it("keeps 0 digits for integers and 3 for milli and permille", () => {
    expect(unitDigits(FixedUnit.Int)).toBe(0);
    expect(unitDigits(FixedUnit.Milli)).toBe(3);
    expect(unitDigits(FixedUnit.Permille)).toBe(3);
  });
});

describe("decimalToFixed", () => {
  it("scales authored decimals exactly", () => {
    expect(decimalToFixed(0.5, FixedUnit.Milli)).toBe(500);
    expect(decimalToFixed(200, FixedUnit.Milli)).toBe(200000);
    expect(decimalToFixed(1.5, FixedUnit.Permille)).toBe(1500);
    expect(decimalToFixed(0.001, FixedUnit.Milli)).toBe(1);
    expect(decimalToFixed(-2.25, FixedUnit.Milli)).toBe(-2250);
    expect(decimalToFixed(7, FixedUnit.Int)).toBe(7);
  });

  it("is immune to float noise", () => {
    expect(decimalToFixed(1.005, FixedUnit.Milli)).toBe(1005);
    expect(decimalToFixed(4.35, FixedUnit.Milli)).toBe(4350);
    expect(decimalToFixed(1.1, FixedUnit.Milli)).toBe(1100);
  });

  it("handles exponent notation and negative zero", () => {
    expect(decimalToFixed(1e-3, FixedUnit.Milli)).toBe(1);
    expect(decimalToFixed(1e6, FixedUnit.Int)).toBe(1000000);
    expect(Object.is(decimalToFixed(-0, FixedUnit.Milli), 0)).toBe(true);
  });

  it("rejects values that would need rounding", () => {
    expect(() => decimalToFixed(0.0005, FixedUnit.Milli)).toThrow(FixedPointError);
    expect(() => decimalToFixed(1.5, FixedUnit.Int)).toThrow(/more than 0/);
    expect(() => decimalToFixed(1e-7, FixedUnit.Milli)).toThrow(FixedPointError);
  });

  it("rejects non-finite and unsafe values", () => {
    expect(() => decimalToFixed(Number.NaN, FixedUnit.Milli)).toThrow(FixedPointError);
    expect(() => decimalToFixed(Number.POSITIVE_INFINITY, FixedUnit.Int)).toThrow(FixedPointError);
    expect(() => decimalToFixed(1e300, FixedUnit.Milli)).toThrow(/too large/);
  });
});

describe("fixedPointSchema", () => {
  it("converts valid decimals and reports unrepresentable ones as issues", () => {
    const schema = fixedPointSchema(FixedUnit.Milli);
    expect(schema.parse(0.25)).toBe(250);
    expect(schema.safeParse(0.0001).success).toBe(false);
    expect(schema.safeParse("x").success).toBe(false);
  });
});

describe("integer division helpers", () => {
  it("floors, ceils and truncates", () => {
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(7, 2)).toBe(3);
    expect(ceilDiv(7, 2)).toBe(4);
    expect(ceilDiv(-7, 2)).toBe(-3);
    expect(truncDiv(-7, 2)).toBe(-3);
    expect(Object.is(truncDiv(-1, 2), 0)).toBe(true);
    expect(Object.is(ceilDiv(-1, 2), 0)).toBe(true);
  });

  it("rejects zero and non-integer divisors", () => {
    expect(() => floorDiv(1, 0)).toThrow(FixedPointError);
    expect(() => ceilDiv(1, 0.5)).toThrow(FixedPointError);
    expect(() => truncDiv(1, 0)).toThrow(FixedPointError);
  });
});
