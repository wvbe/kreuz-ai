import { describe, expect, it } from "vitest";
import { InvalidQuantityError, InventoryErrorKind, UnknownMaterialError } from "./InventoryError";
import type { InventoryError } from "./InventoryError";
import {
  availableSlots,
  availableWeight,
  canRetrieve,
  canStore,
  currentWeight,
  getAllItems,
  getTotal,
  requireInventory,
} from "./inventoryQueries";
import type { InventorySlot } from "./inventoryTypes";
import { createInventoryEntity, createTestMaterials } from "./testInventories";

const materials = createTestMaterials();

function plain(materialId: string, quantity: number): InventorySlot {
  return { materialId, quantity, remainingMilli: null, decayRateMilli: null };
}

describe("requireInventory", () => {
  it("returns the live data and throws NoInventory without the component", () => {
    const entity = createInventoryEntity(1);
    expect(requireInventory(entity)).toBe(entity.components.Inventory);
    try {
      requireInventory({ id: 2, prototype: "rock", components: {} });
      expect.unreachable();
    } catch (error) {
      expect((error as InventoryError).kind).toBe(InventoryErrorKind.NoInventory);
    }
  });
});

describe("canStore", () => {
  it("uses the corrected arithmetic: wood 8/50 with 2 free slots fits 60 and up to 142", () => {
    const entity = createInventoryEntity(1, { slotCount: 3, slots: [plain("wood", 8)] });
    expect(canStore(materials, entity, "wood", 60)).toEqual({ fits: true, maxFittable: 142 });
    expect(canStore(materials, entity, "wood", 142)).toEqual({ fits: true, maxFittable: 142 });
    expect(canStore(materials, entity, "wood", 143)).toEqual({ fits: false, maxFittable: 142 });
  });

  it("limits by weight too and reports the smaller bound", () => {
    const entity = createInventoryEntity(1, { weightLimitMilli: 50000 });
    expect(canStore(materials, entity, "stone", 11)).toEqual({ fits: false, maxFittable: 10 });
    expect(canStore(materials, entity, "feather", 500)).toEqual({ fits: true, maxFittable: 500 });
  });

  it("is zero for a full inventory and never changes it", () => {
    const entity = createInventoryEntity(1, { slotCount: 1, slots: [plain("wood", 50)] });
    expect(canStore(materials, entity, "wood", 1)).toEqual({ fits: false, maxFittable: 0 });
    expect(canStore(materials, entity, "stone", 1)).toEqual({ fits: false, maxFittable: 0 });
    expect(requireInventory(entity).slots).toEqual([plain("wood", 50)]);
  });

  it("rejects bad quantities and unknown materials", () => {
    const entity = createInventoryEntity(1);
    expect(() => canStore(materials, entity, "wood", 0)).toThrow(InvalidQuantityError);
    expect(() => canStore(materials, entity, "iron", 1)).toThrow(UnknownMaterialError);
  });

  it("guards a store call with exact fitting amounts (US3 AC5 input)", () => {
    const entity = createInventoryEntity(1, { slotCount: 2, slots: [plain("wood", 8)] });
    const { maxFittable } = canStore(materials, entity, "wood", 1);
    expect(maxFittable).toBe(92);
  });
});

describe("canRetrieve", () => {
  it("reports availability and the held quantity", () => {
    const entity = createInventoryEntity(1, { slots: [plain("cheese", 10), plain("cheese", 5)] });
    expect(canRetrieve(materials, entity, "cheese", 10)).toEqual({ available: true, quantity: 15 });
    expect(canRetrieve(materials, entity, "cheese", 16)).toEqual({
      available: false,
      quantity: 15,
    });
    expect(canRetrieve(materials, entity, "stone", 1)).toEqual({ available: false, quantity: 0 });
  });

  it("does not count equipped items and rejects bad input", () => {
    const entity = createInventoryEntity(1, {
      equipment: [{ name: "mainHand", restrictionCategory: "weapon", materialId: "sword" }],
    });
    expect(canRetrieve(materials, entity, "sword", 1).available).toBe(false);
    expect(() => canRetrieve(materials, entity, "sword", -1)).toThrow(InvalidQuantityError);
    expect(() => canRetrieve(materials, entity, "iron", 1)).toThrow(UnknownMaterialError);
  });
});

describe("availableSlots", () => {
  it("counts free slots and is zero when full or over capacity", () => {
    expect(
      availableSlots(createInventoryEntity(1, { slotCount: 3, slots: [plain("wood", 1)] })),
    ).toBe(2);
    expect(
      availableSlots(createInventoryEntity(2, { slotCount: 1, slots: [plain("wood", 1)] })),
    ).toBe(0);
    expect(
      availableSlots(createInventoryEntity(3, { slotCount: 0, slots: [plain("wood", 1)] })),
    ).toBe(0);
  });
});

describe("currentWeight and availableWeight", () => {
  it("sums exact milli weights including equipment", () => {
    const entity = createInventoryEntity(1, {
      weightLimitMilli: 50000,
      slots: [plain("stone", 4), plain("feather", 10)],
      equipment: [{ name: "mainHand", restrictionCategory: "weapon", materialId: "sword" }],
    });
    expect(currentWeight(materials, entity)).toBe(20000 + 1000 + 3000);
    expect(availableWeight(materials, entity)).toBe(26000);
  });

  it("is null without a limit and zero when over the limit", () => {
    expect(availableWeight(materials, createInventoryEntity(1))).toBeNull();
    const over = createInventoryEntity(2, { weightLimitMilli: 1000, slots: [plain("stone", 1)] });
    expect(availableWeight(materials, over)).toBe(0);
  });
});

describe("getTotal and getAllItems", () => {
  const entity = createInventoryEntity(1, {
    slots: [plain("wood", 50), plain("stone", 2), plain("wood", 7), plain("sword", 1)],
    equipment: [
      { name: "mainHand", restrictionCategory: "weapon", materialId: "sword" },
      { name: "offHand", restrictionCategory: "weapon", materialId: null },
    ],
  });

  it("sums across partial stacks (US2 AC4) and includes equipment (US9 AC5)", () => {
    expect(getTotal(entity, "wood")).toBe(57);
    expect(getTotal(entity, "sword")).toBe(2);
    expect(getTotal(entity, "iron")).toBe(0);
  });

  it("lists combined totals sorted by material id", () => {
    expect(getAllItems(entity)).toEqual([
      { materialId: "stone", quantity: 2 },
      { materialId: "sword", quantity: 2 },
      { materialId: "wood", quantity: 57 },
    ]);
  });
});
