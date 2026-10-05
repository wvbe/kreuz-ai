import { describe, expect, it } from "vitest";
import { BlockReason } from "../map/mapTypes";
import { createAsciiMap, createPathTestWorld, createVoronoiTestMap } from "./pathTestWorld";

describe("path test world", () => {
  it("builds ascii maps with terrain and wall obstructions", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, [".,m", "~#."]);
    expect(map.terrainAt(1)).toBe("road");
    expect(map.terrainAt(2)).toBe("mud");
    expect(map.blockReason(3)).toBe(BlockReason.Water);
    expect(map.blockReason(4)).toBe(BlockReason.Wall);
    expect(map.isTraversable(5)).toBe(true);
  });

  it("builds voronoi maps", () => {
    const world = createPathTestWorld();
    expect(createVoronoiTestMap(world, 30, 3).cellCount).toBe(30);
  });
});
