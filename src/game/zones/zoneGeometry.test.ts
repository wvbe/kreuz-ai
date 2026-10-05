import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { GridType } from "../map/mapTypes";
import { MapSize } from "../map/mapSize";
import { connectedComponents, outerRing } from "./zoneGeometry";
import type { CellGraph } from "./zoneGeometry";

// A 4x3 square grid by hand: cell = row * 4 + column.
const grid: CellGraph = {
  neighbors: (cell) => {
    const column = cell % 4;
    const row = Math.floor(cell / 4);
    const result: number[] = [];
    if (row > 0) {
      result.push(cell - 4);
    }
    if (column > 0) {
      result.push(cell - 1);
    }
    if (column < 3) {
      result.push(cell + 1);
    }
    if (row < 2) {
      result.push(cell + 4);
    }
    return result;
  },
};

describe("connectedComponents", () => {
  it("returns one sorted component for contiguous cells", () => {
    expect(connectedComponents(grid, [5, 1, 4, 0])).toEqual([[0, 1, 4, 5]]);
  });

  it("splits disconnected cells, ordered by lowest cell, ignoring duplicates", () => {
    expect(connectedComponents(grid, [11, 0, 1, 11, 3])).toEqual([[0, 1], [3], [11]]);
  });

  it("treats diagonal cells as disconnected and handles the empty set", () => {
    expect(connectedComponents(grid, [0, 5])).toEqual([[0], [5]]);
    expect(connectedComponents(grid, [])).toEqual([]);
  });

  it("works on a Voronoi map through its adjacency", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 3 });
    const map = engine.maps.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grassland",
      size: MapSize.Small,
      seed: 3,
    });
    const cells = [0, ...map.neighbors(0).slice(0, 2)];
    expect(connectedComponents(map, cells)).toEqual([
      [...cells].sort((left, right) => left - right),
    ]);
  });
});

describe("outerRing", () => {
  it("lists the bordering cells outside the set", () => {
    expect(outerRing(grid, [5])).toEqual([1, 4, 6, 9]);
    expect(outerRing(grid, [0, 1, 4, 5])).toEqual([2, 6, 8, 9]);
  });

  it("is empty for the whole grid", () => {
    expect(
      outerRing(
        grid,
        Array.from({ length: 12 }, (_, index) => index),
      ),
    ).toEqual([]);
  });
});
