import { describe, expect, it } from "vitest";
import { dwellingOf } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import {
  createRequirementContext,
  foodsInWindow,
  levelRequirements,
  nearestServiceCost,
  unmetNames,
} from "./dwellingRequirements";
import type { RequirementContext } from "./dwellingRequirements";
import { DwellingLevel } from "../content/contentTypes";
import { DwellingRequirementKind, SupplyStatus } from "./housingTypes";
import { contentWithLevels, createHousingWorld } from "./testHousingWorld";
import type { HousingTestWorld } from "./testHousingWorld";

const options = { width: 24, height: 12 };

function recordOf(world: HousingTestWorld, zone: number): DwellingRecord {
  const record = dwellingOf(world.engine, zone);
  if (record === null) {
    throw new Error("no dwelling");
  }
  return record;
}

function contextOf(world: HousingTestWorld, zone: number, residents = 1): RequirementContext {
  return createRequirementContext(world.engine, recordOf(world, zone), residents, null);
}

describe("foodsInWindow", () => {
  it("keeps the foods eaten inside the window ending today, sorted", () => {
    const record = { cheese: 8, bread: 10, stew: 7, apples: 9 };
    expect(foodsInWindow(record, 10, 3)).toEqual(["apples", "bread", "cheese"]);
    expect(foodsInWindow(record, 10, 1)).toEqual(["bread"]);
    expect(foodsInWindow({}, 10, 3)).toEqual([]);
  });
});

describe("levelRequirements", () => {
  // @covers 029:FR-007
  it("checks tiles and furniture of a level (MinTiles, Furniture)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    const cottage = levelRequirements(contextOf(world, zone), DwellingLevel.Cottage);
    expect(cottage.met).toBe(false);
    const tiles = cottage.requirements.find(
      (entry) => entry.kind === DwellingRequirementKind.MinTiles,
    );
    expect(tiles).toMatchObject({ met: false, required: 6, current: 4 });
    const beds = cottage.requirements.find(
      (entry) => entry.kind === DwellingRequirementKind.Furniture,
    );
    expect(beds).toMatchObject({ met: false, required: 2, current: 1, furniture: "2x tag:bed" });
    const hovel = levelRequirements(contextOf(world, zone), DwellingLevel.Hovel);
    expect(hovel.met).toBe(true);
  });

  // @covers 029:FR-007
  it("counts the distinct foods of the household inside the window (US3.5)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels({}) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    const record = recordOf(world, zone);
    record.dwelling.foodRecord = { bread: 0, wheat: 0, flour: 0 };
    const cottage = levelRequirements(contextOf(world, zone), DwellingLevel.Cottage);
    const foods = cottage.requirements.find(
      (entry) => entry.kind === DwellingRequirementKind.FoodVariety,
    );
    expect(foods).toMatchObject({ met: true, required: 2, current: 3 });
    record.dwelling.foodRecord = { bread: 0 };
    const fewer = levelRequirements(contextOf(world, zone), DwellingLevel.Cottage);
    expect(
      fewer.requirements.find((entry) => entry.kind === DwellingRequirementKind.FoodVariety),
    ).toMatchObject({ met: false, current: 1 });
  });

  // @covers 029:FR-008
  it("reports the nearest service distance and the limit (US2.3)", () => {
    const limit = 40;
    const content = contentWithLevels({
      cottage: { services: [{ zoneTypeIds: ["pantry"], maxPathCells: limit }] },
    });
    const world = createHousingWorld({ ...options, content });
    const zone = world.dwelling(2, 2, { beds: 2 });
    let ctx = contextOf(world, zone);
    const none = levelRequirements(ctx, DwellingLevel.Cottage).requirements.find(
      (entry) => entry.kind === DwellingRequirementKind.ServiceNearby,
    );
    expect(none).toMatchObject({
      met: false,
      nearestPathCost: null,
      required: limit,
      zoneTypeIds: ["pantry"],
    });
    // A pantry (4 tiles, a room) stands in for a chapel.
    world.room(14, 2, 2, 2, 1 * 24 + 14);
    world.command("DesignateZone", {
      zoneTypeId: "pantry",
      mapId: world.mapId,
      cells: world.rect(14, 2, 2, 2),
      reassign: false,
    });
    world.run(1);
    ctx = contextOf(world, zone);
    const cost = nearestServiceCost(ctx, ["pantry"]);
    expect(cost).not.toBeNull();
    const found = levelRequirements(ctx, DwellingLevel.Cottage).requirements.find(
      (entry) => entry.kind === DwellingRequirementKind.ServiceNearby,
    );
    expect(found).toMatchObject({
      nearestPathCost: cost,
      current: cost,
      met: (cost ?? 0) <= limit,
    });
  });

  // @covers 029:FR-008
  it("is unmet beyond the limit and keeps the nearest cost (US2.3)", () => {
    const world = createHousingWorld({
      ...options,
      content: contentWithLevels({
        cottage: { services: [{ zoneTypeIds: ["pantry"], maxPathCells: 1 }] },
      }),
    });
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.room(14, 2, 2, 2, 1 * 24 + 14);
    world.command("DesignateZone", {
      zoneTypeId: "pantry",
      mapId: world.mapId,
      cells: world.rect(14, 2, 2, 2),
      reassign: false,
    });
    world.run(1);
    const found = levelRequirements(
      contextOf(world, zone),
      DwellingLevel.Cottage,
    ).requirements.find((entry) => entry.kind === DwellingRequirementKind.ServiceNearby);
    expect(found?.met).toBe(false);
    expect(found?.nearestPathCost).toBeGreaterThan(1);
    expect(found?.required).toBe(1);
  });

  it("previews supplied goods without consuming them (US3, FR-009)", () => {
    const world = createHousingWorld({ ...options, content: contentWithLevels({}) });
    const zone = world.dwelling(2, 2, { beds: 2 });
    const noStorage = levelRequirements(
      contextOf(world, zone, 2),
      DwellingLevel.Cottage,
    ).requirements.find((entry) => entry.kind === DwellingRequirementKind.SuppliedGood);
    expect(noStorage).toMatchObject({
      met: false,
      supplyStatus: SupplyStatus.NoStorage,
      materialIds: ["bread"],
    });
    const chest = world.chest(world.tiles(zone)[3] as number);
    const short = levelRequirements(
      contextOf(world, zone, 2),
      DwellingLevel.Cottage,
    ).requirements.find((entry) => entry.kind === DwellingRequirementKind.SuppliedGood);
    expect(short).toMatchObject({
      met: false,
      supplyStatus: SupplyStatus.Short,
      inStock: 0,
      needed: 1,
    });
    world.give(chest, "bread", 3);
    const met = levelRequirements(
      contextOf(world, zone, 2),
      DwellingLevel.Cottage,
    ).requirements.find((entry) => entry.kind === DwellingRequirementKind.SuppliedGood);
    expect(met).toMatchObject({ met: true, supplyStatus: SupplyStatus.Met, inStock: 3, needed: 1 });
  });

  // @covers 029:FR-007
  it("checks the tier lock of a level (TierUnlocked)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2);
    const cottage = levelRequirements(contextOf(world, zone), DwellingLevel.Cottage);
    expect(
      cottage.requirements.find((entry) => entry.kind === DwellingRequirementKind.TierUnlocked),
    ).toMatchObject({ met: false, requiredTier: "village" });
    expect(unmetNames(cottage)).toContain("TierUnlocked:village");
  });
});

describe("unmetNames", () => {
  it("names each unmet requirement with its detail", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    const names = unmetNames(levelRequirements(contextOf(world, zone), DwellingLevel.Cottage));
    expect(names).toEqual([
      "MinTiles",
      "Furniture:2x tag:bed",
      "FoodVariety",
      "SuppliedGood:bread",
      "TierUnlocked:village",
    ]);
  });
});

describe("nearestServiceCost", () => {
  it("is null without any active zone of the type", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2);
    expect(nearestServiceCost(contextOf(world, zone), ["pantry", "bakery"])).toBeNull();
  });
});

describe("createRequirementContext", () => {
  it("collects the tile furniture and storage of the dwelling", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    const context = contextOf(world, zone, 2);
    expect(context.pieces).toHaveLength(3);
    expect(context.storage).toHaveLength(1);
    expect(context.residents).toBe(2);
    expect(context.supply).toBeNull();
  });
});
