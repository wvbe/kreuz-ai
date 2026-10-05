import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import { BlockReason } from "../map/mapTypes";
import { searchPath } from "./searchPath";
import { cellHeuristic, integerSqrt } from "./pathHeuristic";
import { createAsciiMap, createPathTestWorld, createVoronoiTestMap } from "./pathTestWorld";
import { PathResultKind } from "./pathTypes";

describe("integerSqrt", () => {
  it("is the exact floor of the square root", () => {
    for (const value of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 4294967296, 8589869056]) {
      const root = integerSqrt(value);
      expect(root * root).toBeLessThanOrEqual(value);
      expect((root + 1) * (root + 1)).toBeGreaterThan(value);
    }
  });
});

describe("cellHeuristic", () => {
  it("is Manhattan distance times the minimum step cost on square maps", () => {
    const map = createAsciiMap(createPathTestWorld(), ["......", "......", "......"]);
    expect(cellHeuristic(map, 0, map.squareCell(5, 2), 5)).toBe(35);
    expect(cellHeuristic(map, 7, 7, 5)).toBe(0);
  });

  it("never overestimates the true cost on voronoi maps", () => {
    const world = createPathTestWorld();
    const map = createVoronoiTestMap(world, 120, 11);
    const stream = Prng.create({ seed: 3 }).stream("test.heuristic");
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      if (stream.chancePermille(150)) {
        map.setObstruction(cell, BlockReason.Wall);
      }
    }
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const from = stream.nextBelow(map.cellCount);
      const target = stream.nextBelow(map.cellCount);
      const { result } = searchPath(map, from, target, { minStepCost: 10, maxExpansions: 100000 });
      if (result.kind === PathResultKind.Found) {
        const estimate = cellHeuristic(map, from, target, 10);
        expect(Number.isInteger(estimate)).toBe(true);
        expect(estimate).toBeLessThanOrEqual(result.cost);
      }
    }
  });

  it("returns 0 for cells that do not exist", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..."]);
    expect(cellHeuristic(map, 0, 99, 5)).toBe(0);
  });
});
