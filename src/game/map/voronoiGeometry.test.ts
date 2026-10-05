import { describe, expect, it } from "vitest";
import { MapError } from "./MapError";
import { GridType } from "./mapTypes";
import {
  buildVoronoiGeometry,
  ceilDistance,
  hashGeometry,
  integerSqrt,
  maxVoronoiCellCount,
  polygonCentroid,
} from "./voronoiGeometry";
import { buildSquareGeometry } from "./buildSquareGeometry";

const small = { seed: 7, cellCount: 200, relaxPasses: 2 };

describe("integerSqrt", () => {
  it("returns the exact floor of the square root", () => {
    expect(integerSqrt(0)).toBe(0);
    expect(integerSqrt(15)).toBe(3);
    expect(integerSqrt(16)).toBe(4);
    expect(integerSqrt(2 ** 52)).toBe(2 ** 26);
    expect(integerSqrt(2 ** 52 - 1)).toBe(2 ** 26 - 1);
  });
});

describe("ceilDistance", () => {
  it("rounds the Euclidean distance up", () => {
    expect(ceilDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(ceilDistance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(2);
    expect(ceilDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
});

describe("polygonCentroid", () => {
  it("finds the centroid of a rectangle and rounds half up", () => {
    const rectangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(polygonCentroid(rectangle, { x: 1, y: 1 })).toEqual({ x: 5, y: 2 });
    const odd = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    expect(polygonCentroid(odd, { x: 0, y: 0 })).toEqual({ x: 3, y: 3 });
  });

  it("works for clockwise input and falls back for degenerate polygons", () => {
    const clockwise = [
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { x: 10, y: 4 },
      { x: 10, y: 0 },
    ];
    expect(polygonCentroid(clockwise, { x: 2, y: 2 })).toEqual({ x: 5, y: 2 });
    const line = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
    ];
    expect(polygonCentroid(line, { x: 9, y: 9 })).toEqual({ x: 9, y: 9 });
  });
});

describe("buildVoronoiGeometry", () => {
  it("is a pure function of its params", () => {
    const first = buildVoronoiGeometry(small);
    const second = buildVoronoiGeometry({ ...small });
    expect(hashGeometry(first)).toBe(hashGeometry(second));
    expect(first.centroids).toEqual(second.centroids);
    expect(first.adjacency).toEqual(second.adjacency);
  });

  it("differs for another seed and reacts to relaxation", () => {
    const base = hashGeometry(buildVoronoiGeometry(small));
    expect(hashGeometry(buildVoronoiGeometry({ ...small, seed: 8 }))).not.toBe(base);
    expect(hashGeometry(buildVoronoiGeometry({ ...small, relaxPasses: 0 }))).not.toBe(base);
  });

  it("has distinct sites, ascending symmetric adjacency and a valid step unit", () => {
    const geometry = buildVoronoiGeometry(small);
    expect(geometry.gridType).toBe(GridType.Voronoi);
    expect(geometry.cellCount).toBe(200);
    expect(geometry.centroids).toHaveLength(200);
    expect(new Set(geometry.centroids.map((point) => `${point.x},${point.y}`)).size).toBe(200);
    for (const [cell, around] of geometry.adjacency.entries()) {
      expect(around.length).toBeGreaterThanOrEqual(2);
      expect([...around].sort((left, right) => left - right)).toEqual(around);
      for (const other of around) {
        expect(geometry.adjacency[other]).toContain(cell);
        const distance = ceilDistance(
          geometry.centroids[cell] ?? { x: 0, y: 0 },
          geometry.centroids[other] ?? { x: 0, y: 0 },
        );
        expect(distance).toBeLessThanOrEqual(geometry.stepUnit);
      }
    }
  });

  it("orders cells in row-major bands", () => {
    const geometry = buildVoronoiGeometry(small);
    const bands = integerSqrt(200);
    let previousBand = 0;
    for (const point of geometry.centroids) {
      const band = Math.floor((point.y * bands) / 65536);
      expect(band).toBeGreaterThanOrEqual(previousBand);
      previousBand = band;
    }
  });

  it("builds single-cell and unrelaxed maps and rejects bad params", () => {
    expect(buildVoronoiGeometry({ seed: 1, cellCount: 1, relaxPasses: 2 }).adjacency).toEqual([[]]);
    expect(buildVoronoiGeometry({ seed: 1, cellCount: 5, relaxPasses: 0 }).cellCount).toBe(5);
    expect(() => buildVoronoiGeometry({ seed: 1, cellCount: 0, relaxPasses: 2 })).toThrow(MapError);
    expect(() =>
      buildVoronoiGeometry({ seed: 1, cellCount: maxVoronoiCellCount + 1, relaxPasses: 2 }),
    ).toThrow(MapError);
    expect(() => buildVoronoiGeometry({ seed: 1, cellCount: 5, relaxPasses: 99 })).toThrow(
      MapError,
    );
  });

  it("matches the golden hash of a 64x64 (4096 cell) map for seed 42", () => {
    const geometry = buildVoronoiGeometry({ seed: 42, cellCount: 64 * 64, relaxPasses: 2 });
    expect(hashGeometry(geometry)).toBe("44ccef4c50a00a3e");
    expect(
      hashGeometry(buildVoronoiGeometry({ seed: 42, cellCount: 64 * 64, relaxPasses: 2 })),
    ).toBe(hashGeometry(geometry));
  });
});

describe("hashGeometry", () => {
  it("fingerprints square geometry and changes with the content", () => {
    const first = hashGeometry(buildSquareGeometry(4, 4));
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(hashGeometry(buildSquareGeometry(4, 4))).toBe(first);
    expect(hashGeometry(buildSquareGeometry(5, 3))).not.toBe(first);
  });
});
