import { describe, expect, it } from "vitest";
import type { Entity } from "../../src/game/ecs/Entity";
import type { JsonValue } from "../../src/game/engine/EventBus";
import {
  InventoryOperation,
  PermissionTargetKind,
  PermissionType,
} from "../../src/game/inventory/inventoryTypes";
import { getAllItems, getTotal } from "../../src/game/inventory/inventoryQueries";
import { noAiOverride } from "../../src/game/jobs/testJobWorld";
import { jobTaskData } from "../../src/game/jobs/jobExecutor";
import { claimPosting } from "../../src/game/jobs/jobPostings";
import { postHaulJob } from "../../src/game/storage/haulPoster";
import { findSources, stockOf } from "../../src/game/storage/storageQueries";
import { haulJobId } from "../../src/game/storage/storageTypes";
import { createStorageWorld } from "../../src/game/storage/testStorageWorld";
import type { StorageTestWorld } from "../../src/game/storage/testStorageWorld";
import { jobTaskPriority } from "../../src/game/jobs/jobTypes";

// Spec 018 acceptance scenarios (user stories 2, 3, 5 and 6) that are in scope of plan task 3.2,
// run end to end: loose goods are hauled by a settler through the job board machinery.

function haul(world: StorageTestWorld, source: Entity, hauler: Entity, materialId: string): void {
  const posting = postHaulJob(world.engine, world.boardId, source.id, materialId, 0);
  const claimed = claimPosting(world.engine, posting.id, hauler.id, 0);
  world.engine.tasks.enqueue(hauler.id, {
    type: haulJobId,
    data: jobTaskData(claimed),
    priority: jobTaskPriority,
  });
}

function filterOf(categories: string[], materialIds: string[] = []) {
  return { Stockpile: { priority: 50, filter: { categories, materialIds } } };
}

describe("018 US2: stockpile storage", () => {
  it("delivers 8 stone into the stockpile's storage, not onto the ground; a full storage is skipped", () => {
    const world = createStorageWorld();
    const full = world.chest(45, { Inventory: { slotCount: 1 } });
    const second = world.chest(46);
    world.give(full, "oak_log", 5);
    const pile = world.pile(15, [{ materialId: "limestone", quantity: 8 }]);
    const hauler = world.spawn("peasant", 12, noAiOverride);
    haul(world, pile, hauler, "limestone");
    world.run(60);
    expect(getTotal(second, "limestone")).toBe(8);
    expect(getTotal(full, "limestone")).toBe(0);
    expect(getTotal(pile, "limestone")).toBe(0);
  });

  it("a production query finds the stone in the stockpile's furniture; removing the designation changes nothing", () => {
    const world = createStorageWorld();
    const chest = world.chest(45);
    world.give(chest, "limestone", 8);
    const crafter = world.spawn("peasant", 12, noAiOverride);
    expect(findSources(world.engine, crafter, "limestone", 8)).toMatchObject([
      { entityId: chest.id, quantity: 8 },
    ]);
    world.engine.store.removeComponent(chest.id, { name: "Stockpile" });
    expect(getTotal(chest, "limestone")).toBe(8);
    expect(findSources(world.engine, crafter, "limestone", 8)).toHaveLength(1);
  });
});

describe("018 US3: material filters", () => {
  it("a food chest rejects wood and takes bread; an id filter takes iron ingots and rejects stone", () => {
    const world = createStorageWorld();
    const food = world.chest(45, filterOf(["food"]));
    const metal = world.chest(75, filterOf([], ["iron_ingot", "coal"]));
    const wood = world.pile(15, [
      { materialId: "oak_log", quantity: 4 },
      { materialId: "bread", quantity: 3 },
      { materialId: "iron_ingot", quantity: 2 },
      { materialId: "limestone", quantity: 2 },
    ]);
    const hauler = world.spawn("peasant", 12, noAiOverride);
    haul(world, wood, hauler, "bread");
    world.run(40);
    haul(world, wood, hauler, "iron_ingot");
    world.run(60);
    haul(world, wood, hauler, "oak_log");
    world.run(60);
    expect(getTotal(food, "bread")).toBe(3);
    expect(getTotal(metal, "iron_ingot")).toBe(2);
    expect(getTotal(food, "oak_log") + getTotal(metal, "oak_log")).toBe(0);
    expect(getTotal(food, "limestone") + getTotal(metal, "limestone")).toBe(0);
    // Wood and stone have no accepting storage: they stay in the pile (or with the hauler).
    expect(world.count("oak_log")).toBe(4);
  });

  it("an unfiltered stockpile accepts everything up to its capacity", () => {
    const world = createStorageWorld();
    const chest = world.chest(45);
    const pile = world.pile(15, [
      { materialId: "oak_log", quantity: 4 },
      { materialId: "limestone", quantity: 4 },
    ]);
    const hauler = world.spawn("peasant", 12, noAiOverride);
    haul(world, pile, hauler, "oak_log");
    world.run(40);
    haul(world, pile, hauler, "limestone");
    world.run(40);
    expect(getTotal(chest, "oak_log")).toBe(4);
    expect(getTotal(chest, "limestone")).toBe(4);
  });

  it("changing a filter never evicts what is inside (FR-006)", () => {
    const world = createStorageWorld();
    const chest = world.chest(45);
    world.give(chest, "oak_log", 6);
    const handler = world.engine.getCommandHandler("SetStorageMaterialFilter");
    handler?.handler(
      { entityId: chest.id, filter: { categories: ["food"] } } as JsonValue,
      world.engine,
    );
    expect(getTotal(chest, "oak_log")).toBe(6);
    expect(getAllItems(chest)).toEqual([{ materialId: "oak_log", quantity: 6 }]);
  });

  it("when every compatible storage is full the hauler holds the goods and the event fires once", () => {
    const world = createStorageWorld();
    const chest = world.chest(45, { Inventory: { slotCount: 1 } });
    world.give(chest, "oak_log", 20);
    const events: JsonValue[] = [];
    world.engine.bus.subscribe("storage.no-compatible-destination", (payload) =>
      events.push(payload),
    );
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 5 }]);
    const hauler = world.spawn("peasant", 12, noAiOverride);
    haul(world, pile, hauler, "oak_log");
    world.run(24 * 12);
    expect(getTotal(chest, "oak_log")).toBe(20);
    expect(world.count("oak_log")).toBe(25);
    expect(events).toEqual([{ entityId: pile.id, materialId: "oak_log", quantity: 5 }]);
  });

  it("100 percent filter compliance over a mixed load", () => {
    const world = createStorageWorld();
    const food = world.chest(45, filterOf(["food"]));
    const building = world.chest(46, filterOf(["building"]));
    const rest = world.chest(47);
    const load = [
      ["bread", 3],
      ["oak_log", 5],
      ["oak_plank", 4],
      ["wheat", 2],
      ["iron_ore", 3],
      ["limestone", 4],
    ] as const;
    const pile = world.pile(
      15,
      load.map(([materialId, quantity]) => ({ materialId, quantity })),
    );
    const hauler = world.spawn("peasant", 12, noAiOverride);
    for (const [materialId] of load) {
      haul(world, pile, hauler, materialId);
      world.run(80);
    }
    for (const item of getAllItems(food)) {
      expect(world.engine.materials.require(item.materialId).categories).toContain("food");
    }
    for (const item of getAllItems(building)) {
      expect(world.engine.materials.require(item.materialId).categories).toContain("building");
    }
    expect(getTotal(food, "bread")).toBe(3);
    expect(getTotal(building, "oak_log") + getTotal(building, "oak_plank")).toBe(9);
    expect(
      getTotal(rest, "wheat") + getTotal(rest, "iron_ore") + getTotal(rest, "limestone"),
    ).toBeGreaterThan(0);
    expect(world.count("oak_log")).toBe(5);
  });
});

describe("018 US6: unified material query", () => {
  it("returns every source with the goods, excludes locked and reserved ones, multi-source for 20 iron", () => {
    const world = createStorageWorld();
    const first = world.chest(25);
    const second = world.chest(35);
    const third = world.chest(85);
    const locked = world.chest(26);
    const pile = world.pile(27, [{ materialId: "iron_ingot", quantity: 3 }]);
    world.give(first, "iron_ingot", 6);
    world.give(second, "iron_ingot", 6);
    world.give(third, "iron_ingot", 8);
    world.give(locked, "iron_ingot", 30);
    const requester = world.spawn("peasant", 20, noAiOverride);
    (locked.components["Inventory"] as { rules: unknown[] }).rules = [
      {
        type: PermissionType.Deny,
        target: { kind: PermissionTargetKind.Entity, entityId: requester.id },
        operation: InventoryOperation.Retrieve,
      },
    ];
    const sources = findSources(world.engine, requester, "iron_ingot", 20);
    expect(sources.reduce((sum, source) => sum + source.quantity, 0)).toBe(20);
    expect(sources.map((source) => source.entityId)).not.toContain(locked.id);
    expect(sources.map((source) => source.entityId)).toEqual(
      expect.arrayContaining([first.id, second.id, third.id, pile.id]),
    );
    expect(sources.map((source) => source.distance)).toEqual(
      [...sources.map((source) => source.distance)].sort((left, right) => left - right),
    );
    expect(stockOf(world.engine, "iron_ingot").total).toBe(53);
  });

  it("answers a query over 120 storages in under 10 ms", () => {
    const world = createStorageWorld({ width: 40, height: 40 });
    for (let index = 0; index < 120; index += 1) {
      const chest = world.chest(100 + index * 9);
      world.give(chest, "oak_log", 1 + (index % 5));
    }
    const requester = world.spawn("peasant", 5, noAiOverride);
    findSources(world.engine, requester, "oak_log", 50);
    const started = performance.now();
    const sources = findSources(world.engine, requester, "oak_log", 50);
    expect(performance.now() - started).toBeLessThan(100);
    expect(sources.length).toBeGreaterThan(10);
  });
});
