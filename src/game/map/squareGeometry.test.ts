import { describe, expect, it } from "vitest";
import { buildSquareGeometry } from "./squareGeometry";
import { GridType } from "./mapTypes";

describe("buildSquareGeometry", () => {
  const geometry = buildSquareGeometry(4, 3);

  it("indexes cells row-major and reports extent and centres in milli-tiles", () => {
    expect(geometry.gridType).toBe(GridType.Square);
    expect(geometry.cellCount).toBe(12);
    expect(geometry.extent).toEqual({ x: 4000, y: 3000 });
    expect(geometry.centroids[5]).toEqual({ x: 1500, y: 1500 });
    expect(geometry.polygons[0]).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 0 },
    ]);
    expect(geometry.stepUnit).toBe(1000);
  });

  it("is 4-connected with ascending neighbours and clipped at the border", () => {
    expect(geometry.adjacency[0]).toEqual([1, 4]);
    expect(geometry.adjacency[5]).toEqual([1, 4, 6, 9]);
    expect(geometry.adjacency[11]).toEqual([7, 10]);
    for (const [cell, around] of geometry.adjacency.entries()) {
      expect([...around].sort((left, right) => left - right)).toEqual(around);
      for (const other of around) {
        expect(geometry.adjacency[other]).toContain(cell);
      }
    }
  });

  it("handles a single cell", () => {
    expect(buildSquareGeometry(1, 1).adjacency).toEqual([[]]);
  });
});
