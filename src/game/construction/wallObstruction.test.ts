import { describe, expect, it } from "vitest";
import { BlockReason } from "../map/mapTypes";
import { createConstructionWorld } from "./testConstructionWorld";
import {
  applyWallObstruction,
  clearWallObstruction,
  rebuildWallObstructions,
} from "./wallObstruction";

// @covers 016:FR-009
describe("applyWallObstruction", () => {
  // @covers 004:FR-014
  it("obstructs the cell of a wall and ignores doors and other entities", () => {
    const world = createConstructionWorld();
    const map = world.engine.maps.require(world.mapId);
    const wall = world.wall(30);
    expect(applyWallObstruction(world.engine, wall)).toBe(true);
    expect(map.blockReason(30)).toBe(BlockReason.Wall);
    expect(applyWallObstruction(world.engine, wall)).toBe(false);
    expect(applyWallObstruction(world.engine, world.door(31))).toBe(false);
    expect(applyWallObstruction(world.engine, world.chest(32))).toBe(false);
    expect(map.isTraversable(31)).toBe(true);
  });

  it("obstructs every wall that is spawned, once the events are delivered", () => {
    const world = createConstructionWorld();
    world.wall(30);
    world.run(1);
    expect(world.engine.maps.require(world.mapId).blockReason(30)).toBe(BlockReason.Wall);
  });
});

describe("clearWallObstruction", () => {
  it("frees the cell of a deleted wall unless another wall stands on it", () => {
    const world = createConstructionWorld();
    const map = world.engine.maps.require(world.mapId);
    const first = world.wall(30);
    applyWallObstruction(world.engine, first);
    expect(clearWallObstruction(world.engine, world.chest(31))).toBe(false);
    expect(clearWallObstruction(world.engine, first)).toBe(true);
    expect(map.isTraversable(30)).toBe(true);
    const lower = world.wall(33);
    applyWallObstruction(world.engine, lower);
    // A second wall entity stacked on the cell keeps it blocked.
    map.setObstruction(33, null);
    const upper = world.engine.store.spawn("wall", {
      Position: { mapId: world.mapId, cellIndex: 33 },
    });
    world.engine.maps.occupants.add(upper.id, { mapId: world.mapId, cellIndex: 33 });
    map.setObstruction(33, BlockReason.Wall);
    expect(clearWallObstruction(world.engine, lower)).toBe(false);
    expect(map.blockReason(33)).toBe(BlockReason.Wall);
  });

  it("frees the cell when a wall is deleted", () => {
    const world = createConstructionWorld();
    const wall = world.wall(30);
    world.run(1);
    world.engine.store.requestDelete(wall.id);
    world.run(1);
    expect(world.engine.maps.require(world.mapId).isTraversable(30)).toBe(true);
  });
});

describe("rebuildWallObstructions", () => {
  // @covers 004:FR-014
  // @covers 004:SC-013
  it("derives the obstructions from the wall entities, also after a load", () => {
    const world = createConstructionWorld();
    world.wall(30);
    world.wall(31);
    world.door(32);
    world.run(1);
    world.engine.loadGame(world.engine.saveGame());
    const map = world.engine.maps.require(world.mapId);
    expect(map.blockReason(30)).toBe(BlockReason.Wall);
    expect(map.blockReason(31)).toBe(BlockReason.Wall);
    expect(map.isTraversable(32)).toBe(true);
    expect(rebuildWallObstructions(world.engine)).toBe(0);
    map.setObstruction(30, null);
    expect(rebuildWallObstructions(world.engine)).toBe(1);
  });
});
