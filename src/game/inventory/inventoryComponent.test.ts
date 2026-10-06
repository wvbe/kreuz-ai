import { describe, expect, it } from "vitest";
import { inventoryComponent, inventoryDataSchema } from "./inventoryComponent";
import { InventoryOperation, PermissionTargetKind, PermissionType } from "./inventoryTypes";
import type { InventoryData } from "./inventoryTypes";

function fullData(): InventoryData {
  return {
    slotCount: 4,
    weightLimitMilli: 50000,
    ownerId: 3,
    queryable: false,
    slots: [
      { materialId: "wood", quantity: 8, remainingMilli: null, decayRateMilli: null },
      { materialId: "cheese", quantity: 2, remainingMilli: 575999, decayRateMilli: 1000 },
    ],
    equipment: [
      { name: "mainHand", restrictionCategory: "weapon", materialId: "sword" },
      { name: "chest", restrictionCategory: "armor", materialId: null },
    ],
    rules: [
      {
        type: PermissionType.Grant,
        target: { kind: PermissionTargetKind.Entity, entityId: 3 },
        operation: InventoryOperation.Transfer,
      },
      {
        type: PermissionType.Deny,
        target: { kind: PermissionTargetKind.Faction, factionId: 2 },
        operation: InventoryOperation.Retrieve,
      },
      {
        type: PermissionType.Deny,
        target: { kind: PermissionTargetKind.Role, role: "guard" },
        operation: InventoryOperation.Equip,
      },
      {
        type: PermissionType.Deny,
        target: { kind: PermissionTargetKind.Anyone },
        operation: InventoryOperation.Store,
      },
    ],
  };
}

describe("inventoryComponent", () => {
  // @covers 005:FR-001
  // @covers 005:FR-002
  it("is named Inventory with empty open defaults", () => {
    expect(inventoryComponent.name).toBe("Inventory");
    expect(inventoryComponent.defaults()).toEqual({
      slotCount: 8,
      weightLimitMilli: null,
      ownerId: null,
      queryable: true,
      slots: [],
      equipment: [],
      rules: [],
    });
  });

  it("returns fresh defaults on every call", () => {
    const first = inventoryComponent.defaults();
    first.slots.push({
      materialId: "wood",
      quantity: 1,
      remainingMilli: null,
      decayRateMilli: null,
    });
    expect(inventoryComponent.defaults().slots).toEqual([]);
  });

  // @covers 005:FR-026
  // @covers 005:FR-027
  // @covers 005:SC-005
  it("round-trips a full inventory through JSON exactly", () => {
    const data = fullData();
    const parsed = inventoryComponent.schema.parse(JSON.parse(JSON.stringify(data)));
    expect(parsed).toEqual(data);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(data));
  });
});

describe("inventoryDataSchema", () => {
  it("rejects unknown fields, fractions and bad slot data", () => {
    const base = fullData();
    expect(inventoryDataSchema.safeParse({ ...base, stackLimit: 10 }).success).toBe(false);
    expect(inventoryDataSchema.safeParse({ ...base, slotCount: 1.5 }).success).toBe(false);
    expect(
      inventoryDataSchema.safeParse({
        ...base,
        slots: [{ materialId: "wood", quantity: 0, remainingMilli: null, decayRateMilli: null }],
      }).success,
    ).toBe(false);
    expect(
      inventoryDataSchema.safeParse({
        ...base,
        slots: [{ materialId: "wood", quantity: 1, remainingMilli: 5, decayRateMilli: null }],
      }).success,
    ).toBe(false);
    expect(
      inventoryDataSchema.safeParse({
        ...base,
        slots: [
          {
            materialId: "wood",
            quantity: 1,
            remainingMilli: null,
            decayRateMilli: null,
            stackLimit: 5,
          },
        ],
      }).success,
    ).toBe(false);
  });

  // @covers 005:FR-022
  it("rejects duplicate equipment names and unknown rule enums", () => {
    const base = fullData();
    expect(
      inventoryDataSchema.safeParse({
        ...base,
        equipment: [
          { name: "a", restrictionCategory: "weapon", materialId: null },
          { name: "a", restrictionCategory: "weapon", materialId: null },
        ],
      }).success,
    ).toBe(false);
    expect(
      inventoryDataSchema.safeParse({
        ...base,
        rules: [{ type: "allow", target: { kind: "anyone" }, operation: "store" }],
      }).success,
    ).toBe(false);
  });

  it("allows more occupied slots than the capacity (reduced capacity keeps contents)", () => {
    const base = fullData();
    expect(inventoryDataSchema.safeParse({ ...base, slotCount: 1 }).success).toBe(true);
  });
});
