import { describe, expect, it } from "vitest";
import { InventoryError, InventoryErrorKind, UnknownMaterialError } from "./InventoryError";
import { defaultCurrencyId, MaterialRegistry, materialDefinitionSchema } from "./MaterialRegistry";
import type { MaterialDefinition } from "./MaterialRegistry";

const wood: MaterialDefinition = {
  id: "wood",
  name: "Wood",
  categories: ["building"],
  stackLimit: 50,
  weightMilli: 1000,
};

describe("materialDefinitionSchema", () => {
  it("accepts valid definitions and rejects bad ids, limits and unknown fields", () => {
    expect(materialDefinitionSchema.safeParse(wood).success).toBe(true);
    expect(materialDefinitionSchema.safeParse({ ...wood, id: "Wood" }).success).toBe(false);
    expect(materialDefinitionSchema.safeParse({ ...wood, stackLimit: 0 }).success).toBe(false);
    expect(materialDefinitionSchema.safeParse({ ...wood, weightMilli: 0.5 }).success).toBe(false);
    expect(materialDefinitionSchema.safeParse({ ...wood, extra: 1 }).success).toBe(false);
    expect(materialDefinitionSchema.safeParse({ ...wood, perishabilityTicks: 0 }).success).toBe(
      false,
    );
  });
});

describe("defaultCurrencyId", () => {
  it("is silver_penny", () => {
    expect(defaultCurrencyId).toBe("silver_penny");
    expect(new MaterialRegistry().currencyId).toBe("silver_penny");
    expect(new MaterialRegistry("gold").currencyId).toBe("gold");
  });
});

describe("MaterialRegistry", () => {
  it("registers, looks up and lists materials sorted", () => {
    const registry = new MaterialRegistry();
    registry.registerAll([{ ...wood, id: "zinc" }, wood]);
    expect(registry.has("wood")).toBe(true);
    expect(registry.has("iron")).toBe(false);
    expect(registry.require("wood").stackLimit).toBe(50);
    expect(registry.ids()).toEqual(["wood", "zinc"]);
  });

  it("copies definitions so later edits do not leak in", () => {
    const registry = new MaterialRegistry();
    const input = { ...wood, categories: ["building"] };
    registry.register(input);
    input.categories.push("fuel");
    expect(registry.require("wood").categories).toEqual(["building"]);
  });

  it("throws UnknownMaterialError for unknown ids", () => {
    expect(() => new MaterialRegistry().require("iron")).toThrow(UnknownMaterialError);
  });

  it("rejects invalid and duplicate definitions", () => {
    const registry = new MaterialRegistry();
    expect(() => registry.register({ ...wood, stackLimit: 0 })).toThrow(InventoryError);
    registry.register(wood);
    try {
      registry.register(wood);
      expect.unreachable();
    } catch (error) {
      expect((error as InventoryError).kind).toBe(InventoryErrorKind.InvalidDefinition);
    }
  });
});
