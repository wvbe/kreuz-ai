import { describe, expect, it } from "vitest";
import { collectRent, splitRent } from "./collectRent";
import { dwellingOf } from "./dwellingZones";
import { assignHome } from "./household";
import { residentsOf } from "./household";
import { contentWithLevels, createHousingWorld } from "./testHousingWorld";

describe("splitRent", () => {
  it.each([
    [[1, 5], 2, [1, 1]],
    [[0, 5], 2, [0, 2]],
    [[5, 5], 3, [2, 1]],
    [[1, 0], 2, [1, 0]],
    [[3, 3, 3], 7, [3, 2, 2]],
    [[], 4, []],
    [[2, 2], 0, [0, 0]],
  ])("balances %j for rent %i", (balances, rent, expected) => {
    expect(splitRent(balances, rent)).toEqual(expected);
  });
});

describe("collectRent", () => {
  const options = { width: 16, height: 12 };

  it("does nothing for a level without rent", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const settler = world.settler(170);
    assignHome(world.engine, settler.id, zone, 0);
    world.give(settler, world.engine.materials.currencyId, 5);
    const record = dwellingOf(world.engine, zone);
    const before = world.treasury();
    expect(collectRent(world.engine, record ?? fail(), residentsOf(world.engine, zone))).toBe(0);
    expect(world.treasury()).toBe(before);
    expect(world.coins(settler.id)).toBe(5);
  });

  // @covers 029:FR-013
  it("moves the coins from the residents to the treasury and returns the total", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({ hovel: { rentPerDay: 3 } }),
    });
    const zone = world.dwelling(2, 2, { beds: 2 });
    const [first, second] = [world.settler(170), world.settler(171)];
    assignHome(world.engine, first.id, zone, 0);
    assignHome(world.engine, second.id, zone, 0);
    world.give(first, world.engine.materials.currencyId, 1);
    world.give(second, world.engine.materials.currencyId, 9);
    const record = dwellingOf(world.engine, zone);
    const before = world.treasury();
    const paid = collectRent(world.engine, record ?? fail(), residentsOf(world.engine, zone));
    expect(paid).toBe(3);
    expect(world.treasury()).toBe(before + 3);
    expect(world.coins(first.id)).toBe(0);
    expect(world.coins(second.id)).toBe(7);
  });
});

function fail(): never {
  throw new Error("no dwelling");
}
