import { describe, expect, it } from "vitest";
import { formatStockMaterial, formatStockOverview, formatStockpiles } from "./formatStock";

const summary = { materialId: "oak_log", total: 12, reserved: 2, available: 10, free: 28 };

describe("formatStockOverview", () => {
  it("prints the capacity line and one line per material", () => {
    expect(
      formatStockOverview({ storages: 2, slots: 16, freeSlots: 14, materials: [summary] }),
    ).toEqual([
      "stock: 2 storages, 16 slots (14 free)",
      "  oak_log: total 12, reserved 2, available 10, room for 28 more",
    ]);
  });

  it("says when nothing is stored and ignores foreign data", () => {
    expect(formatStockOverview({ storages: 0, slots: 0, freeSlots: 0, materials: [] })).toEqual([
      "stock: 0 storages, 0 slots (0 free)",
      "  nothing stored",
    ]);
    expect(formatStockOverview("x")).toEqual([]);
  });
});

describe("formatStockMaterial", () => {
  it("prints totals and holders with their reserved part", () => {
    expect(
      formatStockMaterial({
        ...summary,
        holders: [
          { entityId: 9, prototype: "chest", mapId: 1, cellIndex: 5, quantity: 10, reserved: 2 },
          {
            entityId: 11,
            prototype: "loose_pile",
            mapId: 1,
            cellIndex: null,
            quantity: 2,
            reserved: 0,
          },
        ],
      }),
    ).toEqual([
      "stock of oak_log:",
      "  oak_log: total 12, reserved 2, available 10, room for 28 more",
      "  #9 chest at cell 5: 10 (2 reserved)",
      "  #11 loose_pile at cell ?: 2",
    ]);
    expect(formatStockMaterial(null)).toEqual([]);
  });
});

describe("formatStockpiles", () => {
  const pile = {
    entityId: 9,
    furnitureId: "chest",
    mapId: 1,
    cellIndex: 5,
    priority: 50,
    filter: null,
    slots: 16,
    freeSlots: 15,
    weightLimitMilli: 200000,
    contents: [{ materialId: "oak_log", quantity: 10 }],
    reservations: [],
  };

  it("prints one line per stockpile", () => {
    expect(formatStockpiles([pile])).toEqual([
      "  #9 chest at cell 5 prio 50 accepts all, 15/16 slots free: 10 oak_log",
    ]);
    expect(
      formatStockpiles([
        {
          ...pile,
          filter: { categories: ["food"], materialIds: ["coal"] },
          contents: [],
          reservations: [{ id: 3 }],
        },
      ]),
    ).toEqual([
      "  #9 chest at cell 5 prio 50 accepts food,coal, 15/16 slots free: empty, 1 reservations",
    ]);
  });

  it("notes when there are none", () => {
    expect(formatStockpiles([])).toEqual(["no stockpiles"]);
    expect(formatStockpiles("x")).toEqual([]);
  });
});
