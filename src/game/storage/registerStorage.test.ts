import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import type { GameEngine } from "../engine/GameEngine";
import { getAiService } from "../ai/aiServiceRegistry";
import { noAiOverride } from "../jobs/testJobWorld";
import { registerStorage } from "./registerStorage";
import { getStorageService } from "./storageServiceRegistry";
import { haulPosterIntervalTicks, ReservationKind } from "./storageTypes";
import { createStorageWorld } from "./testStorageWorld";

function command(engine: GameEngine, kind: string, payload: JsonValue): JsonValue {
  const registration = engine.getCommandHandler(kind);
  if (registration === undefined) {
    throw new Error(`no command ${kind}`);
  }
  return registration.handler(payload, engine);
}

function query(engine: GameEngine, name: string, args: JsonValue): JsonValue {
  const registration = engine.getQuery(name);
  if (registration === undefined) {
    throw new Error(`no query ${name}`);
  }
  return registration.run(args, engine);
}

describe("registerStorage", () => {
  it("is idempotent and returns the engine's service", () => {
    const world = createStorageWorld();
    expect(registerStorage(world.engine)).toBe(getStorageService(world.engine));
  });

  it("registers a need source and the item availability hook with the AI", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    world.give(chest, "bread", 2);
    const settler = world.spawn("peasant", 6, noAiOverride);
    const other = world.spawn("peasant", 7, noAiOverride);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Payment,
      holderId: other.id,
      inventoryOwnerId: chest.id,
      materialId: "bread",
      quantity: 2,
    });
    const ai = getAiService(world.engine);
    expect(ai.needSources().length).toBeGreaterThan(0);
    expect(ai.itemsAvailable(world.engine, chest, settler, "bread", 2)).toBe(0);
    expect(ai.itemsAvailable(world.engine, chest, other, "bread", 2)).toBe(2);
  });

  it("releases the reservations of a deleted holder", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    world.give(chest, "oak_log", 4);
    const worker = world.spawn("peasant", 6, noAiOverride);
    const reservations = getStorageService(world.engine).reservations;
    reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: worker.id,
      inventoryOwnerId: chest.id,
      materialId: "oak_log",
      quantity: 4,
    });
    world.engine.store.requestDelete(worker.id);
    world.engine.store.flushDeletions();
    expect(reservations.all()).toEqual([]);
  });

  it("the slot-10 system reconciles reservations and posts haul jobs on its interval", () => {
    const world = createStorageWorld();
    world.chest(55);
    world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    world.run(haulPosterIntervalTicks);
    const board = world.engine.store.require(world.boardId).components["JobBoard"] as {
      postings: { jobTypeId: string }[];
      history: { jobTypeId: string }[];
    };
    expect([...board.postings, ...board.history].some((entry) => entry.jobTypeId === "haul.deliver")).toBe(true);
  });
});

describe("command SetStorageMaterialFilter", () => {
  it("sets and clears the filter of a stockpile; empty lists mean no filter", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    const data = chest.components["Stockpile"] as { filter: JsonValue };
    command(world.engine, "SetStorageMaterialFilter", {
      entityId: chest.id,
      filter: { categories: ["food"] },
    });
    expect(data.filter).toEqual({ categories: ["food"], materialIds: [] });
    command(world.engine, "SetStorageMaterialFilter", { entityId: chest.id, filter: null });
    expect(data.filter).toBeNull();
    command(world.engine, "SetStorageMaterialFilter", {
      entityId: chest.id,
      filter: { categories: [], materialIds: ["coal"] },
    });
    command(world.engine, "SetStorageMaterialFilter", {
      entityId: chest.id,
      filter: { categories: [], materialIds: [] },
    });
    expect(data.filter).toBeNull();
  });

  it("does not evict contents when the filter changes (FR-006)", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    world.give(chest, "oak_log", 4);
    command(world.engine, "SetStorageMaterialFilter", {
      entityId: chest.id,
      filter: { categories: ["food"] },
    });
    expect(world.count("oak_log")).toBe(4);
  });

  it("rejects unknown entities, non-stockpiles and unknown categories or materials", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    expect(() =>
      command(world.engine, "SetStorageMaterialFilter", { entityId: 999, filter: null }),
    ).toThrow(/does not exist/);
    expect(() =>
      command(world.engine, "SetStorageMaterialFilter", { entityId: world.boardId, filter: null }),
    ).toThrow(/not a stockpile/);
    expect(() =>
      command(world.engine, "SetStorageMaterialFilter", {
        entityId: chest.id,
        filter: { categories: ["gems"] },
      }),
    ).toThrow(/category "gems"/);
    expect(() =>
      command(world.engine, "SetStorageMaterialFilter", {
        entityId: chest.id,
        filter: { materialIds: ["gem"] },
      }),
    ).toThrow(/material "gem"/);
  });
});

describe("command SetStockpilePriority", () => {
  it("sets the priority within 0..100", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    command(world.engine, "SetStockpilePriority", { entityId: chest.id, priority: 90 });
    expect((chest.components["Stockpile"] as { priority: number }).priority).toBe(90);
    expect(() =>
      command(world.engine, "SetStockpilePriority", { entityId: chest.id, priority: 101 }),
    ).toThrow();
    expect(() =>
      command(world.engine, "SetStockpilePriority", { entityId: 999, priority: 1 }),
    ).toThrow(/does not exist/);
  });
});

describe("queries stock, stockpiles, reservations", () => {
  it("stock without a material is the overview, with one the totals and holders", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    world.give(chest, "oak_log", 4);
    world.give(chest, "bread", 2);
    expect(query(world.engine, "stock", {})).toMatchObject({
      storages: 1,
      materials: [
        { materialId: "bread", total: 2 },
        { materialId: "oak_log", total: 4 },
      ],
    });
    expect(query(world.engine, "stock", { materialId: "oak_log" })).toMatchObject({
      total: 4,
      reserved: 0,
      available: 4,
      holders: [{ entityId: chest.id, quantity: 4 }],
    });
    expect(() => query(world.engine, "stock", { materialId: "gem" })).toThrow(/gem/);
  });

  it("stockpiles lists chests with filter, priority, capacity, contents and reservations", () => {
    const world = createStorageWorld();
    const chest = world.chest(5, { Stockpile: { priority: 70, filter: null } });
    world.give(chest, "oak_log", 4);
    const holder = world.spawn("peasant", 6, noAiOverride);
    const reservation = getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: holder.id,
      inventoryOwnerId: chest.id,
      materialId: "oak_log",
      quantity: 1,
    });
    expect(query(world.engine, "stockpiles", {})).toMatchObject([
      {
        entityId: chest.id,
        furnitureId: "chest",
        cellIndex: 5,
        priority: 70,
        filter: null,
        slots: 16,
        freeSlots: 15,
        weightLimitMilli: 200000,
        contents: [{ materialId: "oak_log", quantity: 4 }],
        reservations: [{ id: reservation.id, quantity: 1 }],
      },
    ]);
    expect(query(world.engine, "reservations", {})).toMatchObject([{ id: reservation.id }]);
  });
});
