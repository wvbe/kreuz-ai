import { describe, expect, it } from "vitest";
import { inventoryComponent } from "./inventoryComponent";
import type { InventoryData, InventorySlot } from "./inventoryTypes";
import {
  addToSlots,
  cloneSlots,
  fitCapacityOf,
  freeSlotCount,
  freshFreshness,
  normalDecayRateMilli,
  slotFitOf,
  storedQuantity,
  takeFromSlots,
  totalWeightMilli,
} from "./stackPlanning";
import { createTestMaterials } from "./testInventories";

const materials = createTestMaterials();

function plain(materialId: string, quantity: number): InventorySlot {
  return { materialId, quantity, remainingMilli: null, decayRateMilli: null };
}

function cheese(quantity: number, remainingMilli: number): InventorySlot {
  return { materialId: "cheese", quantity, remainingMilli, decayRateMilli: 1000 };
}

function data(overrides: Partial<InventoryData> = {}): InventoryData {
  return { ...inventoryComponent.defaults(), ...overrides };
}

describe("cloneSlots", () => {
  it("copies every slot", () => {
    const original = [plain("wood", 5)];
    const copy = cloneSlots(original);
    copy[0]!.quantity = 9;
    expect(original[0]?.quantity).toBe(5);
  });
});

describe("freshFreshness", () => {
  it("is full time at normal rate for perishables and null otherwise", () => {
    expect(normalDecayRateMilli).toBe(1000);
    expect(freshFreshness(materials.require("cheese"))).toEqual({
      remainingMilli: 576000,
      decayRateMilli: 1000,
    });
    expect(freshFreshness(materials.require("wood"))).toBeNull();
  });
});

describe("freeSlotCount", () => {
  it("never goes negative", () => {
    expect(freeSlotCount(data({ slotCount: 3, slots: [plain("wood", 1)] }))).toBe(2);
    expect(freeSlotCount(data({ slotCount: 0, slots: [plain("wood", 1)] }))).toBe(0);
  });
});

describe("totalWeightMilli", () => {
  it("sums stacks and equipped items exactly", () => {
    const inventory = data({
      slots: [plain("stone", 3), plain("feather", 7)],
      equipment: [
        { name: "mainHand", restrictionCategory: "weapon", materialId: "sword" },
        { name: "offHand", restrictionCategory: "weapon", materialId: null },
      ],
    });
    expect(totalWeightMilli(materials, inventory)).toBe(3 * 5000 + 7 * 100 + 3000);
  });
});

describe("slotFitOf", () => {
  it("counts partial stack room plus free slots", () => {
    const inventory = data({ slotCount: 3, slots: [plain("wood", 8)] });
    expect(slotFitOf(materials.require("wood"), inventory)).toBe(42 + 2 * 50);
  });

  it("treats a stack above a lowered limit as full", () => {
    const inventory = data({ slotCount: 1, slots: [plain("stone", 25)] });
    expect(slotFitOf(materials.require("stone"), inventory)).toBe(0);
  });
});

describe("fitCapacityOf", () => {
  it("reports slot and weight limits separately", () => {
    const inventory = data({ slotCount: 4, weightLimitMilli: 50000 });
    expect(fitCapacityOf(materials, inventory, "stone")).toEqual({
      slotFit: 40,
      weightFit: 10,
      maxFittable: 10,
    });
    expect(fitCapacityOf(materials, inventory, "silver_penny")).toEqual({
      slotFit: 4000,
      weightFit: null,
      maxFittable: 4000,
    });
  });

  it("has no weight fit without a limit and zero when over the limit", () => {
    expect(fitCapacityOf(materials, data({ slotCount: 1 }), "wood").weightFit).toBeNull();
    const over = data({ weightLimitMilli: 1000, slots: [plain("stone", 1)] });
    expect(fitCapacityOf(materials, over, "wood").maxFittable).toBe(0);
  });
});

describe("addToSlots", () => {
  it("fills partial stacks before opening slots", () => {
    const slots = [plain("wood", 48)];
    expect(addToSlots(slots, materials.require("wood"), 105, null)).toBe(0);
    expect(slots.map((slot) => slot.quantity)).toEqual([50, 50, 50, 3]);
  });

  it("merges perishable stacks with a weighted floor and counts merged items", () => {
    const slots = [cheese(3, 100001)];
    const merged = addToSlots(slots, materials.require("cheese"), 2, {
      remainingMilli: 576000,
      decayRateMilli: 1000,
    });
    expect(merged).toBe(2);
    expect(slots).toEqual([cheese(5, Math.floor((3 * 100001 + 2 * 576000) / 5))]);
  });

  it("starts new perishable stacks with the given freshness", () => {
    const slots: InventorySlot[] = [];
    addToSlots(slots, materials.require("cheese"), 25, {
      remainingMilli: 5000,
      decayRateMilli: 500,
    });
    expect(slots).toEqual([
      { materialId: "cheese", quantity: 20, remainingMilli: 5000, decayRateMilli: 500 },
      { materialId: "cheese", quantity: 5, remainingMilli: 5000, decayRateMilli: 500 },
    ]);
  });
});

describe("takeFromSlots", () => {
  it("drains soonest-to-expire first, then smallest, then lowest slot, and reclaims slots", () => {
    const slots = [cheese(10, 9000), cheese(4, 2000), cheese(6, 2000)];
    const portions = takeFromSlots(slots, "cheese", 12);
    expect(portions.map((portion) => portion.quantity)).toEqual([4, 6, 2]);
    expect(portions[0]?.freshness).toEqual({ remainingMilli: 2000, decayRateMilli: 1000 });
    expect(slots).toEqual([cheese(8, 9000)]);
  });

  it("takes smallest plain stacks first and leaves other materials alone", () => {
    const slots = [plain("wood", 50), plain("stone", 2), plain("wood", 7)];
    takeFromSlots(slots, "wood", 10);
    expect(slots).toEqual([plain("wood", 47), plain("stone", 2)]);
    expect(takeFromSlots(slots, "wood", 1)[0]?.freshness).toBeNull();
  });
});

describe("storedQuantity", () => {
  it("sums all stacks of the material", () => {
    const inventory = data({ slots: [plain("wood", 50), plain("stone", 2), plain("wood", 7)] });
    expect(storedQuantity(inventory, "wood")).toBe(57);
    expect(storedQuantity(inventory, "iron")).toBe(0);
  });
});
