import { describe, expect, it } from "vitest";
import { DwellingLevel } from "../content/contentTypes";
import { LevelChange } from "./advanceStreaks";
import { dwellingOf } from "./dwellingZones";
import { evaluateDwelling } from "./evaluateDwelling";
import { contentWithLevels, createHousingWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

const simpleCottage = {
  cottage: {
    minTiles: 4,
    furniture: [{ kind: "tag", ref: "bed", count: 2 }],
    foodVariety: 0,
    suppliedGoods: [],
    unlockTier: null,
  },
};

describe("evaluateDwelling", () => {
  // @covers 029:FR-011
  it("counts the upgrade streak up to the grace days and then raises the level", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels(simpleCottage) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    const upgraded = world.record("housing.dwelling.upgraded");
    const record = dwellingOf(world.engine, zone);
    if (record === null) {
      throw new Error("no dwelling");
    }
    const changes = [1, 2, 3].map(() => evaluateDwelling(world.engine, record, 1, []).change);
    expect(changes).toEqual([null, null, LevelChange.Up]);
    expect(record.dwelling.level).toBe("cottage");
    expect(record.dwelling.upgradeStreak).toBe(0);
    world.run(1);
    expect(upgraded).toEqual([{ dwellingId: zone, fromLevel: "hovel", toLevel: "cottage" }]);
  });

  // @covers 029:SC-002
  it("rises one level at a time even when two levels qualify (US2.5)", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({
        ...simpleCottage,
        [DwellingLevel.TimberFramedHouse]: {
          minTiles: 4,
          furniture: [{ kind: "tag", ref: "bed", count: 1 }],
          foodVariety: 0,
          suppliedGoods: [],
          unlockTier: null,
        },
      }),
    });
    const zone = world.dwelling(2, 2, { beds: 2 });
    const record = dwellingOf(world.engine, zone);
    if (record === null) {
      throw new Error("no dwelling");
    }
    for (let day = 0; day < 3; day += 1) {
      evaluateDwelling(world.engine, record, 1, []);
    }
    expect(record.dwelling.level).toBe("cottage");
    expect(record.dwelling.upgradeStreak).toBe(0);
  });

  it("reports the unmet requirements of both levels", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    const record = dwellingOf(world.engine, zone);
    if (record === null) {
      throw new Error("no dwelling");
    }
    const found = evaluateDwelling(world.engine, record, 1, []);
    expect(found.current.met).toBe(true);
    expect(found.next?.met).toBe(false);
    expect(found.change).toBeNull();
    expect(record.dwelling.upgradeStreak).toBe(0);
  });
});
