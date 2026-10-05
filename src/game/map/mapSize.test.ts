import { describe, expect, it } from "vitest";
import { MapSize, mapDimensionsFor } from "./mapSize";
import { GridType } from "./mapTypes";

describe("mapDimensionsFor", () => {
  it("maps sizes to voronoi cell counts of DECISIONS D-06", () => {
    expect(mapDimensionsFor(MapSize.Small, GridType.Voronoi)).toEqual({
      gridType: GridType.Voronoi,
      cellCount: 600,
    });
    expect(mapDimensionsFor(MapSize.Medium, GridType.Voronoi).cellCount).toBe(1200);
    expect(mapDimensionsFor(MapSize.Large, GridType.Voronoi).cellCount).toBe(2400);
  });

  it("gives square maps the same cell counts", () => {
    for (const size of [MapSize.Small, MapSize.Medium, MapSize.Large]) {
      const square = mapDimensionsFor(size, GridType.Square);
      expect(square.cellCount).toBe(mapDimensionsFor(size, GridType.Voronoi).cellCount);
      expect((square.width ?? 0) * (square.height ?? 0)).toBe(square.cellCount);
    }
  });
});
