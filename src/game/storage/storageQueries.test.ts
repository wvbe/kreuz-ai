import { describe, expect, it } from "vitest";
import type { Entity } from "../ecs/Entity";
import {
  InventoryOperation,
  PermissionTargetKind,
  PermissionType,
} from "../inventory/inventoryTypes";
import { getStorageService } from "./storageServiceRegistry";
import {
  canDepositInto,
  canRetrieveFrom,
  findSources,
  householdOwnerOf,
  isLoosePile,
  isStorageEntity,
  listStorage,
  listStorageFor,
  stockOf,
} from "./storageQueries";
import { ReservationKind } from "./storageTypes";
import { assignHome } from "../housing/household";
import { createHousingWorld } from "../housing/testHousingWorld";
import { createStorageWorld, setRules } from "./testStorageWorld";

function deny(entity: Entity, actorId: number, operation: InventoryOperation): void {
  setRules(entity, [
    {
      type: PermissionType.Deny,
      target: { kind: PermissionTargetKind.Entity, entityId: actorId },
      operation,
    },
  ]);
}

// @covers 018:FR-011 018:FR-012 018:FR-013 018:SC-007
describe("isLoosePile and isStorageEntity and listStorage", () => {
  it("counts chests and loose piles, not citizens, boards or queryable:false inventories", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    const pile = world.pile(6, [{ materialId: "oak_log", quantity: 1 }]);
    const hidden = world.chest(7, { Inventory: { queryable: false } });
    const settler = world.spawn("peasant", 8);
    expect(isLoosePile(pile)).toBe(true);
    expect(isLoosePile(chest)).toBe(false);
    expect(isStorageEntity(chest)).toBe(true);
    expect(isStorageEntity(pile)).toBe(true);
    expect(isStorageEntity(hidden)).toBe(false);
    expect(isStorageEntity(settler)).toBe(false);
    expect(isStorageEntity(world.engine.store.require(world.boardId))).toBe(false);
    expect(listStorage(world.engine).map((entity) => entity.id)).toEqual([chest.id, pile.id]);
  });

  it("excludes a construction site by prototype id", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    expect(isStorageEntity(chest)).toBe(true);
    expect(isStorageEntity({ ...chest, prototype: "build_site" })).toBe(false);
  });
});

describe("canRetrieveFrom and canDepositInto", () => {
  it("a locked chest is one whose rules deny the requester (D-09)", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    const settler = world.spawn("peasant", 8);
    expect(canRetrieveFrom(world.engine, chest, settler.id)).toBe(true);
    deny(chest, settler.id, InventoryOperation.Retrieve);
    expect(canRetrieveFrom(world.engine, chest, settler.id)).toBe(false);
    expect(canRetrieveFrom(world.engine, chest, null)).toBe(true);
    expect(canRetrieveFrom(world.engine, world.engine.store.require(world.boardId), null)).toBe(
      false,
    );
  });

  it("checks store permission and the filter", () => {
    const world = createStorageWorld();
    const food = world.chest(5, {
      Stockpile: { priority: 50, filter: { categories: ["food"], materialIds: [] } },
    });
    const settler = world.spawn("peasant", 8);
    expect(canDepositInto(world.engine, food, "bread", settler.id)).toBe(true);
    expect(canDepositInto(world.engine, food, "oak_log", settler.id)).toBe(false);
    deny(food, settler.id, InventoryOperation.Store);
    expect(canDepositInto(world.engine, food, "bread", settler.id)).toBe(false);
    expect(canDepositInto(world.engine, food, "bread", null)).toBe(true);
  });
});

describe("stockOf", () => {
  it("counts storage and loose piles; excludes carried goods and hidden inventories", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    const hidden = world.chest(6, { Inventory: { queryable: false } });
    const pile = world.pile(7, [{ materialId: "oak_log", quantity: 4 }]);
    const settler = world.spawn("peasant", 8);
    world.give(chest, "oak_log", 10);
    world.give(hidden, "oak_log", 30);
    world.give(settler, "oak_log", 5);
    const stock = stockOf(world.engine, "oak_log");
    expect(stock.total).toBe(14);
    expect(stock.reserved).toBe(0);
    expect(stock.available).toBe(14);
    expect(pile.id).toBeGreaterThan(0);
    expect(stockOf(world.engine, "bread").total).toBe(0);
  });

  it("excludes reserved stock from available and counts free capacity", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    world.give(chest, "oak_log", 10);
    const settler = world.spawn("peasant", 8);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: settler.id,
      inventoryOwnerId: chest.id,
      materialId: "oak_log",
      quantity: 4,
    });
    const stock = stockOf(world.engine, "oak_log");
    expect(stock).toMatchObject({ total: 10, reserved: 4, available: 6 });
    // 200 kg weight limit, 5 kg per log: 40 logs fit in all, 10 are in
    expect(stock.free).toBe(30);
  });
});

describe("findSources", () => {
  it("lists sources nearest first, multi-source, minus other holders' reservations", () => {
    const world = createStorageWorld();
    const near = world.chest(11);
    const far = world.chest(15);
    const pile = world.pile(12, [{ materialId: "oak_log", quantity: 2 }]);
    world.give(near, "oak_log", 6);
    world.give(far, "oak_log", 20);
    const settler = world.spawn("peasant", 10);
    const other = world.spawn("peasant", 30);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: other.id,
      inventoryOwnerId: near.id,
      materialId: "oak_log",
      quantity: 4,
    });
    const sources = findSources(world.engine, settler, "oak_log", 10);
    expect(sources.map((source) => [source.entityId, source.quantity])).toEqual([
      [near.id, 2],
      [pile.id, 2],
      [far.id, 6],
    ]);
    expect(sources[0]?.distance).toBeLessThan(sources[2]?.distance ?? 0);
    const holderView = findSources(world.engine, other, "oak_log", 4);
    expect(holderView[0]).toMatchObject({ entityId: near.id, quantity: 4 });
  });

  it("lists everything that exists when short, skips locked and unreachable storage", () => {
    const world = createStorageWorld();
    const open = world.chest(11);
    const locked = world.chest(12);
    world.give(open, "oak_log", 3);
    world.give(locked, "oak_log", 3);
    const settler = world.spawn("peasant", 10);
    deny(locked, settler.id, InventoryOperation.Retrieve);
    expect(findSources(world.engine, settler, "oak_log", 50)).toMatchObject([
      { entityId: open.id, quantity: 3 },
    ]);
  });

  it("is empty for an entity without a position", () => {
    const world = createStorageWorld();
    const chest = world.chest(11);
    world.give(chest, "oak_log", 3);
    const settler = world.spawn("peasant", 10);
    world.engine.store.removeComponent(settler.id, { name: "Position" });
    expect(findSources(world.engine, settler, "oak_log", 1)).toEqual([]);
  });
});

describe("household storage (spec 029 FR-017)", () => {
  const options = { width: 16, height: 12 };

  it("knows which dwelling owns a storage entity", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const inside = world.chest(world.tiles(zone)[3] as number);
    const outside = world.chest(170);
    expect(householdOwnerOf(world.engine, inside)).toBe(zone);
    expect(householdOwnerOf(world.engine, outside)).toBeNull();
  });

  it("leaves household storage out of settlement stock and everyone else's sources", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const inside = world.chest(world.tiles(zone)[3] as number);
    const outside = world.chest(170);
    world.give(inside, "bread", 3);
    world.give(outside, "bread", 2);
    expect(listStorage(world.engine).map((entity) => entity.id)).toEqual([outside.id]);
    expect(stockOf(world.engine, "bread").total).toBe(2);
    const stranger = world.settler(171);
    expect(
      findSources(world.engine, stranger, "bread", 9).map((source) => source.entityId),
    ).toEqual([outside.id]);
  });

  it("offers a resident its own household's storage, and not when it asks for outside goods only", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const inside = world.chest(world.tiles(zone)[3] as number);
    const outside = world.chest(170);
    world.give(inside, "bread", 3);
    world.give(outside, "bread", 2);
    const resident = world.settler(171);
    assignHome(world.engine, resident.id, zone, 0);
    expect(listStorageFor(world.engine, resident, true).map((entity) => entity.id)).toEqual([
      inside.id,
      outside.id,
    ]);
    expect(listStorageFor(world.engine, resident, false).map((entity) => entity.id)).toEqual([
      outside.id,
    ]);
    expect(
      findSources(world.engine, resident, "bread", 9)
        .map((source) => source.entityId)
        .sort((left, right) => left - right),
    ).toEqual([inside.id, outside.id]);
    expect(
      findSources(world.engine, resident, "bread", 9, false).map((source) => source.entityId),
    ).toEqual([outside.id]);
  });
});
