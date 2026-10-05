import { describe, expect, it } from "vitest";
import { MapError, MapErrorKind } from "./MapError";
import { BlockReason, MoveCostClass } from "./mapTypes";
import { TerrainRegistry, terrainDefinitionSchema } from "./TerrainRegistry";

const grass = {
  id: "grass",
  moveCost: MoveCostClass.Normal,
  passable: true,
  blockReason: null,
};
const water = {
  id: "deep_water",
  moveCost: MoveCostClass.VerySlow,
  passable: false,
  blockReason: BlockReason.Water,
};

describe("terrainDefinitionSchema", () => {
  it("accepts passable terrain without reason and impassable terrain with one", () => {
    expect(terrainDefinitionSchema.safeParse(grass).success).toBe(true);
    expect(terrainDefinitionSchema.safeParse(water).success).toBe(true);
  });

  it("rejects inconsistent reasons, bad ids, bad cost classes and unknown fields", () => {
    const wall = BlockReason.Wall;
    expect(terrainDefinitionSchema.safeParse({ ...grass, blockReason: wall }).success).toBe(false);
    expect(terrainDefinitionSchema.safeParse({ ...water, blockReason: null }).success).toBe(false);
    expect(terrainDefinitionSchema.safeParse({ ...water, blockReason: wall }).success).toBe(false);
    expect(terrainDefinitionSchema.safeParse({ ...grass, id: "Grass" }).success).toBe(false);
    expect(terrainDefinitionSchema.safeParse({ ...grass, moveCost: 11 }).success).toBe(false);
    expect(terrainDefinitionSchema.safeParse({ ...grass, extra: 1 }).success).toBe(false);
  });
});

describe("TerrainRegistry", () => {
  it("registers, looks up and lists terrain ascending", () => {
    const registry = new TerrainRegistry();
    registry.registerAll([water, grass]);
    expect(registry.has("grass")).toBe(true);
    expect(registry.has("lava")).toBe(false);
    expect(registry.require("deep_water").passable).toBe(false);
    expect(registry.ids()).toEqual(["deep_water", "grass"]);
  });

  it("throws typed errors for duplicates, invalid and unknown terrain", () => {
    const registry = new TerrainRegistry();
    registry.register(grass);
    expect(() => registry.register(grass)).toThrow(MapError);
    expect(() => registry.register({ ...grass, id: "BAD" })).toThrowError(/invalid/);
    expect(() => registry.require("lava")).toThrowError(/unknown terrain/);
    try {
      registry.require("lava");
    } catch (failure) {
      expect((failure as MapError).kind).toBe(MapErrorKind.UnknownTerrain);
    }
  });
});
