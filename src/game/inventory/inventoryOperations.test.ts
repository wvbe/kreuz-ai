import { beforeEach, describe, expect, it } from "vitest";
import {
  AccessDeniedError,
  DestinationFullError,
  EquipmentSlotIncompatibleError,
  InsufficientItemsError,
  InvalidQuantityError,
  InvalidTransferError,
  InventoryError,
  InventoryErrorKind,
  InventoryFullError,
  UnknownMaterialError,
  WeightLimitExceededError,
} from "./InventoryError";
import { equip, retrieve, store, storeUpTo, transfer, unequip } from "./inventoryOperations";
import { getTotal, requireInventory } from "./inventoryQueries";
import { InventoryOperation, PermissionTargetKind, PermissionType } from "./inventoryTypes";
import type { EquipmentSlot, InventoryData, InventorySlot } from "./inventoryTypes";
import { createInventoryEntity, createTestContext } from "./testInventories";

function plain(materialId: string, quantity: number): InventorySlot {
  return { materialId, quantity, remainingMilli: null, decayRateMilli: null };
}

function snapshot(data: InventoryData): string {
  return JSON.stringify(data);
}

const denyAll = [
  {
    type: PermissionType.Deny,
    target: { kind: PermissionTargetKind.Anyone } as const,
    operation: InventoryOperation.Transfer,
  },
];

describe("store", () => {
  it("US1 AC1: stores 8 wood into one slot leaving 2 open", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 3 });
    store(context, entity, "wood", 8);
    expect(requireInventory(entity).slots).toEqual([plain("wood", 8)]);
  });

  it("US1 AC2: fills the existing stack first and overflows into a new slot", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 3, slots: [plain("stone", 8)] });
    store(context, entity, "stone", 5);
    expect(requireInventory(entity).slots).toEqual([plain("stone", 10), plain("stone", 3)]);
  });

  it("US1 AC3: a full inventory rejects with InventoryFullError and stays unchanged", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 1, slots: [plain("wood", 50)] });
    const before = snapshot(requireInventory(entity));
    expect(() => store(context, entity, "wood", 1)).toThrow(InventoryFullError);
    expect(() => store(context, entity, "stone", 1)).toThrow(InventoryFullError);
    expect(snapshot(requireInventory(entity))).toBe(before);
  });

  it("US2 AC1/AC2: separate slots per material and a new stack at the limit", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "cheese", 15);
    store(context, entity, "wood", 30);
    expect(requireInventory(entity).slots).toHaveLength(2);
    store(context, entity, "cheese", 10);
    expect(requireInventory(entity).slots.map((slot) => slot.quantity)).toEqual([20, 30, 5]);
  });

  it("rejects partial fits as a whole (all or nothing)", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 1, slots: [plain("wood", 40)] });
    expect(() => store(context, entity, "wood", 11)).toThrow(InventoryFullError);
    expect(requireInventory(entity).slots).toEqual([plain("wood", 40)]);
  });

  it("validates quantity, material and inventory presence", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    for (const bad of [0, -3, 1.5]) {
      expect(() => store(context, entity, "wood", bad)).toThrow(InvalidQuantityError);
    }
    expect(() => store(context, entity, "iron", 1)).toThrow(UnknownMaterialError);
    try {
      store(context, { id: 5, prototype: "rock", components: {} }, "wood", 1);
      expect.unreachable();
    } catch (error) {
      expect((error as InventoryError).kind).toBe(InventoryErrorKind.NoInventory);
    }
  });

  it("US7: weight limit rejects even with free slots; no limit means no check", () => {
    const { context } = createTestContext();
    const citizen = createInventoryEntity(1, { weightLimitMilli: 50000 });
    store(context, citizen, "stone", 10);
    expect(() => store(context, citizen, "stone", 1)).toThrow(WeightLimitExceededError);
    const chest = createInventoryEntity(2, { slotCount: 20 });
    store(context, chest, "stone", 200);
    expect(getTotal(chest, "stone")).toBe(200);
  });

  it("emits inventory.item.stored when the bus queue is processed", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(7);
    store(context, entity, "wood", 3);
    expect(events).toEqual([]);
    bus.processQueue();
    expect(events).toEqual([
      { name: "inventory.item.stored", payload: { entityId: 7, materialId: "wood", quantity: 3 } },
    ]);
  });

  it("works without a bus and emits no event on failure", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 0 });
    expect(() => store(context, entity, "wood", 1)).toThrow(InventoryFullError);
    bus.processQueue();
    expect(events).toEqual([]);
    const quiet = { materials: context.materials, actor: null };
    expect(() => store(quiet, createInventoryEntity(2), "wood", 1)).not.toThrow();
  });

  it("starts perishable stacks fresh and merges later stores with a weighted floor (US8 AC2)", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "cheese", 4);
    requireInventory(entity).slots[0]!.remainingMilli = 100000;
    store(context, entity, "cheese", 6);
    expect(requireInventory(entity).slots).toEqual([
      {
        materialId: "cheese",
        quantity: 10,
        remainingMilli: Math.floor((4 * 100000 + 6 * 576000) / 10),
        decayRateMilli: 1000,
      },
    ]);
    bus.processQueue();
    expect(events.map((event) => event.name)).toEqual([
      "inventory.item.stored",
      "inventory.item.stored",
      "inventory.item.stack.merged",
    ]);
    expect(events[2]?.payload).toEqual({ entityId: 1, materialId: "cheese", quantity: 6 });
  });

  it("US8 AC3: a store beyond a full stack starts a separate stack with its own timer", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "cheese", 20);
    requireInventory(entity).slots[0]!.remainingMilli = 1000;
    store(context, entity, "cheese", 5);
    expect(requireInventory(entity).slots.map((slot) => slot.remainingMilli)).toEqual([
      1000, 576000,
    ]);
  });
});

describe("storeUpTo", () => {
  it("US6 AC1: stores what fits and returns the remainder", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 1, slots: [plain("wood", 45)] });
    expect(storeUpTo(context, entity, "wood", 20)).toEqual({ stored: 5, remainder: 15 });
    expect(requireInventory(entity).slots).toEqual([plain("wood", 50)]);
  });

  it("US6 AC2: a full inventory stores nothing and emits nothing", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 0 });
    expect(storeUpTo(context, entity, "wood", 10)).toEqual({ stored: 0, remainder: 10 });
    bus.processQueue();
    expect(events).toEqual([]);
  });

  it("US6 AC3: exactly fitting quantities leave no remainder; stored + remainder is conserved", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 2, weightLimitMilli: 60000 });
    expect(storeUpTo(context, entity, "wood", 60)).toEqual({ stored: 60, remainder: 0 });
    const heavy = createInventoryEntity(2, { weightLimitMilli: 12000 });
    expect(storeUpTo(context, heavy, "stone", 5)).toEqual({ stored: 2, remainder: 3 });
  });

  it("still enforces validation and permissions", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { rules: denyAll });
    expect(() => storeUpTo({ ...context, actor: 9 }, entity, "wood", 1)).toThrow(AccessDeniedError);
    expect(() => storeUpTo(context, entity, "wood", 0)).toThrow(InvalidQuantityError);
    expect(() => storeUpTo(context, entity, "iron", 1)).toThrow(UnknownMaterialError);
  });
});

describe("retrieve", () => {
  it("US1 AC4: removes the quantity and returns it", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slots: [plain("stone", 5)] });
    expect(retrieve(context, entity, "stone", 3)).toEqual([{ materialId: "stone", quantity: 3 }]);
    expect(requireInventory(entity).slots).toEqual([plain("stone", 2)]);
  });

  it("US1 AC5: asking for more than held rejects with InsufficientItemsError and no change", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slots: [plain("stone", 2)] });
    expect(() => retrieve(context, entity, "stone", 5)).toThrow(InsufficientItemsError);
    expect(requireInventory(entity).slots).toEqual([plain("stone", 2)]);
  });

  it("US2 AC3: reclaims emptied slots and drains smallest stacks first", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, {
      slotCount: 2,
      slots: [plain("stone", 10), plain("stone", 5)],
    });
    retrieve(context, entity, "stone", 5);
    expect(requireInventory(entity).slots).toEqual([plain("stone", 10)]);
    store(context, entity, "wood", 50);
    expect(requireInventory(entity).slots).toHaveLength(2);
  });

  it("validates input and emits inventory.item.retrieved", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(3, { slots: [plain("wood", 9)] });
    expect(() => retrieve(context, entity, "wood", 0)).toThrow(InvalidQuantityError);
    expect(() => retrieve(context, entity, "iron", 1)).toThrow(UnknownMaterialError);
    retrieve(context, entity, "wood", 4);
    bus.processQueue();
    expect(events).toEqual([
      {
        name: "inventory.item.retrieved",
        payload: { entityId: 3, materialId: "wood", quantity: 4 },
      },
    ]);
  });

  it("cannot take equipped items", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, {
      equipment: [{ name: "mainHand", restrictionCategory: "weapon", materialId: "sword" }],
    });
    expect(() => retrieve(context, entity, "sword", 1)).toThrow(InsufficientItemsError);
  });
});

describe("transfer", () => {
  it("US5 AC1: moves items and keeps the total", () => {
    const { context, bus, events } = createTestContext();
    const source = createInventoryEntity(1, { slots: [plain("wood", 20)] });
    const destination = createInventoryEntity(2);
    transfer(context, source, destination, "wood", 10);
    expect(getTotal(source, "wood")).toBe(10);
    expect(getTotal(destination, "wood")).toBe(10);
    bus.processQueue();
    expect(events).toEqual([
      {
        name: "inventory.item.transferred",
        payload: { sourceId: 1, destinationId: 2, materialId: "wood", quantity: 10 },
      },
    ]);
  });

  it("US5 AC2: a full destination rejects with DestinationFullError and changes nothing", () => {
    const { context } = createTestContext();
    const source = createInventoryEntity(1, { slots: [plain("wood", 5)] });
    const destination = createInventoryEntity(2, { slotCount: 1, slots: [plain("stone", 3)] });
    const before = [snapshot(requireInventory(source)), snapshot(requireInventory(destination))];
    expect(() => transfer(context, source, destination, "wood", 5)).toThrow(DestinationFullError);
    expect([snapshot(requireInventory(source)), snapshot(requireInventory(destination))]).toEqual(
      before,
    );
  });

  it("US5 AC3: insufficient source items reject and change nothing", () => {
    const { context } = createTestContext();
    const source = createInventoryEntity(1, { slots: [plain("wood", 3)] });
    const destination = createInventoryEntity(2);
    expect(() => transfer(context, source, destination, "wood", 10)).toThrow(
      InsufficientItemsError,
    );
    expect(getTotal(source, "wood")).toBe(3);
    expect(getTotal(destination, "wood")).toBe(0);
  });

  it("rejects a weight overflow at the destination atomically", () => {
    const { context } = createTestContext();
    const source = createInventoryEntity(1, { slots: [plain("stone", 10)] });
    const destination = createInventoryEntity(2, { weightLimitMilli: 20000 });
    expect(() => transfer(context, source, destination, "stone", 5)).toThrow(
      WeightLimitExceededError,
    );
    expect(getTotal(source, "stone")).toBe(10);
    expect(getTotal(destination, "stone")).toBe(0);
  });

  it("is atomic when the destination check passes late: nothing is written on any failure path", () => {
    const { context } = createTestContext();
    const source = createInventoryEntity(1, { slots: [plain("wood", 30)] });
    const destination = createInventoryEntity(2, { slotCount: 1, slots: [plain("wood", 30)] });
    const before = [snapshot(requireInventory(source)), snapshot(requireInventory(destination))];
    expect(() => transfer(context, source, destination, "wood", 21)).toThrow(DestinationFullError);
    expect([snapshot(requireInventory(source)), snapshot(requireInventory(destination))]).toEqual(
      before,
    );
    transfer(context, source, destination, "wood", 20);
    expect(requireInventory(destination).slots).toEqual([plain("wood", 50)]);
    expect(requireInventory(source).slots).toEqual([plain("wood", 10)]);
  });

  it("rejects self transfers, bad quantities and unknown materials", () => {
    const { context } = createTestContext();
    const source = createInventoryEntity(1, { slots: [plain("wood", 3)] });
    expect(() => transfer(context, source, source, "wood", 1)).toThrow(InvalidTransferError);
    expect(() => transfer(context, source, createInventoryEntity(2), "wood", 0)).toThrow(
      InvalidQuantityError,
    );
    expect(() => transfer(context, source, createInventoryEntity(2), "iron", 1)).toThrow(
      UnknownMaterialError,
    );
  });

  it("keeps perishable freshness and merges at the destination with the weighted floor", () => {
    const { context } = createTestContext();
    const source = createInventoryEntity(1);
    store(context, source, "cheese", 10);
    requireInventory(source).slots[0]!.remainingMilli = 200000;
    const destination = createInventoryEntity(2);
    store(context, destination, "cheese", 10);
    transfer(context, source, destination, "cheese", 10);
    expect(requireInventory(source).slots).toEqual([]);
    expect(requireInventory(destination).slots).toEqual([
      { materialId: "cheese", quantity: 20, remainingMilli: 388000, decayRateMilli: 1000 },
    ]);
  });
});

describe("permissions on operations", () => {
  const trusted = [
    {
      type: PermissionType.Grant,
      target: { kind: PermissionTargetKind.Entity, entityId: 50 } as const,
      operation: InventoryOperation.Transfer,
    },
    ...denyAll,
  ];

  it("US10 AC1/AC3: a locked chest denies strangers, open inventories allow anyone", () => {
    const { context } = createTestContext();
    const chest = createInventoryEntity(1, { slots: [plain("wood", 5)], rules: denyAll });
    expect(() => retrieve({ ...context, actor: 9 }, chest, "wood", 1)).toThrow(AccessDeniedError);
    expect(() => store({ ...context, actor: 9 }, chest, "wood", 1)).toThrow(AccessDeniedError);
    const open = createInventoryEntity(2, { slots: [plain("wood", 5)] });
    expect(() => retrieve({ ...context, actor: 9 }, open, "wood", 1)).not.toThrow();
  });

  it("US10 AC2: authorised actors and the system actor pass", () => {
    const { context } = createTestContext();
    const chest = createInventoryEntity(1, { slots: [plain("wood", 5)], rules: trusted });
    expect(() => retrieve({ ...context, actor: 50 }, chest, "wood", 1)).not.toThrow();
    expect(() => retrieve(context, chest, "wood", 1)).not.toThrow();
  });

  it("transfer checks Retrieve on the source and Store on the destination for the actor", () => {
    const { context } = createTestContext();
    const actor = { ...context, actor: 9 };
    const lockedSource = createInventoryEntity(1, {
      slots: [plain("wood", 5)],
      rules: [{ ...denyAll[0]!, operation: InventoryOperation.Retrieve }],
    });
    const open = createInventoryEntity(2);
    expect(() => transfer(actor, lockedSource, open, "wood", 1)).toThrow(AccessDeniedError);
    const source = createInventoryEntity(3, { slots: [plain("wood", 5)] });
    const lockedDestination = createInventoryEntity(4, {
      rules: [{ ...denyAll[0]!, operation: InventoryOperation.Store }],
    });
    expect(() => transfer(actor, source, lockedDestination, "wood", 1)).toThrow(AccessDeniedError);
    expect(getTotal(source, "wood")).toBe(5);
    expect(() => transfer(context, source, lockedDestination, "wood", 1)).not.toThrow();
  });

  it("Equip rules gate equip and unequip, and Store/Retrieve rules do not", () => {
    const { context } = createTestContext();
    const actor = { ...context, actor: 9 };
    const slot = { name: "mainHand", restrictionCategory: "weapon", materialId: null };
    const locked = createInventoryEntity(1, {
      slots: [plain("sword", 1)],
      equipment: [slot],
      rules: [{ ...denyAll[0]!, operation: InventoryOperation.Equip }],
    });
    expect(() => equip(actor, locked, "sword", "mainHand")).toThrow(AccessDeniedError);
    expect(() => unequip(actor, locked, "mainHand")).toThrow(AccessDeniedError);
    const storeLocked = createInventoryEntity(2, {
      slots: [plain("sword", 1)],
      equipment: [{ ...slot }],
      rules: denyAll,
    });
    expect(() => equip(actor, storeLocked, "sword", "mainHand")).not.toThrow();
  });
});

describe("equip and unequip", () => {
  let slots: EquipmentSlot[] = [];
  beforeEach(() => {
    slots = [
      { name: "mainHand", restrictionCategory: "weapon", materialId: null },
      { name: "chest", restrictionCategory: "armor", materialId: null },
    ];
  });

  it("US9 AC1: moves an item from storage into the slot", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(1, { slots: [plain("sword", 1)], equipment: slots });
    equip(context, entity, "sword", "mainHand");
    expect(requireInventory(entity).slots).toEqual([]);
    expect(requireInventory(entity).equipment[0]?.materialId).toBe("sword");
    bus.processQueue();
    expect(events).toEqual([
      {
        name: "inventory.item.equipped",
        payload: { entityId: 1, materialId: "sword", slotName: "mainHand" },
      },
    ]);
  });

  it("US9 AC2: swaps an occupied slot and returns the old item to storage", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(1, {
      slotCount: 1,
      slots: [plain("dagger", 1)],
      equipment: [{ ...slots[0]!, materialId: "sword" }, slots[1]!],
    });
    equip(context, entity, "dagger", "mainHand");
    expect(requireInventory(entity).slots).toEqual([plain("sword", 1)]);
    expect(requireInventory(entity).equipment[0]?.materialId).toBe("dagger");
    bus.processQueue();
    expect(events.map((event) => event.name)).toEqual([
      "inventory.item.unequipped",
      "inventory.item.equipped",
    ]);
  });

  it("US9 AC3: rejects incompatible items and unknown slots", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slots: [plain("bread", 1)], equipment: slots });
    expect(() => equip(context, entity, "bread", "chest")).toThrow(EquipmentSlotIncompatibleError);
    try {
      equip(context, entity, "bread", "head");
      expect.unreachable();
    } catch (error) {
      expect((error as InventoryError).kind).toBe(InventoryErrorKind.UnknownEquipmentSlot);
    }
    expect(() => equip(context, entity, "iron", "chest")).toThrow(UnknownMaterialError);
  });

  it("requires the item in general storage and leaves state unchanged when it is missing", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { equipment: slots });
    expect(() => equip(context, entity, "sword", "mainHand")).toThrow(InsufficientItemsError);
    expect(requireInventory(entity).equipment[0]?.materialId).toBeNull();
  });

  it("a swap that cannot return the old item is rejected atomically", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, {
      slotCount: 1,
      slots: [plain("bread", 2)],
      equipment: [{ name: "meal", restrictionCategory: "food", materialId: "cheese" }],
    });
    const before = snapshot(requireInventory(entity));
    expect(() => equip(context, entity, "bread", "meal")).toThrow(InventoryFullError);
    expect(snapshot(requireInventory(entity))).toBe(before);
    requireInventory(entity).slotCount = 2;
    equip(context, entity, "bread", "meal");
    expect(requireInventory(entity).equipment[0]?.materialId).toBe("bread");
    expect(getTotal(entity, "cheese")).toBe(1);
  });

  it("unequip returns the item; with no room it rejects and the item stays equipped", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(1, {
      slotCount: 1,
      equipment: [{ ...slots[0]!, materialId: "sword" }],
    });
    unequip(context, entity, "mainHand");
    expect(requireInventory(entity).slots).toEqual([plain("sword", 1)]);
    expect(requireInventory(entity).equipment[0]?.materialId).toBeNull();
    bus.processQueue();
    expect(events[0]?.name).toBe("inventory.item.unequipped");

    const full = createInventoryEntity(2, {
      slotCount: 1,
      slots: [plain("wood", 1)],
      equipment: [{ ...slots[0]!, materialId: "sword" }],
    });
    expect(() => unequip(context, full, "mainHand")).toThrow(InventoryFullError);
    expect(requireInventory(full).equipment[0]?.materialId).toBe("sword");
  });

  it("unequip rejects empty and unknown slots", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { equipment: slots });
    try {
      unequip(context, entity, "mainHand");
      expect.unreachable();
    } catch (error) {
      expect((error as InventoryError).kind).toBe(InventoryErrorKind.EmptyEquipmentSlot);
    }
    expect(() => unequip(context, entity, "head")).toThrow(InventoryError);
  });

  it("equipped items keep counting toward weight so equipping is weight neutral", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, {
      weightLimitMilli: 3000,
      slots: [plain("sword", 1)],
      equipment: slots,
    });
    equip(context, entity, "sword", "mainHand");
    expect(() => store(context, entity, "feather", 1)).toThrow(WeightLimitExceededError);
    unequip(context, entity, "mainHand");
    expect(requireInventory(entity).slots).toEqual([plain("sword", 1)]);
  });
});
