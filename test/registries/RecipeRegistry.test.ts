import { describe, it, expect } from "vitest";
import { createRecipeRegistry } from "../../src/registries/RecipeRegistry.js";
import { createMaterialRegistry } from "../../src/registries/MaterialRegistry.js";

describe("RecipeRegistry", () => {
  const registry = createRecipeRegistry();
  const materials = createMaterialRegistry();

  it("loads at least 55 recipes", () => {
    expect(registry.size).toBeGreaterThanOrEqual(55);
  });

  it("contains wood, metal, textile, food, and weapon recipes", () => {
    expect(registry.has("saw_oak_planks")).toBe(true);
    expect(registry.has("smelt_iron")).toBe(true);
    expect(registry.has("spin_linen_thread")).toBe(true);
    expect(registry.has("bake_bread")).toBe(true);
    expect(registry.has("forge_sword")).toBe(true);
  });

  it("all recipe inputs reference valid material IDs", () => {
    for (const recipe of registry.getAll()) {
      for (const input of recipe.inputs) {
        expect(materials.has(input.materialId)).toBe(true);
      }
    }
  });

  it("all recipe outputs reference valid material IDs", () => {
    for (const recipe of registry.getAll()) {
      for (const output of recipe.outputs) {
        expect(materials.has(output.materialId)).toBe(true);
      }
    }
  });

  it("no circular dependencies (no material requires itself)", () => {
    const recipes = registry.getAll();
    for (const recipe of recipes) {
      const inputIds = recipe.inputs.map((i) => i.materialId);
      const outputIds = recipe.outputs.map((o) => o.materialId);
      // Direct circularity check
      for (const outputId of outputIds) {
        expect(inputIds).not.toContain(outputId);
      }
    }
  });

  it("has no duplicate IDs", () => {
    const all = registry.getAll();
    const ids = all.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("multi-tier chains exist (at least 3 tiers)", () => {
    // Iron Ore -> Iron Ingot -> Iron Sword (3 tiers)
    expect(registry.has("smelt_iron")).toBe(true);
    expect(registry.has("forge_sword")).toBe(true);
    // Flax -> Linen Thread -> Linen Cloth -> Peasant Clothing (4 tiers)
    expect(registry.has("spin_linen_thread")).toBe(true);
    expect(registry.has("weave_linen_cloth")).toBe(true);
    expect(registry.has("sew_peasant_clothing")).toBe(true);
  });
});
