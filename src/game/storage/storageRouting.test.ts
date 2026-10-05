import { describe, expect, it } from "vitest";
import {
  InventoryOperation,
  PermissionTargetKind,
  PermissionType,
} from "../inventory/inventoryTypes";
import { RouteTier, chooseRoute, compareRoutes, routeCandidates } from "./storageRouting";
import type { StorageRoute, RouteRequest } from "./storageRouting";
import { createStorageWorld, setRules } from "./testStorageWorld";
import type { StorageTestWorld } from "./testStorageWorld";

// Hauler stands on cell 55 of the 10x10 test map (column 5, row 5). Cells 35 and 75 are both two
// steps away, cell 45 is one step away, cell 58 is three steps away.
const hauler = 55;

function request(
  world: StorageTestWorld,
  materialId = "oak_log",
  extra: Partial<RouteRequest> = {},
) {
  return {
    materialId,
    quantity: 1,
    actorId: null,
    mapId: world.mapId,
    fromCell: hauler,
    ...extra,
  } satisfies RouteRequest;
}

function route(overrides: Partial<StorageRoute>): StorageRoute {
  return {
    entityId: 1,
    tier: RouteTier.Stockpile,
    priority: 50,
    cost: 10,
    free: 10,
    mapId: 1,
    cellIndex: 0,
    ...overrides,
  };
}

describe("compareRoutes", () => {
  const table: { name: string; better: Partial<StorageRoute>; worse: Partial<StorageRoute> }[] = [
    {
      name: "filter match beats priority",
      better: { tier: RouteTier.Filtered, priority: 0 },
      worse: { tier: RouteTier.Stockpile, priority: 100 },
    },
    {
      name: "stockpile beats open storage",
      better: { tier: RouteTier.Stockpile, cost: 99 },
      worse: { tier: RouteTier.Open, cost: 1 },
    },
    {
      name: "priority beats distance",
      better: { priority: 80, cost: 50 },
      worse: { priority: 40, cost: 5 },
    },
    {
      name: "distance beats free capacity",
      better: { cost: 5, free: 1 },
      worse: { cost: 6, free: 500 },
    },
    {
      name: "free capacity beats entity id",
      better: { free: 20, entityId: 9 },
      worse: { free: 10, entityId: 2 },
    },
    {
      name: "lower entity id wins a full tie",
      better: { entityId: 2 },
      worse: { entityId: 9 },
    },
  ];
  for (const row of table) {
    it(row.name, () => {
      const better = route(row.better);
      const worse = route(row.worse);
      expect(compareRoutes(better, worse)).toBeLessThan(0);
      expect(compareRoutes(worse, better)).toBeGreaterThan(0);
      expect(compareRoutes(better, better)).toBe(0);
    });
  }
});

describe("routeCandidates and chooseRoute", () => {
  it("prefers a matching filter over a higher priority stockpile (tier 2 inside a stockpile)", () => {
    const world = createStorageWorld();
    world.chest(45, { Stockpile: { priority: 90, filter: null } });
    const filtered = world.chest(75, {
      Stockpile: { priority: 10, filter: { categories: ["wood"], materialIds: [] } },
    });
    expect(chooseRoute(world.engine, request(world))?.entityId).toBe(filtered.id);
    expect(chooseRoute(world.engine, request(world))?.tier).toBe(RouteTier.Filtered);
  });

  it("then stockpile priority, then distance, then free capacity, then lowest id", () => {
    const world = createStorageWorld();
    const lowPriorityNear = world.chest(45, { Stockpile: { priority: 20, filter: null } });
    const highPriorityFar = world.chest(58, { Stockpile: { priority: 70, filter: null } });
    expect(chooseRoute(world.engine, request(world))?.entityId).toBe(highPriorityFar.id);
    world.engine.store.requestDelete(highPriorityFar.id);
    world.engine.store.flushDeletions();
    expect(chooseRoute(world.engine, request(world))?.entityId).toBe(lowPriorityNear.id);

    const tie = createStorageWorld();
    const first = tie.chest(35);
    const second = tie.chest(75);
    tie.give(first, "oak_log", 5);
    expect(chooseRoute(tie.engine, request(tie))?.entityId).toBe(second.id);
    tie.give(second, "oak_log", 5);
    expect(chooseRoute(tie.engine, request(tie))?.entityId).toBe(first.id);
  });

  it("routes by path cost, not by cell index", () => {
    const world = createStorageWorld();
    const near = world.chest(56);
    world.chest(35);
    expect(chooseRoute(world.engine, request(world))?.entityId).toBe(near.id);
    expect(chooseRoute(world.engine, request(world))?.cost).toBeLessThan(
      routeCandidates(world.engine, request(world))[1]?.cost ?? 0,
    );
  });

  it("uses furniture storage that is not a stockpile last (tier 4), never for currency", () => {
    const world = createStorageWorld();
    const stockpile = world.chest(58);
    const crate = world.spawn("chest", 56);
    world.engine.store.removeComponent(crate.id, { name: "Stockpile" });
    const routes = routeCandidates(world.engine, request(world));
    expect(routes.map((entry) => [entry.entityId, entry.tier])).toEqual([
      [stockpile.id, RouteTier.Stockpile],
      [crate.id, RouteTier.Open],
    ]);
    const coins = routeCandidates(world.engine, request(world, "silver_penny"));
    expect(coins.map((entry) => entry.entityId)).toEqual([stockpile.id]);
  });

  it("skips full, filtered-out, locked, unreachable and excluded storage", () => {
    const world = createStorageWorld();
    const full = world.chest(45, { Inventory: { slotCount: 1 } });
    world.give(full, "limestone", 20);
    world.chest(46, {
      Stockpile: { priority: 50, filter: { categories: ["food"], materialIds: [] } },
    });
    const locked = world.chest(47);
    setRules(locked, [
      {
        type: PermissionType.Deny,
        target: { kind: PermissionTargetKind.Anyone },
        operation: InventoryOperation.Store,
      },
    ]);
    const lockedFor = world.spawn("peasant", 0);
    const open = world.chest(48);
    expect(
      routeCandidates(world.engine, request(world, "oak_log", { actorId: lockedFor.id })).map(
        (entry) => entry.entityId,
      ),
    ).toEqual([open.id]);
    expect(chooseRoute(world.engine, request(world, "oak_log", { excludeIds: [open.id] }))).toEqual(
      expect.objectContaining({ entityId: locked.id }),
    );
    expect(
      chooseRoute(
        world.engine,
        request(world, "oak_log", { actorId: lockedFor.id, excludeIds: [open.id] }),
      ),
    ).toBeNull();
  });

  it("does not offer loose piles, other maps or nothing at all", () => {
    const world = createStorageWorld();
    world.pile(45, []);
    expect(chooseRoute(world.engine, request(world))).toBeNull();
    world.chest(46);
    expect(chooseRoute(world.engine, request(world, "oak_log", { mapId: 99 }))).toBeNull();
  });

  it("is deterministic: equal routes fall to the lowest entity id", () => {
    const orderA = createStorageWorld();
    const orderB = createStorageWorld();
    const cells = [35, 75, 45, 58];
    for (const cell of cells) {
      orderA.chest(cell);
    }
    for (const cell of [...cells].reverse()) {
      orderB.chest(cell);
    }
    const cellsA = routeCandidates(orderA.engine, request(orderA)).map((entry) => entry.cellIndex);
    const cellsB = routeCandidates(orderB.engine, request(orderB)).map((entry) => entry.cellIndex);
    expect(cellsA).toEqual([45, 35, 75, 58]);
    expect(cellsB).toEqual([45, 75, 35, 58]);
    expect(routeCandidates(orderA.engine, request(orderA))).toEqual(
      routeCandidates(orderA.engine, request(orderA)),
    );
  });
});
