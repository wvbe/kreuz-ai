import { describe, expect, it } from "vitest";
import { InvalidQuantityError } from "./InventoryError";
import { assertPositiveQuantity, combineMilli, floorDivide } from "./inventoryMath";

describe("assertPositiveQuantity", () => {
  it("accepts positive safe integers", () => {
    expect(() => assertPositiveQuantity(1)).not.toThrow();
    expect(() => assertPositiveQuantity(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it("rejects zero, negatives, fractions and non-finite values", () => {
    for (const bad of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
      expect(() => assertPositiveQuantity(bad)).toThrow(InvalidQuantityError);
    }
  });
});

describe("floorDivide", () => {
  it("floors exactly", () => {
    expect(floorDivide(7, 2)).toBe(3);
    expect(floorDivide(0, 5)).toBe(0);
    expect(floorDivide(999, 1000)).toBe(0);
    expect(floorDivide(5_000_000_000_001, 1000)).toBe(5_000_000_000);
  });
});

describe("combineMilli", () => {
  it("truncates a product with a permille multiplier", () => {
    expect(combineMilli(1000, 1000)).toBe(1000);
    expect(combineMilli(1000, 500)).toBe(500);
    expect(combineMilli(1000, 1500)).toBe(1500);
    expect(combineMilli(333, 500)).toBe(166);
  });

  it("keeps a minimum magnitude of 1 and returns 0 for zero factors", () => {
    expect(combineMilli(1, 1)).toBe(1);
    expect(combineMilli(0, 1000)).toBe(0);
    expect(combineMilli(1000, 0)).toBe(0);
  });

  it("keeps the sign", () => {
    expect(combineMilli(-1000, 500)).toBe(-500);
    expect(combineMilli(1000, -500)).toBe(-500);
    expect(combineMilli(-1000, -500)).toBe(500);
  });
});
