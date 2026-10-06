import { describe, expect, it } from "vitest";
import { activePostingsOfType } from "../jobs/jobBoards";
import { chargesLeft } from "./deposits";
import { terrainJobMaxActivePostings } from "./gatheringTypes";
import { materialStock } from "./materialStock";
import { postTerrainJobs, registerTerrainJobs } from "./terrainJobs";
import { contentWithConstants, createGatheringWorld } from "./testGatheringWorld";

function demandingWorld() {
  return createGatheringWorld({ content: contentWithConstants({ rawLowStock: 3 }) });
}

describe("postTerrainJobs", () => {
  it("posts nothing while nobody demands the material (rawLowStock is 0)", () => {
    const world = createGatheringWorld();
    for (const cell of [31, 32, 33]) {
      world.terrain(cell, "clay_deposit");
    }
    expect(postTerrainJobs(world.engine, 12)).toEqual([]);
  });

  it("posts the nearest cells of a terrain once the material is demanded, bounded", () => {
    const world = demandingWorld();
    for (const cell of [31, 32, 33]) {
      world.terrain(cell, "clay_deposit");
    }
    expect(postTerrainJobs(world.engine, 5)).toEqual([]);
    const created = postTerrainJobs(world.engine, 12);
    expect(created).toHaveLength(terrainJobMaxActivePostings);
    expect(
      activePostingsOfType(world.engine, "dig.clay").map((posting) => posting.target.cellIndex),
    ).toEqual([31, 32]);
    expect(postTerrainJobs(world.engine, 24)).toEqual([]);
  });

  it("stops once the stock covers the demand", () => {
    const world = demandingWorld();
    world.terrain(31, "clay_deposit");
    world.give(world.chest(8), "clay", 3);
    expect(postTerrainJobs(world.engine, 12)).toEqual([]);
  });
});

describe("registerTerrainJobs", () => {
  it("is registered by the engine: registering again is a duplicate", () => {
    expect(() => registerTerrainJobs(createGatheringWorld().engine)).toThrow();
  });

  it("digs clay on demand: stock rises and a charge is used", () => {
    const world = demandingWorld();
    world.terrain(33, "clay_deposit");
    world.give(world.spawn("peasant", 5), "bread", 8);
    world.run(200);
    expect(materialStock(world.engine, "clay")).toBeGreaterThanOrEqual(3);
    expect(chargesLeft(world.engine, world.mapId, 33)).toBeLessThan(4);
  });

  it("fells a pine in one job and leaves grassland", () => {
    const world = demandingWorld();
    world.terrain(33, "forest_pine");
    world.give(world.spawn("peasant", 5), "bread", 8);
    world.run(200);
    expect(materialStock(world.engine, "pine_log")).toBeGreaterThanOrEqual(3);
    expect(world.engine.maps.require(world.mapId).terrainAt(33)).toBe("grassland");
  });
});
