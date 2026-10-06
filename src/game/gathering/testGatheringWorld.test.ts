import { describe, expect, it } from "vitest";
import { isInActiveZoneOfType } from "../zones/zoneQueries";
import { fertileTerrainId } from "./gatheringTypes";
import { createGatheringWorld } from "./testGatheringWorld";

describe("createGatheringWorld", () => {
  it("makes a working field of fertile soil", () => {
    const world = createGatheringWorld();
    const zoneId = world.field(world.rect(3, 3, 2, 2));
    expect(world.zoneData(zoneId).tiles).toEqual([33, 34, 43, 44]);
    expect(world.engine.maps.require(world.mapId).terrainAt(33)).toBe(fertileTerrainId);
    expect(isInActiveZoneOfType(world.engine, world.mapId, 33, "farm_field")).toBe(true);
  });

  it("sets terrain and spawns farmers", () => {
    const world = createGatheringWorld();
    world.terrain(5, "forest_oak");
    expect(world.engine.maps.require(world.mapId).terrainAt(5)).toBe("forest_oak");
    expect(world.farmer(7).prototype).toBe("farmer");
  });

  it("throws when the field cannot be designated", () => {
    const world = createGatheringWorld();
    expect(() => world.field([])).toThrow();
  });
});
