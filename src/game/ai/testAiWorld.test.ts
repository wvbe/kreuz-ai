import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { Difficulty } from "../save/initOptions";
import { createAiWorld, removeItems } from "./testAiWorld";

describe("createAiWorld", () => {
  it("starts a game with a grassland map and places spawned settlers on it", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 12);
    expect(world.engine.hasGame).toBe(true);
    expect(farmer.components["Position"]).toEqual({ mapId: world.mapId, cellIndex: 12 });
    expect(world.engine.maps.queryCell(world.mapId, 12).occupants).toContain(farmer.id);
    expect(world.engine.maps.require(world.mapId).cellCount).toBe(100);
  });

  it("honours size, difficulty and seed, and runs ticks", () => {
    const world = createAiWorld({ width: 4, height: 3, difficulty: Difficulty.Harsh, seed: 99 });
    expect(world.engine.maps.require(world.mapId).cellCount).toBe(12);
    expect(world.engine.getState().initOptions.difficulty).toBe(Difficulty.Harsh);
    expect(world.engine.prng.seed).toBe(99);
    world.run(3);
    expect(world.engine.time.tickCount).toBe(3);
  });
});

describe("removeItems", () => {
  it("removes every stack of a material from an inventory", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    expect(getTotal(farmer, "bread")).toBe(2);
    removeItems(world, farmer.id, "bread");
    expect(getTotal(world.engine.store.require(farmer.id), "bread")).toBe(0);
  });
});
