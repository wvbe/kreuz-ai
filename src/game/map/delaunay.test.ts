import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import { triangulate } from "./delaunay";
import type { CellPoint } from "./mapTypes";

function exactInCircle(
  first: CellPoint,
  second: CellPoint,
  third: CellPoint,
  query: CellPoint,
): bigint {
  const adx = BigInt(first.x - query.x);
  const ady = BigInt(first.y - query.y);
  const bdx = BigInt(second.x - query.x);
  const bdy = BigInt(second.y - query.y);
  const cdx = BigInt(third.x - query.x);
  const cdy = BigInt(third.y - query.y);
  return (
    (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) +
    (bdx * bdx + bdy * bdy) * (cdx * ady - adx * cdy) +
    (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady)
  );
}

function orientation(first: CellPoint, second: CellPoint, third: CellPoint): bigint {
  return BigInt(
    (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x),
  );
}

function randomSites(seed: number, count: number): CellPoint[] {
  const stream = Prng.create({ seed }).stream("test.sites");
  const seen = new Set<string>();
  const sites: CellPoint[] = [];
  while (sites.length < count) {
    const point = { x: stream.nextInt(0, 65535), y: stream.nextInt(0, 65535) };
    const key = `${point.x},${point.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      sites.push(point);
    }
  }
  return sites;
}

function bruteForceEdges(sites: CellPoint[]): Set<string> {
  const edges = new Set<string>();
  const count = sites.length;
  for (let one = 0; one < count; one += 1) {
    for (let two = one + 1; two < count; two += 1) {
      for (let three = two + 1; three < count; three += 1) {
        const first = sites[one] as CellPoint;
        const second = sites[two] as CellPoint;
        const third = sites[three] as CellPoint;
        const turn = orientation(first, second, third);
        if (turn === 0n) {
          continue;
        }
        const [pointA, pointB, pointC] =
          turn > 0n ? [first, second, third] : [first, third, second];
        let empty = true;
        for (let other = 0; other < count && empty; other += 1) {
          if (other !== one && other !== two && other !== three) {
            empty = exactInCircle(pointA, pointB, pointC, sites[other] as CellPoint) <= 0n;
          }
        }
        if (empty) {
          edges.add(`${one},${two}`);
          edges.add(`${one},${three}`);
          edges.add(`${two},${three}`);
        }
      }
    }
  }
  return edges;
}

describe("triangulate", () => {
  it("returns nothing for no sites and no neighbours for one site", () => {
    expect(triangulate([])).toEqual({ adjacency: [], polygons: [] });
    const single = triangulate([{ x: 100, y: 200 }]);
    expect(single.adjacency).toEqual([[]]);
    expect(single.polygons[0]?.length).toBeGreaterThan(0);
  });

  it("matches the brute-force empty-circle Delaunay graph on random sites", () => {
    for (const seed of [1, 2, 3]) {
      const sites = randomSites(seed, 40);
      const { adjacency } = triangulate(sites);
      const found = new Set<string>();
      for (const [cell, around] of adjacency.entries()) {
        for (const other of around) {
          found.add(`${Math.min(cell, other)},${Math.max(cell, other)}`);
        }
      }
      expect(found).toEqual(bruteForceEdges(sites));
    }
  });

  it("keeps adjacency symmetric and ascending", () => {
    const { adjacency } = triangulate(randomSites(9, 300));
    for (const [cell, around] of adjacency.entries()) {
      expect([...around].sort((left, right) => left - right)).toEqual(around);
      for (const other of around) {
        expect(adjacency[other]).toContain(cell);
      }
    }
  });

  it("produces counter-clockwise polygons inside the world with a positive area", () => {
    const sites = randomSites(5, 200);
    const { polygons } = triangulate(sites);
    let totalDoubleArea = 0;
    for (const polygon of polygons) {
      let doubleArea = 0;
      for (const [index, corner] of polygon.entries()) {
        const next = polygon[(index + 1) % polygon.length] as CellPoint;
        doubleArea += corner.x * next.y - next.x * corner.y;
        expect(corner.x).toBeGreaterThanOrEqual(0);
        expect(corner.y).toBeLessThanOrEqual(65535);
      }
      expect(doubleArea).toBeGreaterThan(0);
      totalDoubleArea += doubleArea;
    }
    const worldDoubleArea = 2 * 65535 * 65535;
    expect(Math.abs(totalDoubleArea - worldDoubleArea)).toBeLessThan(worldDoubleArea / 500);
  });

  it("survives many cocircular and collinear sites", () => {
    const sites: CellPoint[] = [];
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        sites.push({ x: 1000 + column * 4000, y: 1000 + row * 4000 });
      }
    }
    const { adjacency } = triangulate(sites);
    for (const [cell, around] of adjacency.entries()) {
      expect(around.length).toBeGreaterThanOrEqual(2);
      for (const other of around) {
        const dx = (sites[cell] as CellPoint).x - (sites[other] as CellPoint).x;
        const dy = (sites[cell] as CellPoint).y - (sites[other] as CellPoint).y;
        expect(dx * dx + dy * dy).toBeLessThanOrEqual(2 * 4000 * 4000);
      }
    }
    expect(triangulate(sites)).toEqual({ adjacency, polygons: triangulate(sites).polygons });
  });

  it("is a pure function of the ordered site list", () => {
    const sites = randomSites(11, 150);
    expect(triangulate(sites)).toEqual(triangulate(sites));
  });
});
