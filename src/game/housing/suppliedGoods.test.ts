import { describe, expect, it } from "vitest";
import { DwellingLevel } from "../content/contentTypes";
import { dwellingOf } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { demandedGroups, groupSignature, groupStock, runSupplyStep } from "./suppliedGoods";
import { contentWithLevels, createHousingWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

function recordOf(world: ReturnType<typeof createHousingWorld>, zone: number): DwellingRecord {
  const record = dwellingOf(world.engine, zone);
  if (record === null) {
    throw new Error("no dwelling");
  }
  return record;
}

describe("groupSignature", () => {
  it("joins the material ids in order", () => {
    expect(groupSignature(["linen_cloth", "wool_cloth"])).toBe("linen_cloth|wool_cloth");
    expect(groupSignature(["ale"])).toBe("ale");
  });
});

describe("demandedGroups", () => {
  it("is the union of the current and the next level (FR-010)", () => {
    const world = createHousingWorld(options);
    expect(
      demandedGroups(world.engine, DwellingLevel.Hovel).map((group) => group.signature),
    ).toEqual(["bread"]);
    expect(demandedGroups(world.engine, DwellingLevel.BurgherHouse)).toHaveLength(1);
  });

  it("demands a group both levels name once, at the higher rate (D-28)", () => {
    const world = createHousingWorld(options);
    // Cottage 0.5 and Timber-Framed House 1 per resident per day: a Cottage demands the higher one.
    expect(demandedGroups(world.engine, DwellingLevel.Cottage)).toEqual([
      { signature: "bread", materialIds: ["bread"], perResidentPerDay: 1000 },
    ]);
  });

  it("lists a new group of the next level after the current ones", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({
        hovel: { suppliedGoods: [{ materialIds: ["water"], perResidentPerDay: 0.25 }] },
      }),
    });
    expect(
      demandedGroups(world.engine, DwellingLevel.Hovel).map((group) => group.signature),
    ).toEqual(["water", "bread"]);
  });
});

describe("groupStock", () => {
  it("totals every material of the group over the storage", () => {
    const world = createHousingWorld(options);
    const first = world.chest(0 + 150);
    const second = world.chest(151);
    world.give(first, "bread", 3);
    world.give(second, "bread", 2);
    world.give(second, "water", 4);
    expect(groupStock([first, second], ["bread"])).toBe(5);
    expect(groupStock([first, second], ["bread", "water"])).toBe(9);
    expect(groupStock([], ["bread"])).toBe(0);
  });
});

describe("runSupplyStep", () => {
  it("takes the whole units due and queues one consumed event per material (US2.4)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const chest = world.chest(world.tiles(zone)[3] as number);
    world.give(chest, "bread", 1);
    const consumed = world.record("housing.goods.consumed");
    const results = runSupplyStep(world.engine, recordOf(world, zone), 2);
    world.run(1);
    // A Hovel demands the cottage's bread at 0.5; the Cottage group at the higher rate 1 is not
    // in play here: hovel (none) + cottage (0.5 x 2 residents = 1 unit).
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ signature: "bread", needed: 1, consumed: 1, met: true });
    expect(consumed).toEqual([{ dwellingId: zone, materialId: "bread", quantity: 1 }]);
    expect(groupStock([chest], ["bread"])).toBe(0);
  });

  it("consumes nothing and keeps the debt when the stock is short (US2.4)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    const results = runSupplyStep(world.engine, recordOf(world, zone), 2);
    expect(results[0]).toMatchObject({ needed: 1, consumed: 0, met: false });
    expect(recordOf(world, zone).dwelling.consumptionAccumulators["bread"]).toBe(1000);
  });

  it("fails every group without storage furniture and consumes nothing (US3.4)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const results = runSupplyStep(world.engine, recordOf(world, zone), 2);
    expect(results[0]?.met).toBe(false);
    expect(results[0]?.consumed).toBe(0);
  });

  it("drops accumulators of groups that are no longer demanded (D-28)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const record = recordOf(world, zone);
    record.dwelling.consumptionAccumulators = { bread: 250, "ale|wine": 900 };
    runSupplyStep(world.engine, record, 1);
    expect(Object.keys(record.dwelling.consumptionAccumulators)).toEqual(["bread"]);
  });

  it("takes materials in the order of the group, furniture by ascending id", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({
        cottage: { suppliedGoods: [{ materialIds: ["water", "bread"], perResidentPerDay: 1 }] },
      }),
    });
    const zone = world.dwelling(2, 2, { beds: 2 });
    const [low, high] = [
      world.chest(world.tiles(zone)[2] as number),
      world.chest(world.tiles(zone)[3] as number),
    ];
    world.give(low, "bread", 5);
    world.give(high, "water", 1);
    world.give(low, "water", 1);
    const consumed = world.record("housing.goods.consumed");
    const results = runSupplyStep(world.engine, recordOf(world, zone), 3);
    world.run(1);
    expect(results[0]?.taken).toEqual([
      { materialId: "water", quantity: 2 },
      { materialId: "bread", quantity: 1 },
    ]);
    expect(consumed).toHaveLength(2);
  });
});
