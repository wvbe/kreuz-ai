import { describe, expect, it } from "vitest";
import { noAiOverride } from "../jobs/testJobWorld";
import { getStorageService } from "./storageServiceRegistry";
import { buildStockOverview, buildStockpileViews, buildStockView } from "./storageViews";
import { ReservationKind } from "./storageTypes";
import { createStorageWorld } from "./testStorageWorld";

describe("buildStockView", () => {
  it("shows totals and the holders with their reserved part, piles included", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    const pile = world.pile(6, [{ materialId: "oak_log", quantity: 3 }]);
    world.give(chest, "oak_log", 4);
    const holder = world.spawn("peasant", 8, noAiOverride);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Haul,
      holderId: holder.id,
      inventoryOwnerId: chest.id,
      materialId: "oak_log",
      quantity: 2,
    });
    const view = buildStockView(world.engine, "oak_log");
    expect(view).toMatchObject({ total: 7, reserved: 2, available: 5 });
    expect(view.holders).toEqual([
      { entityId: chest.id, prototype: "chest", mapId: world.mapId, cellIndex: 5, quantity: 4, reserved: 2 },
      { entityId: pile.id, prototype: "loose_pile", mapId: world.mapId, cellIndex: 6, quantity: 3, reserved: 0 },
    ]);
  });
});

describe("buildStockOverview", () => {
  it("lists every stored material and counts slots of real storage only", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    world.pile(6, [{ materialId: "wheat", quantity: 3 }]);
    world.give(chest, "bread", 2);
    const overview = buildStockOverview(world.engine);
    expect(overview).toMatchObject({ storages: 2, slots: 16, freeSlots: 15 });
    expect(overview.materials.map((entry) => entry.materialId)).toEqual(["bread", "wheat"]);
  });

  it("is empty without storage", () => {
    expect(buildStockOverview(createStorageWorld().engine)).toEqual({
      storages: 0,
      slots: 0,
      freeSlots: 0,
      materials: [],
    });
  });
});

describe("buildStockpileViews", () => {
  it("describes each stockpile and nothing else", () => {
    const world = createStorageWorld();
    const filtered = world.chest(5, {
      Stockpile: { priority: 20, filter: { categories: ["food"], materialIds: [] } },
    });
    world.give(filtered, "bread", 2);
    world.pile(6, []);
    const views = buildStockpileViews(world.engine);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      entityId: filtered.id,
      priority: 20,
      filter: { categories: ["food"], materialIds: [] },
      contents: [{ materialId: "bread", quantity: 2 }],
      reservations: [],
    });
  });
});
