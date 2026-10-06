import { describe, expect, it } from "vitest";
import { terrainGatherJobs, terrainJobAt } from "./terrainJobTypes";
import { createGatheringWorld } from "./testGatheringWorld";

describe("terrainGatherJobs", () => {
  it("lists the terrain jobs of the pack except the three older ones, in file order", () => {
    const { engine } = createGatheringWorld();
    expect(terrainGatherJobs(engine).map((job) => job.id)).toEqual([
      "fell.pine",
      "fell.birch",
      "dig.clay",
      "gather.sand",
      "mine.vein",
      "quarry.granite",
    ]);
    expect(terrainGatherJobs(engine)).toBe(terrainGatherJobs(engine));
  });
});

describe("terrainJobAt", () => {
  it("finds the job of a terrain", () => {
    const { engine } = createGatheringWorld();
    expect(terrainJobAt(engine, "clay_deposit")?.id).toBe("dig.clay");
    expect(terrainJobAt(engine, "ore_vein")?.charges).toBe(8);
    expect(terrainJobAt(engine, "grassland")).toBeUndefined();
    expect(terrainJobAt(engine, "iron_ore_deposit")).toBeUndefined();
  });
});
