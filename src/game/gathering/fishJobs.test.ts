import { describe, expect, it } from "vitest";
import { activePostingsOfType } from "../jobs/jobBoards";
import { skillValueMilli } from "../skills/skillLevels";
import { isFishingSpot, postFishJobs, registerFishJobs } from "./fishJobs";
import { fishCatchJobId } from "./gatheringTypes";
import { materialStock } from "./materialStock";
import { createGatheringWorld } from "./testGatheringWorld";

function dockWorld() {
  const world = createGatheringWorld();
  for (const cell of [60, 61, 62, 63]) {
    world.terrain(cell, "water_shallow");
  }
  world.zoneOver("fishing_dock", [50, 51, 52, 53], "grassland");
  return world;
}

describe("isFishingSpot", () => {
  it("is a dock tile next to shallow water, and nothing else", () => {
    const world = dockWorld();
    expect(isFishingSpot(world.engine, world.mapId, 51)).toBe(true);
    expect(isFishingSpot(world.engine, world.mapId, 70)).toBe(false);
    const dry = createGatheringWorld();
    dry.zoneOver("fishing_dock", [50, 51, 52, 53], "grassland");
    expect(isFishingSpot(dry.engine, dry.mapId, 51)).toBe(false);
  });

  it("needs an active dock past its activation tick", () => {
    const world = createGatheringWorld();
    world.terrain(60, "water_shallow");
    world.designate("fishing_dock", [50, 51, 52, 53]);
    expect(isFishingSpot(world.engine, world.mapId, 51)).toBe(false);
  });
});

describe("postFishJobs", () => {
  it("posts the dock cells next to water, bounded, and stops at the stock cap", () => {
    const world = dockWorld();
    expect(postFishJobs(world.engine, 5)).toEqual([]);
    const created = postFishJobs(world.engine, 12);
    expect(created.length).toBeGreaterThan(0);
    expect(activePostingsOfType(world.engine, fishCatchJobId)).toHaveLength(created.length);
    const full = dockWorld();
    full.give(full.chest(8), "raw_fish", full.engine.content.constants.zoneGatherLowStock);
    expect(postFishJobs(full.engine, 12)).toEqual([]);
  });
});

describe("registerFishJobs", () => {
  it("is registered by the engine: registering again is a duplicate", () => {
    expect(() => registerFishJobs(createGatheringWorld().engine)).toThrow();
  });

  it("catches fish into the worker's hands and pays fishing XP", () => {
    const world = dockWorld();
    const fisher = world.spawn("peasant", 5);
    world.give(fisher, "bread", 8);
    world.run(400);
    expect(materialStock(world.engine, "raw_fish")).toBeGreaterThanOrEqual(3);
    expect(skillValueMilli(fisher, "fishing")).toBeGreaterThan(0);
  });
});
