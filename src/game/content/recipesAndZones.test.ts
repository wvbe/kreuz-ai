import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadContent } from "./ContentLoader";
import { recipeSchema, zoneTypeSchema } from "./schemas/economySchemas";

/** The deferred queue of plan task 5.2 (`docs/content-pending-5.2.json`). */
const pending = JSON.parse(
  readFileSync(new URL("../../../docs/content-pending-5.2.json", import.meta.url), "utf8"),
) as { recipes: unknown[]; zones: unknown[] };

const SPEC_RECIPES = 59;
const SPEC_ZONES = 39;

describe("recipes and zone types against spec 022 (task 5.2, D-80)", () => {
  const content = loadContent();

  it("holds each spec recipe and zone either in the pack or in the pending queue, never both", () => {
    const pendingRecipes = pending.recipes.map((entry) => recipeSchema.parse(entry));
    const pendingZones = pending.zones.map((entry) => zoneTypeSchema.parse(entry));
    for (const recipe of pendingRecipes) {
      expect(content.recipes.ids()).not.toContain(recipe.id);
    }
    for (const zone of pendingZones) {
      expect(content.zones.ids()).not.toContain(zone.id);
    }
    expect(new Set(pendingRecipes.map((r) => r.id)).size).toBe(pendingRecipes.length);
    expect(new Set(pendingZones.map((z) => z.id)).size).toBe(pendingZones.length);
    expect(content.recipes.ids().length + pendingRecipes.length).toBe(SPEC_RECIPES);
    expect(content.zones.ids().length + pendingZones.length).toBe(SPEC_ZONES);
  });

  it("gives the open-air and production zone types their activity unlock", () => {
    for (const id of ["carpentry", "farm_field", "orchard", "herb_garden", "vineyard", "quarry"]) {
      expect(content.zones.require(id).activityUnlocks.length).toBeGreaterThan(0);
    }
  });

  it("has no two zone types with an identical requirement set (dwelling shares the bed rule by design)", () => {
    const seen = new Map<string, string>();
    for (const zone of content.zones.all()) {
      if (zone.id === "dwelling") {
        continue;
      }
      const key = JSON.stringify([
        zone.requiresRoom,
        zone.minTiles,
        zone.furnitureRequirements,
        zone.requiresJobBoard,
        zone.effects,
        zone.activityUnlocks,
      ]);
      expect(seen.get(key), `${zone.id} repeats ${seen.get(key)}`).toBeUndefined();
      seen.set(key, zone.id);
    }
  });

  it("makes every recipe input available: produced by a recipe, a job, a crop, a harvest or a raw material", () => {
    const producible = new Set<string>();
    for (const recipe of content.recipes.all()) {
      recipe.outputs.forEach((o) => producible.add(o.materialId));
    }
    for (const job of content.jobs.all()) {
      job.outputs.forEach((o) => producible.add(o.materialId));
    }
    for (const zone of content.zones.all()) {
      zone.cropOutputs.forEach((o) => producible.add(o.materialId));
    }
    for (const terrain of content.terrainContent.all()) {
      terrain.harvestable.forEach((o) => producible.add(o.materialId));
    }
    const unreachable: string[] = [];
    for (const recipe of content.recipes.all()) {
      for (const input of recipe.inputs) {
        const material = content.materials.require(input.materialId);
        if (!producible.has(input.materialId) && material.categoryId !== "raw") {
          unreachable.push(`${recipe.id}:${input.materialId}`);
        }
      }
    }
    expect(unreachable).toEqual([]);
  });

  it("lands the zone types whose furniture the pack holds, with their spec tiers and effects", () => {
    expect(content.zones.require("carpentry").furnitureRequirements).toHaveLength(2);
    expect(content.zones.require("dormitory").furnitureRequirements[0]?.[0]?.count).toBe(3);
    expect(content.zones.require("warehouse").unlockTier).toBe("village");
    expect(content.zones.require("vineyard").unlockTier).toBe("market_town");
    expect(content.zones.require("guard_post").effects[0]?.modifierId).toBe("safety.bonus");
  });
});
