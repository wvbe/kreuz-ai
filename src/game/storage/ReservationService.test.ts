import { describe, expect, it } from "vitest";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { getTotal } from "../inventory/inventoryQueries";
import { retrieve } from "../inventory/inventoryOperations";
import { InventoryOperation, PermissionTargetKind, PermissionType } from "../inventory/inventoryTypes";
import { StorageError, StorageErrorKind } from "./StorageError";
import { getStorageService } from "./storageServiceRegistry";
import { ReservationKind } from "./storageTypes";
import { createStorageWorld } from "./testStorageWorld";

function setup() {
  const world = createStorageWorld();
  const chest = world.chest(5);
  world.give(chest, "oak_log", 10);
  const holderA = world.spawn("peasant", 20);
  const holderB = world.spawn("peasant", 21);
  const reservations = getStorageService(world.engine).reservations;
  const request = (holderId: number, quantity: number, kind = ReservationKind.Lock) => ({
    kind,
    holderId,
    inventoryOwnerId: chest.id,
    materialId: "oak_log",
    quantity,
  });
  return { world, chest, holderA, holderB, reservations, request };
}

describe("ReservationService.reserve", () => {
  it("reserves from unreserved stock with a deterministic, never reused id", () => {
    const { reservations, request, holderA } = setup();
    const first = reservations.reserve(request(holderA.id, 4));
    const second = reservations.reserve(request(holderA.id, 2));
    expect(second.id).toBe(first.id + 1);
    reservations.release(first.id);
    expect(reservations.reserve(request(holderA.id, 1)).id).toBe(second.id + 1);
    expect(first).toMatchObject({ kind: ReservationKind.Lock, quantity: 4, createdTick: 0 });
  });

  it("rejects a double reserve beyond the unreserved stock", () => {
    const { reservations, request, holderA, holderB } = setup();
    reservations.reserve(request(holderA.id, 7));
    expect(() => reservations.reserve(request(holderB.id, 4))).toThrow(
      expect.objectContaining({ kind: StorageErrorKind.InsufficientStock }),
    );
    expect(reservations.reserve(request(holderB.id, 3)).quantity).toBe(3);
    expect(() => reservations.reserve(request(holderB.id, 1))).toThrow(StorageError);
  });

  it("rejects non-positive quantities", () => {
    const { reservations, request, holderA } = setup();
    expect(() => reservations.reserve(request(holderA.id, 0))).toThrow(
      expect.objectContaining({ kind: StorageErrorKind.InvalidQuantity }),
    );
    expect(() => reservations.reserve(request(holderA.id, 1.5))).toThrow(StorageError);
  });
});

describe("ReservationService.reserveUpTo", () => {
  it("takes what is left (partial) and returns null when nothing is", () => {
    const { reservations, request, holderA, holderB } = setup();
    reservations.reserve(request(holderA.id, 8));
    expect(reservations.reserveUpTo(request(holderB.id, 5))?.quantity).toBe(2);
    expect(reservations.reserveUpTo(request(holderB.id, 5))).toBeNull();
  });
});

describe("ReservationService.availableTo and reservedQuantity", () => {
  it("hides reserved stock from everybody but the holder", () => {
    const { reservations, chest, holderA, holderB, request } = setup();
    reservations.reserve(request(holderA.id, 6));
    expect(reservations.reservedQuantity(chest.id, "oak_log")).toBe(6);
    expect(reservations.availableTo(chest.id, "oak_log", holderB.id)).toBe(4);
    expect(reservations.availableTo(chest.id, "oak_log", null)).toBe(4);
    expect(reservations.availableTo(chest.id, "oak_log", holderA.id)).toBe(10);
    expect(reservations.reservedQuantity(chest.id, "oak_log", holderA.id)).toBe(0);
  });
});

describe("ReservationService.release and releaseHolder and releaseInventory", () => {
  it("releases one, by holder (optionally by kind) and by inventory", () => {
    const { reservations, chest, holderA, holderB, request } = setup();
    const one = reservations.reserve(request(holderA.id, 1));
    reservations.reserve(request(holderA.id, 1, ReservationKind.Haul));
    reservations.reserve(request(holderB.id, 1));
    expect(reservations.release(one.id)).toBe(true);
    expect(reservations.release(one.id)).toBe(false);
    expect(reservations.releaseHolder(holderA.id, ReservationKind.Lock)).toBe(0);
    expect(reservations.releaseHolder(holderA.id, ReservationKind.Haul)).toBe(1);
    expect(reservations.releaseInventory(chest.id)).toBe(1);
    expect(reservations.all()).toEqual([]);
  });
});

describe("ReservationService.commit", () => {
  it("transfers the reserved goods to the destination and ends the reservation", () => {
    const { world, reservations, chest, holderA, request } = setup();
    const reservation = reservations.reserve(request(holderA.id, 4, ReservationKind.Haul));
    expect(reservations.commit(reservation.id, holderA)).toEqual({
      materialId: "oak_log",
      quantity: 4,
    });
    expect(getTotal(chest, "oak_log")).toBe(6);
    expect(getTotal(holderA, "oak_log")).toBe(4);
    expect(reservations.get(reservation.id)).toBeNull();
    expect(world.engine.store.has(holderA.id)).toBe(true);
  });

  it("consumes the goods without a destination", () => {
    const { reservations, chest, holderA, request } = setup();
    const reservation = reservations.reserve(request(holderA.id, 3));
    reservations.commit(reservation.id, null);
    expect(getTotal(chest, "oak_log")).toBe(7);
  });

  it("is all or nothing: a refused move keeps the reservation", () => {
    const { reservations, chest, holderA, request } = setup();
    (chest.components["Inventory"] as { rules: unknown[] }).rules = [
      {
        type: PermissionType.Deny,
        target: { kind: PermissionTargetKind.Entity, entityId: holderA.id },
        operation: InventoryOperation.Retrieve,
      },
    ];
    const reservation = reservations.reserve(request(holderA.id, 3));
    expect(() => reservations.commit(reservation.id, holderA)).toThrow();
    expect(getTotal(chest, "oak_log")).toBe(10);
    expect(reservations.get(reservation.id)).not.toBeNull();
  });

  it("names an unknown reservation", () => {
    const { reservations, holderA } = setup();
    expect(() => reservations.commit(999, holderA)).toThrow(
      expect.objectContaining({ kind: StorageErrorKind.UnknownReservation }),
    );
  });

  it("fails when the inventory owner has no inventory any more", () => {
    const { world, reservations, chest, holderA, request } = setup();
    const reservation = reservations.reserve(request(holderA.id, 1));
    world.engine.store.removeComponent(chest.id, inventoryComponent);
    expect(() => reservations.commit(reservation.id, holderA)).toThrow(
      expect.objectContaining({ kind: StorageErrorKind.UnknownEntity }),
    );
  });
});

describe("ReservationService get, all, ofHolder", () => {
  it("returns copies ascending by id", () => {
    const { reservations, holderA, holderB, request } = setup();
    const a = reservations.reserve(request(holderA.id, 1));
    const b = reservations.reserve(request(holderB.id, 1));
    const c = reservations.reserve(request(holderA.id, 1));
    expect(reservations.all().map((entry) => entry.id)).toEqual([a.id, b.id, c.id]);
    expect(reservations.ofHolder(holderA.id).map((entry) => entry.id)).toEqual([a.id, c.id]);
    const copy = reservations.get(a.id);
    if (copy !== null) {
      copy.quantity = 99;
    }
    expect(reservations.get(a.id)?.quantity).toBe(1);
  });
});

describe("ReservationService.reconcile", () => {
  it("clamps reservations to the stock and drops those without stock", () => {
    const { world, reservations, chest, holderA, holderB, request } = setup();
    const first = reservations.reserve(request(holderA.id, 6));
    const second = reservations.reserve(request(holderB.id, 4));
    retrieve({ materials: world.engine.materials, actor: null }, chest, "oak_log", 7);
    expect(reservations.reconcile()).toBe(2);
    expect(reservations.get(first.id)?.quantity).toBe(3);
    expect(reservations.get(second.id)).toBeNull();
    expect(reservations.reconcile()).toBe(0);
  });

  it("releases the reservations on a deleted inventory owner", () => {
    const { world, reservations, chest, holderA, request } = setup();
    const reservation = reservations.reserve(request(holderA.id, 2));
    world.engine.store.requestDelete(chest.id);
    world.engine.store.flushDeletions();
    expect(reservations.get(reservation.id)).toBeNull();
  });

  it("drops reservations of a deleted holder", () => {
    const { world, reservations, holderA, request } = setup();
    const reservation = reservations.reserve(request(holderA.id, 2));
    world.engine.store.requestDelete(holderA.id);
    world.engine.store.flushDeletions();
    // the before-delete hook of registerStorage already released it
    expect(reservations.get(reservation.id)).toBeNull();
    expect(reservations.reconcile()).toBe(0);
  });
});

describe("ReservationService.createSection", () => {
  it("round trips JSON through save and load", () => {
    const { world, reservations, holderA, request } = setup();
    reservations.reserve(request(holderA.id, 2, ReservationKind.Tool));
    const saved = world.engine.saveGame();
    const other = createStorageWorld();
    other.engine.loadGame(saved);
    expect(getStorageService(other.engine).reservations.all()).toEqual(reservations.all());
  });

  it("starts empty for older saves and rejects unordered ids", () => {
    const { reservations } = setup();
    const section = reservations.createSection();
    expect(section.defaultForOlderSaves?.()).toEqual({ reservations: [] });
    const entry = {
      kind: ReservationKind.Lock,
      holderId: 3,
      inventoryOwnerId: 4,
      materialId: "oak_log",
      quantity: 1,
      createdTick: 0,
    };
    expect(() =>
      section.restore({ reservations: [{ id: 2, ...entry }, { id: 1, ...entry }] }),
    ).toThrow();
  });
});
