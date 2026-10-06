import { describe, expect, it } from "vitest";
import {
  categorySchema,
  furnitureSchema,
  jobTypeSchema,
  materialContentSchema,
  recipeSchema,
  terrainContentSchema,
  zoneTypeSchema,
} from "./economySchemas";

// @covers 014:FR-001 014:FR-002
describe("materialContentSchema", () => {
  const bread = { id: "bread", name: "Bread", categories: ["food"], stackLimit: 20, weight: 0.5 };

  it("converts weight and value to milli and renames perishability", () => {
    expect(materialContentSchema.parse({ ...bread, value: 2, perishability: 864 })).toEqual({
      id: "bread",
      name: "Bread",
      categories: ["food"],
      stackLimit: 20,
      weightMilli: 500,
      valueMilli: 2000,
      perishabilityTicks: 864,
    });
  });

  it("reuses the inventory definition rules", () => {
    expect(materialContentSchema.safeParse({ ...bread, perishability: 0 }).success).toBe(false);
    expect(materialContentSchema.safeParse({ ...bread, stackLimit: 0 }).success).toBe(false);
    expect(materialContentSchema.safeParse({ ...bread, weightMilli: 5 }).success).toBe(false);
  });
});

describe("terrainContentSchema", () => {
  const grass = { id: "grassland", name: "Grass", moveCost: 10, passable: true, buildable: true };

  it("applies defaults and the map module's passability rule", () => {
    expect(terrainContentSchema.parse(grass)).toMatchObject({ blockReason: null, harvestable: [] });
    expect(terrainContentSchema.safeParse({ ...grass, moveCost: 11 }).success).toBe(false);
    expect(terrainContentSchema.safeParse({ ...grass, passable: false }).success).toBe(false);
    expect(
      terrainContentSchema.safeParse({ ...grass, passable: false, blockReason: "water" }).success,
    ).toBe(true);
  });
});

describe("categorySchema, furnitureSchema, zoneTypeSchema", () => {
  it("accept valid records and reject unknown fields", () => {
    expect(categorySchema.safeParse({ id: "raw", name: "Raw" }).success).toBe(true);
    const bed = { id: "bed", name: "Bed", tags: ["bed"], constructionMaterials: [] };
    expect(furnitureSchema.parse(bed).effects).toEqual([]);
    expect(furnitureSchema.safeParse({ ...bed, unlockTier: "castle" }).success).toBe(false);
    expect(
      furnitureSchema.parse({ ...bed, effects: [{ modifierId: "mood.bonus", value: 5 }] }).effects,
    ).toEqual([{ modifierId: "mood.bonus", value: 5000 }]);
    const zone = { id: "field", name: "Field", requiresRoom: false, minTiles: 1 };
    expect(zoneTypeSchema.parse(zone).furnitureRequirements).toEqual([]);
    expect(zoneTypeSchema.safeParse({ ...zone, furnitureRequirements: [[]] }).success).toBe(false);
  });

  it("zoneTypeSchema reads densities and the job board requirement", () => {
    const zone = { id: "hall", name: "Hall", requiresRoom: true, minTiles: 4 };
    const bed = { kind: "tag", ref: "bed", count: 1, perTiles: 4 };
    const parsed = zoneTypeSchema.parse({
      ...zone,
      requiresJobBoard: true,
      furnitureRequirements: [[bed]],
    });
    expect(parsed.requiresJobBoard).toBe(true);
    expect(parsed.furnitureRequirements[0]?.[0]?.perTiles).toBe(4);
    expect(zoneTypeSchema.parse(zone).requiresJobBoard).toBe(false);
    for (const broken of [
      { ...bed, perTiles: 0 },
      { ...bed, count: 0 },
      { ...bed, kind: "family" },
      { ...bed, ref: "Big Bed" },
    ]) {
      expect(zoneTypeSchema.safeParse({ ...zone, furnitureRequirements: [[broken]] }).success).toBe(
        false,
      );
    }
  });
});

describe("recipeSchema", () => {
  const recipe = {
    id: "bake",
    name: "Bake",
    inputs: [{ materialId: "flour", quantity: 1 }],
    outputs: [{ materialId: "bread", quantity: 2 }],
    durationTicks: 20,
    workstationTag: "oven",
  };

  it("defaults the skill and tools and rejects empty outputs", () => {
    expect(recipeSchema.parse(recipe)).toMatchObject({ skillId: null, toolMaterialIds: [] });
    expect(recipeSchema.safeParse({ ...recipe, outputs: [] }).success).toBe(false);
    expect(recipeSchema.safeParse({ ...recipe, durationTicks: 0 }).success).toBe(false);
  });
});

describe("jobTypeSchema", () => {
  const job = {
    id: "farm.sow",
    name: "Sow",
    zoneContext: { kind: "zone", ref: "farm_field" },
    recurrence: "one-time",
  };

  it("requires a ref exactly for zone and terrain contexts", () => {
    expect(jobTypeSchema.parse(job)).toMatchObject({
      onBoard: true,
      wage: 0,
      priority: 50,
      outputs: [],
    });
    expect(jobTypeSchema.safeParse({ ...job, zoneContext: { kind: "zone" } }).success).toBe(false);
    expect(
      jobTypeSchema.safeParse({ ...job, zoneContext: { kind: "any", ref: "x" } }).success,
    ).toBe(false);
    expect(jobTypeSchema.safeParse({ ...job, zoneContext: { kind: "any" } }).success).toBe(true);
    expect(jobTypeSchema.safeParse({ ...job, id: "sow" }).success).toBe(false);
  });
});
