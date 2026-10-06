import { describe, expect, it } from "vitest";
import {
  AccessDeniedError,
  InsufficientFundsError,
  InvalidQuantityError,
  InventoryFullError,
} from "./InventoryError";
import { credit, debit, getBalance } from "./inventoryMoney";
import { transfer } from "./inventoryOperations";
import { requireInventory } from "./inventoryQueries";
import { InventoryOperation, PermissionTargetKind, PermissionType } from "./inventoryTypes";
import { createInventoryEntity, createTestContext } from "./testInventories";

describe("getBalance", () => {
  it("is zero for an empty inventory and sums the currency stacks", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    expect(getBalance(context, entity)).toBe(0);
    credit(context, entity, 2500);
    expect(getBalance(context, entity)).toBe(2500);
    expect(requireInventory(entity).slots.map((slot) => slot.quantity)).toEqual([1000, 1000, 500]);
  });
});

describe("credit", () => {
  // @covers 005:FR-012
  it("US4 AC1: puts money into a slot", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    credit(context, entity, 100);
    expect(getBalance(context, entity)).toBe(100);
    expect(requireInventory(entity).slots).toHaveLength(1);
  });

  it("is all or nothing: coins that do not fit throw and change nothing", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, { slotCount: 1 });
    credit(context, entity, 900);
    expect(() => credit(context, entity, 101)).toThrow(InventoryFullError);
    expect(getBalance(context, entity)).toBe(900);
    expect(() => credit(context, entity, 0)).toThrow(InvalidQuantityError);
  });

  it("emits inventory.item.stored for the currency", () => {
    const { context, bus, events } = createTestContext();
    credit(context, createInventoryEntity(4), 5);
    bus.processQueue();
    expect(events[0]?.payload).toEqual({ entityId: 4, materialId: "silver_penny", quantity: 5 });
  });
});

describe("debit", () => {
  // @covers 005:FR-012
  it("US4 AC2: reduces the balance", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    credit(context, entity, 150);
    debit(context, entity, 50);
    expect(getBalance(context, entity)).toBe(100);
  });

  // @covers 005:FR-013
  // @covers 005:SC-003
  it("US4 AC3: insufficient funds reject and leave the balance unchanged", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    credit(context, entity, 30);
    expect(() => debit(context, entity, 50)).toThrow(InsufficientFundsError);
    expect(getBalance(context, entity)).toBe(30);
    expect(() => debit(context, entity, -1)).toThrow(InvalidQuantityError);
  });

  it("checks Retrieve permission before funds", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1, {
      rules: [
        {
          type: PermissionType.Deny,
          target: { kind: PermissionTargetKind.Anyone },
          operation: InventoryOperation.Retrieve,
        },
      ],
    });
    expect(() => debit({ ...context, actor: 9 }, entity, 5)).toThrow(AccessDeniedError);
  });
});

describe("money conservation", () => {
  // @covers 005:SC-004
  it("US4 AC4: debit plus credit across two entities conserves the total", () => {
    const { context } = createTestContext();
    const first = createInventoryEntity(1);
    const second = createInventoryEntity(2);
    credit(context, first, 700);
    credit(context, second, 50);
    debit(context, first, 100);
    credit(context, second, 100);
    expect(getBalance(context, first) + getBalance(context, second)).toBe(750);
  });

  // @covers 005:SC-004
  it("US5 AC4: transferring money conserves the total", () => {
    const { context } = createTestContext();
    const first = createInventoryEntity(1);
    const second = createInventoryEntity(2);
    credit(context, first, 1800);
    transfer(context, first, second, "silver_penny", 1234);
    expect(getBalance(context, first)).toBe(566);
    expect(getBalance(context, second)).toBe(1234);
  });

  it("US4 AC5: the balance survives JSON exactly", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    credit(context, entity, 7777);
    const copy = createInventoryEntity(1, JSON.parse(JSON.stringify(requireInventory(entity))));
    expect(getBalance(context, copy)).toBe(7777);
  });
});
