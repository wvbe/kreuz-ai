import { describe, expect, it } from "vitest";
import { loadContent } from "./ContentLoader";
import { SettlementTier } from "./contentTypes";

const content = loadContent();

const specTerrainIds = [
  "grassland",
  "fertile_soil",
  "forest_oak",
  "forest_pine",
  "forest_birch",
  "rocky",
  "stone_deposit",
  "ore_vein",
  "water_shallow",
  "water_deep",
  "marsh",
  "road_dirt",
  "road_stone",
  "sand",
  "vineyard_soil",
  "orchard_soil",
  "clay_deposit",
  "mountain",
  "rock_wall",
  "floor_wood",
  "floor_stone",
];

const specWorkstationIds = [
  "sawmill",
  "forge",
  "anvil",
  "smelter",
  "oven",
  "workbench",
  "spinning_wheel",
  "loom",
  "tanning_rack",
  "parchment_frame",
  "tailoring_bench",
  "grinding_mill",
  "malting_floor",
  "brewing_vat",
  "wine_press",
  "cheese_press",
  "churn",
  "cooking_pot",
  "drying_rack",
  "salting_table",
  "masons_bench",
  "kiln",
  "charcoal_kiln",
  "candle_mold",
  "rope_walk",
  "butchers_block",
  "apiary",
];

const specStorageIds = [
  "chest",
  "barrel",
  "crate",
  "sack",
  "bookcase",
  "coffer",
  "weapon_rack",
  "armor_stand",
  "wine_rack",
  "tool_rack",
  "pantry_shelf",
  "grain_bin",
];

const specOtherFurnitureIds = [
  "straw_pallet",
  "wooden_bed",
  "noble_bed",
  "bench",
  "chair",
  "table",
  "long_table",
  "hearth",
  "throne",
  "altar",
  "candelabra",
  "lectern",
  "reliquary",
  "prayer_bench",
  "church_bell",
  "well",
  "trough",
  "hitching_post",
  "torch_sconce",
  "chandelier",
  "tapestry",
  "banner",
  "gravestone",
  "signpost",
  "notice_post",
];

describe("terrain content (spec 022 US10)", () => {
  it("has the 21 spec terrain types (FR-010 asks for 15)", () => {
    expect(content.terrain.ids().length).toBeGreaterThanOrEqual(21);
    for (const id of specTerrainIds) {
      expect(content.terrainContent.has(id), id).toBe(true);
    }
  });

  it("keeps passability consistent with the block reason", () => {
    for (const terrain of content.terrainContent.all()) {
      expect(terrain.passable === (terrain.blockReason === null), terrain.id).toBe(true);
    }
  });

  it("makes water, deep water, mountain and rock wall impassable and roads fast", () => {
    for (const id of ["water_shallow", "water_deep", "mountain", "rock_wall"]) {
      expect(content.terrainContent.require(id).passable, id).toBe(false);
    }
    const forest = content.terrainContent.require("forest_oak").moveCost;
    const grass = content.terrainContent.require("grassland").moveCost;
    expect(forest).toBeGreaterThan(grass);
    expect(content.terrainContent.require("marsh").moveCost).toBeGreaterThan(forest);
    expect(content.terrainContent.require("road_dirt").moveCost).toBeLessThan(grass);
    // D-75: stone roads are as fast as dirt roads until the pathfinding heuristic is rebaselined
    expect(content.terrainContent.require("road_stone").moveCost).toBeLessThan(grass);
  });

  it("lists the spec harvestables and forests must be cleared before building", () => {
    const harvest = (id: string): string[] =>
      content.terrainContent.require(id).harvestable.map((entry) => entry.materialId);
    expect(harvest("ore_vein")).toEqual(["iron_ore", "copper_ore", "tin_ore", "coal"]);
    expect(harvest("fertile_soil")).toEqual(["wheat", "barley", "rye", "vegetables"]);
    expect(harvest("forest_oak")).toContain("oak_bark");
    expect(harvest("water_shallow")).toEqual(["raw_fish"]);
    for (const id of ["forest_oak", "forest_pine", "forest_birch"]) {
      const forest = content.terrainContent.require(id);
      expect(forest.buildable, id).toBe(false);
      expect(forest.clearsTo, id).toBeDefined();
    }
  });
});

describe("material content (spec 022 US1)", () => {
  it("has at least the 86 spec materials", () => {
    expect(content.materials.ids().length).toBeGreaterThanOrEqual(86);
  });

  it("gives every material a positive stack limit, weight and (but for water) value in milli", () => {
    for (const id of content.materials.ids()) {
      const material = content.materials.require(id);
      expect(Number.isInteger(material.stackLimit) && material.stackLimit > 0, id).toBe(true);
      expect(Number.isInteger(material.weightMilli) && material.weightMilli > 0, id).toBe(true);
      expect(material.valueMilli, id).toBeDefined();
      expect(Number.isInteger(material.valueMilli) && (material.valueMilli ?? 0) >= 0, id).toBe(
        true,
      );
      if (id !== "water") {
        expect(material.valueMilli ?? 0, id).toBeGreaterThan(0);
      }
      if (material.perishabilityTicks !== undefined) {
        expect(Number.isInteger(material.perishabilityTicks), id).toBe(true);
      }
    }
  });

  it("covers the spec 022 FR-001 categories", () => {
    const used = new Set(
      content.materials.ids().flatMap((id) => content.materials.require(id).categories),
    );
    for (const category of [
      "raw",
      "processed",
      "food",
      "drink",
      "tool",
      "weapon",
      "armor",
      "clothing",
      "currency",
      "building",
      "textile",
      "fuel",
      "metal",
      "animal",
      "plant",
      "religious",
    ]) {
      expect(used.has(category), category).toBe(true);
    }
  });

  it("only uses declared categories", () => {
    for (const id of content.materials.ids()) {
      for (const category of content.materials.require(id).categories) {
        expect(content.categories.has(category), `${id}: ${category}`).toBe(true);
      }
    }
  });

  it("has at least 15 food materials, each with a perishability or a non-perishable staple category", () => {
    const food = content.materials
      .ids()
      .map((id) => content.materials.require(id))
      .filter((material) => material.categories.includes("food"));
    expect(food.length).toBeGreaterThanOrEqual(15);
    const nonPerishable = new Set(["honey", "wheat", "barley", "rye", "flour"]);
    for (const material of food) {
      expect(
        material.perishabilityTicks !== undefined || nonPerishable.has(material.id),
        material.id,
      ).toBe(true);
    }
    const perishableDays = (id: string): number =>
      (content.materials.require(id).perishabilityTicks ?? 0) / 288;
    expect(perishableDays("wine")).toBeGreaterThan(perishableDays("ale"));
    expect(perishableDays("cheese")).toBeGreaterThan(perishableDays("milk"));
  });

  it("keeps the shipped ids unchanged", () => {
    expect(content.materials.require("bread").perishabilityTicks).toBe(864);
    expect(content.materials.require("oak_plank").stackLimit).toBe(40);
    expect(content.materials.require("silver_penny").stackLimit).toBe(1000);
  });
});

describe("furniture content (spec 022 US3)", () => {
  const everyId = [...specWorkstationIds, ...specStorageIds, ...specOtherFurnitureIds];

  it("has the 64 spec pieces plus wall and door (FR-003 asks for 50)", () => {
    expect(content.furniture.size).toBeGreaterThanOrEqual(64);
    for (const id of everyId) {
      expect(content.furniture.has(id), id).toBe(true);
    }
    expect(everyId).toHaveLength(64);
  });

  it("resolves every construction and yield material and gives positive ticks", () => {
    for (const piece of content.furniture.all()) {
      for (const amount of [...piece.constructionMaterials, ...piece.deconstructionYield]) {
        expect(content.materials.has(amount.materialId), `${piece.id}: ${amount.materialId}`).toBe(
          true,
        );
        expect(amount.quantity).toBeGreaterThan(0);
      }
      expect(piece.constructionTicks, piece.id).toBeGreaterThan(0);
      expect(piece.constructionMaterials.length, piece.id).toBeGreaterThan(0);
    }
  });

  it("tags every workstation with its own id so recipes can name it", () => {
    for (const id of specWorkstationIds) {
      const piece = content.furniture.require(id);
      expect(piece.tags, id).toContain(id);
      expect(piece.tags, id).toContain("workstation");
    }
  });

  it("gives workstations and storage an engine prototype with the same id (apiary has no inventory)", () => {
    for (const id of [...specWorkstationIds, ...specStorageIds]) {
      if (id === "apiary") {
        continue;
      }
      expect(content.enginePrototypes.has(id), id).toBe(true);
    }
  });

  it("filters storage by categories that exist (barrel takes drink and grain, not metal)", () => {
    const barrel = content.furniture.require("barrel").storage;
    expect(barrel?.categoryFilter).toEqual(["drink", "grain", "preserved"]);
    expect(barrel?.categoryFilter).not.toContain("metal");
    for (const id of specStorageIds) {
      const storage = content.furniture.require(id).storage;
      expect(storage, id).toBeDefined();
      expect(storage?.slotCount, id).toBeGreaterThan(0);
      for (const category of storage?.categoryFilter ?? []) {
        expect(content.categories.has(category), `${id}: ${category}`).toBe(true);
      }
    }
  });

  it("tags every kind of bed with `bed`", () => {
    for (const id of ["straw_pallet", "wooden_bed", "noble_bed"]) {
      expect(content.furniture.require(id).tags, id).toContain("bed");
    }
  });

  it("unlocks the tiers of the spec zone column and the owner decisions", () => {
    const tierOf = (id: string): SettlementTier =>
      content.furniture.require(id).unlockTier ?? SettlementTier.Hamlet;
    expect(tierOf("sawmill")).toBe(SettlementTier.Hamlet);
    expect(tierOf("oven")).toBe(SettlementTier.Hamlet);
    expect(tierOf("forge")).toBe(SettlementTier.Village);
    expect(tierOf("smelter")).toBe(SettlementTier.Village);
    expect(tierOf("notice_post")).toBe(SettlementTier.Village);
    expect(tierOf("church_bell")).toBe(SettlementTier.MarketTown);
    expect(tierOf("loom")).toBe(SettlementTier.MarketTown);
    expect(tierOf("bookcase")).toBe(SettlementTier.CharteredTown);
  });

  it("resolves every furniture tag a zone or dwelling level asks for", () => {
    const tags = new Set(content.furniture.all().flatMap((piece) => piece.tags));
    for (const zone of content.zones.all()) {
      for (const requirement of zone.furnitureRequirements) {
        for (const alternative of requirement) {
          if (alternative.kind === "tag") {
            expect(tags.has(alternative.ref), `${zone.id}: ${alternative.ref}`).toBe(true);
          }
        }
      }
    }
  });

  it("resolves the recipe workstations that exist", () => {
    const tags = new Set(content.furniture.all().flatMap((piece) => piece.tags));
    for (const recipe of content.recipes.all()) {
      expect(tags.has(recipe.workstationTag), recipe.id).toBe(true);
    }
  });
});
