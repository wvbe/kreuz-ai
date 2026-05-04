import { describe, it, expect } from "vitest";
import { findPath } from "./PathfindingSystem.js";
import { createSquareTileMap } from "../map/SquareTileMap.js";
import { createVoronoiTileMap } from "../map/VoronoiTileMap.js";
import { createPrng } from "../engine/Prng.js";

describe("PathfindingSystem", () => {
  it("finds shortest path on a square grid", () => {
    const { map } = createSquareTileMap("test", 5, 5);
    const result = findPath(map, 0, 24); // top-left to bottom-right
    expect(result.found).toBe(true);
    expect(result.path[0]).toBe(0);
    expect(result.path[result.path.length - 1]).toBe(24);
    expect(result.path.length).toBe(9); // Manhattan distance on 5x5 grid
  });

  it("finds path around obstacles", () => {
    const { map } = createSquareTileMap("test", 5, 5);
    // Block middle row
    map.cells[11]!.walkable = false;
    map.cells[12]!.walkable = false;
    map.cells[13]!.walkable = false;
    const result = findPath(map, 7, 17); // row 1 middle to row 3 middle
    expect(result.found).toBe(true);
    expect(result.path).not.toContain(11);
    expect(result.path).not.toContain(12);
    expect(result.path).not.toContain(13);
  });

  it("returns empty path when target is unreachable", () => {
    const { map } = createSquareTileMap("test", 5, 5);
    // Block all paths to target cell
    map.cells[1]!.walkable = false;
    map.cells[5]!.walkable = false;
    const result = findPath(map, 0, 24);
    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
  });

  it("handles same start and goal", () => {
    const { map } = createSquareTileMap("test", 5, 5);
    const result = findPath(map, 12, 12);
    expect(result.found).toBe(true);
    expect(result.path).toEqual([12]);
    expect(result.cost).toBe(0);
  });

  it("works on voronoi map", () => {
    const prng = createPrng(42);
    const { map } = createVoronoiTileMap("voronoi-test", 50, 100, 100, prng);
    const result = findPath(map, 0, 25);
    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThan(1);
    expect(result.path[0]).toBe(0);
    expect(result.path[result.path.length - 1]).toBe(25);
  });
});
