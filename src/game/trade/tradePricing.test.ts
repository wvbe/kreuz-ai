import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import {
  effectiveMultiplierPermille,
  minAcceptableMilli,
  permilleOne,
  scarcityPermille,
  traderBidCoins,
  traderCeilingCoins,
  valueOfItemsMilli,
  wholeCoins,
} from "./tradePricing";

// @covers 019:FR-006 019:FR-007 019:SC-004
describe("valueOfItemsMilli", () => {
  const materials = loadContent().materials;

  it("sums the plain material values in milli-coins", () => {
    expect(valueOfItemsMilli(materials, [{ materialId: "iron_ore", quantity: 3 }])).toBe(6000);
    expect(
      valueOfItemsMilli(materials, [
        { materialId: "nails", quantity: 10 },
        { materialId: "bread", quantity: 1 },
      ]),
    ).toBe(4000);
    expect(valueOfItemsMilli(materials, [])).toBe(0);
  });

  it("is null for an item without a value", () => {
    const coal = materials.require("coal");
    const before = coal.valueMilli;
    coal.valueMilli = undefined;
    const result = valueOfItemsMilli(materials, [{ materialId: "coal", quantity: 1 }]);
    coal.valueMilli = before;
    expect(result).toBeNull();
  });
});

describe("price formula table (spec 019 worked examples, D-12)", () => {
  // minAcceptable = ceil(value * multiplier * (1 + margin)); coins round up.
  it.each([
    // value coins, quantity, multiplier permille, margin permille, expected milli, expected coins
    [5, 2, 1000, 100, 11000, 11],
    [5, 2, 1500, 100, 16500, 17],
    [5, 2, 1000, 150, 11500, 12],
    [5, 2, 900, 100, 9900, 10],
    [2, 10, 1000, 100, 22000, 22],
    [6, 5, 1000, 100, 33000, 33],
    [1, 1, 1000, 100, 1100, 2],
    [0, 4, 1000, 100, 0, 0],
  ])(
    "value %i x %i at multiplier %i and margin %i asks %i milli = %i coins",
    (value, quantity, multiplier, margin, milli, coins) => {
      const asked = minAcceptableMilli(value * 1000 * quantity, multiplier, margin);
      expect(asked).toBe(milli);
      expect(wholeCoins(asked)).toBe(coins);
    },
  );

  it("accepts 12 coins and counters 9 coins at 11 (spec US4)", () => {
    const asked = minAcceptableMilli(10_000, 1000, 100);
    expect(12 * 1000 >= asked).toBe(true);
    expect(9 * 1000 >= asked).toBe(false);
    expect(wholeCoins(asked - 0)).toBe(11);
  });
});

describe("effectiveMultiplierPermille", () => {
  it("combines the seller multiplier, the agreement discount and the scarcity", () => {
    expect(effectiveMultiplierPermille(1000, 1000, 1000)).toBe(1000);
    expect(effectiveMultiplierPermille(1000, 900, 1000)).toBe(900);
    expect(effectiveMultiplierPermille(1500, 900, 1000)).toBe(1350);
    expect(effectiveMultiplierPermille(1000, 1000, 1200)).toBe(1200);
    expect(effectiveMultiplierPermille(1000, 900, 1200)).toBe(1080);
  });
});

describe("scarcityPermille", () => {
  it.each([
    [60, 60, 1000],
    [90, 60, 1000],
    [30, 60, 1100],
    [0, 60, 1200],
    [15, 60, 1150],
    [0, 0, 1000],
  ])("holding %i of a %i level adds up to 20%%: %i", (held, target, expected) => {
    expect(scarcityPermille(held, target, 200)).toBe(expected);
  });
});

describe("trader bids", () => {
  it("rounds the opening bid down and the ceiling up", () => {
    expect(traderBidCoins(20_000, 1150)).toBe(23);
    expect(traderBidCoins(2000, 1150)).toBe(2);
    expect(traderCeilingCoins(2000, 1250)).toBe(3);
    expect(traderCeilingCoins(20_000, 1250)).toBe(25);
    expect(traderCeilingCoins(0, 1250)).toBe(0);
  });

  it("uses permille one as the unit", () => {
    expect(permilleOne).toBe(1000);
  });
});
