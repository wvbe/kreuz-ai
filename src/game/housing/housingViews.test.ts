import { describe, expect, it } from "vitest";
import { DwellingLevel } from "../content/contentTypes";
import { assignHome } from "./household";
import {
  buildDwellingSummaries,
  buildDwellingView,
  buildHousingTotals,
  countDwellingsAtOrAbove,
} from "./housingViews";
import { createHousingWorld } from "./testHousingWorld";

const options = { width: 20, height: 12 };

describe("countDwellingsAtOrAbove", () => {
  it("counts active dwellings at or above a level (FR-019)", () => {
    const world = createHousingWorld(options);
    const first = world.dwelling(1, 2);
    const second = world.dwelling(6, 2);
    world.dwelling(11, 2);
    world.setLevel(first, DwellingLevel.Cottage);
    world.setLevel(second, DwellingLevel.TimberFramedHouse);
    expect(countDwellingsAtOrAbove(world.engine, DwellingLevel.Hovel)).toBe(3);
    expect(countDwellingsAtOrAbove(world.engine, DwellingLevel.Cottage)).toBe(2);
    expect(countDwellingsAtOrAbove(world.engine, DwellingLevel.TimberFramedHouse)).toBe(1);
    expect(countDwellingsAtOrAbove(world.engine, DwellingLevel.BurgherHouse)).toBe(0);
  });

  it("does not count an inactive dwelling", () => {
    const world = createHousingWorld(options);
    world.dwelling(1, 2);
    const door = world.engine.store.entities().find((entity) => entity.prototype === "door");
    world.engine.store.requestDelete(door?.id ?? 0);
    world.run(2);
    expect(countDwellingsAtOrAbove(world.engine, DwellingLevel.Hovel)).toBe(0);
  });
});

describe("buildDwellingSummaries", () => {
  it("lists level, capacity, residents, rent and streaks", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(1, 2, { beds: 2 });
    const settler = world.settler(200);
    assignHome(world.engine, settler.id, zone, 1);
    expect(buildDwellingSummaries(world.engine)).toEqual([
      {
        id: zone,
        level: "hovel",
        active: true,
        capacity: 2,
        residents: [settler.id],
        rentPerDay: 0,
        upgradeStreak: 0,
        downgradeStreak: 0,
        tiles: 4,
      },
    ]);
  });
});

describe("buildDwellingView", () => {
  it("shows the requirements of the current and the next level with the streaks (US6)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(1, 2, { beds: 2 });
    const view = buildDwellingView(world.engine, zone);
    expect(view).toMatchObject({
      id: zone,
      nextLevel: "cottage",
      hasStorage: false,
      upgradeGraceDays: 3,
      downgradeGraceDays: 7,
      foods: [],
    });
    expect(view?.current.met).toBe(true);
    expect(view?.next?.met).toBe(false);
    expect(
      view?.next?.requirements.filter((entry) => !entry.met).map((entry) => entry.kind),
    ).toEqual(["MinTiles", "FoodVariety", "SuppliedGood", "TierUnlocked"]);
  });

  it("has no next level at the top and is null for other entities", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(1, 2, { beds: 2 });
    world.setLevel(zone, DwellingLevel.BurgherHouse);
    expect(buildDwellingView(world.engine, zone)?.next).toBeNull();
    expect(buildDwellingView(world.engine, zone)?.nextLevel).toBeNull();
    expect(buildDwellingView(world.engine, 1)).toBeNull();
  });
});

describe("buildHousingTotals", () => {
  it("counts housed, homeless and free slots of the active dwellings", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(1, 2, { beds: 2 });
    const [first] = [world.settler(200), world.settler(201), world.settler(202)];
    assignHome(world.engine, first.id, zone, 1);
    expect(buildHousingTotals(world.engine)).toEqual({
      dwellings: 1,
      activeDwellings: 1,
      housed: 1,
      homeless: 2,
      freeSlots: 1,
      perLevel: {
        [DwellingLevel.Hovel]: 1,
        [DwellingLevel.Cottage]: 0,
        [DwellingLevel.TimberFramedHouse]: 0,
        [DwellingLevel.BurgherHouse]: 0,
      },
      immigrationBlocked: null,
    });
  });
});
