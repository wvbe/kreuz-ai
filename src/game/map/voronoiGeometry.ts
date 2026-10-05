import { Prng } from "../engine/Prng";
import { triangulate } from "./delaunay";
import { MapError, MapErrorKind } from "./MapError";
import { GridType, voronoiMaxCoordinate, voronoiWorldSize } from "./mapTypes";
import type { CellPoint, MapGeometry } from "./mapTypes";

/**
 * Inputs of {@link buildVoronoiGeometry}; with the grid type they are the whole geometry.
 */
export type VoronoiGeometryParams = {
  seed: number;
  cellCount: number;
  relaxPasses: number;
};

/**
 * Highest cell count a voronoi map may have.
 */
export const maxVoronoiCellCount = 20000;

/**
 * Highest number of Lloyd passes a voronoi map may request.
 */
export const maxRelaxPasses = 16;

const sitesStreamName = "map.voronoi.sites";

/**
 * Exact integer square root: the largest `r` with `r * r <= value`.
 *
 * @param value - Non-negative safe integer.
 * @returns Floor of the square root.
 */
export function integerSqrt(value: number): number {
  let root = Math.floor(Math.sqrt(value));
  while (root * root > value) {
    root -= 1;
  }
  while ((root + 1) * (root + 1) <= value) {
    root += 1;
  }
  return root;
}

/**
 * Distance between two points, rounded up to an integer.
 *
 * @param from - First point.
 * @param target - Second point.
 * @returns Smallest integer not below the Euclidean distance.
 */
export function ceilDistance(from: CellPoint, target: CellPoint): number {
  const squared = (from.x - target.x) ** 2 + (from.y - target.y) ** 2;
  const root = integerSqrt(squared);
  return root * root === squared ? root : root + 1;
}

function pointKey(point: CellPoint): number {
  return point.x * voronoiWorldSize + point.y;
}

function floorDivBig(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator !== 0n && numerator < 0n !== denominator < 0n
    ? quotient - 1n
    : quotient;
}

/**
 * Integer centroid of a polygon via the shoelace formula with exact BigInt arithmetic, rounded
 * to the nearest integer (halves up). Falls back to `fallback` for a degenerate polygon.
 *
 * @param polygon - Corners in order.
 * @param fallback - Point returned when the polygon has no area.
 * @returns Integer centroid.
 */
export function polygonCentroid(polygon: readonly CellPoint[], fallback: CellPoint): CellPoint {
  const origin = fallback;
  let doubleArea = 0n;
  let sumX = 0n;
  let sumY = 0n;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index] as CellPoint;
    const next = polygon[(index + 1) % polygon.length] as CellPoint;
    const currentX = BigInt(current.x - origin.x);
    const currentY = BigInt(current.y - origin.y);
    const nextX = BigInt(next.x - origin.x);
    const nextY = BigInt(next.y - origin.y);
    const cross = currentX * nextY - nextX * currentY;
    doubleArea += cross;
    sumX += (currentX + nextX) * cross;
    sumY += (currentY + nextY) * cross;
  }
  if (doubleArea === 0n) {
    return { x: fallback.x, y: fallback.y };
  }
  const denominator = 3n * doubleArea;
  const round = (numerator: bigint): bigint =>
    floorDivBig(2n * numerator + denominator, 2n * denominator);
  const clamp = (value: bigint): number => {
    if (value < 0n) {
      return 0;
    }
    return Number(value > BigInt(voronoiMaxCoordinate) ? BigInt(voronoiMaxCoordinate) : value);
  };
  return {
    x: clamp(BigInt(origin.x) + round(sumX)),
    y: clamp(BigInt(origin.y) + round(sumY)),
  };
}

function relaxOnce(sites: readonly CellPoint[]): CellPoint[] {
  const { polygons } = triangulate(sites);
  const taken = new Set<number>();
  const relaxed: CellPoint[] = [];
  const later = new Set(sites.map(pointKey));
  for (const [index, site] of sites.entries()) {
    later.delete(pointKey(site));
    let candidate = polygonCentroid(polygons[index] as readonly CellPoint[], site);
    if (taken.has(pointKey(candidate)) || later.has(pointKey(candidate))) {
      candidate = { x: site.x, y: site.y };
    }
    while (taken.has(pointKey(candidate)) || later.has(pointKey(candidate))) {
      candidate = { x: (candidate.x + 1) % voronoiWorldSize, y: candidate.y };
    }
    taken.add(pointKey(candidate));
    relaxed.push(candidate);
  }
  return relaxed;
}

/**
 * Builds the voronoi geometry as a pure integer function of `(seed, cellCount, relaxPasses)`
 * (DECISIONS AD9, D-05): `cellCount` distinct random sites in `0..65535` squared drawn from the
 * seeded stream `map.voronoi.sites`, `relaxPasses` Lloyd passes with exact integer centroids of
 * the clipped Voronoi cells, then cells renumbered in row-major bands (`floor(sqrt(count))`
 * bands by y, then x) and an exact Delaunay triangulation for adjacency. Neighbours ascend by
 * cell index. No floating point decision influences the result (see `delaunay.ts`).
 *
 * @param params - Seed, number of cells and number of relaxation passes.
 * @returns The derived geometry.
 */
export function buildVoronoiGeometry(params: VoronoiGeometryParams): MapGeometry {
  const { seed, cellCount, relaxPasses } = params;
  if (!Number.isInteger(cellCount) || cellCount < 1 || cellCount > maxVoronoiCellCount) {
    throw new MapError(
      MapErrorKind.InvalidParams,
      `cellCount must be an integer in 1..${maxVoronoiCellCount}, got ${String(cellCount)}`,
    );
  }
  if (!Number.isInteger(relaxPasses) || relaxPasses < 0 || relaxPasses > maxRelaxPasses) {
    throw new MapError(
      MapErrorKind.InvalidParams,
      `relaxPasses must be an integer in 0..${maxRelaxPasses}, got ${String(relaxPasses)}`,
    );
  }
  const stream = Prng.create({ seed }).stream(sitesStreamName);
  const used = new Set<number>();
  let sites: CellPoint[] = [];
  while (sites.length < cellCount) {
    const point = {
      x: stream.nextInt(0, voronoiMaxCoordinate),
      y: stream.nextInt(0, voronoiMaxCoordinate),
    };
    if (!used.has(pointKey(point))) {
      used.add(pointKey(point));
      sites.push(point);
    }
  }
  for (let pass = 0; pass < relaxPasses; pass += 1) {
    sites = relaxOnce(sites);
  }
  const bands = Math.max(1, integerSqrt(cellCount));
  const band = (point: CellPoint): number => Math.floor((point.y * bands) / voronoiWorldSize);
  sites.sort((left, right) => band(left) - band(right) || left.x - right.x || left.y - right.y);
  const { adjacency, polygons } = triangulate(sites);
  let stepUnit = 1;
  for (const [cell, around] of adjacency.entries()) {
    for (const other of around) {
      stepUnit = Math.max(
        stepUnit,
        ceilDistance(sites[cell] as CellPoint, sites[other] as CellPoint),
      );
    }
  }
  return {
    gridType: GridType.Voronoi,
    cellCount,
    extent: { x: voronoiWorldSize, y: voronoiWorldSize },
    centroids: sites,
    polygons,
    adjacency,
    stepUnit,
  };
}

/**
 * Fingerprint of a geometry for golden tests: two independent 32-bit FNV-1a lanes over the cell
 * count, every centroid, every polygon corner and every adjacency list, as 16 hex digits.
 *
 * @param geometry - Geometry to fingerprint.
 * @returns Lowercase hex string.
 */
export function hashGeometry(geometry: MapGeometry): string {
  let laneA = 0x811c9dc5;
  let laneB = 0x01000193;
  const feed = (value: number): void => {
    for (let shift = 0; shift < 32; shift += 8) {
      const byte = (value >>> shift) & 0xff;
      laneA = Math.imul(laneA ^ byte, 0x01000193) >>> 0;
      laneB = Math.imul(laneB ^ byte, 0x85ebca6b) >>> 0;
    }
  };
  feed(geometry.cellCount);
  for (const [cell, centroid] of geometry.centroids.entries()) {
    feed(centroid.x);
    feed(centroid.y);
    const polygon = geometry.polygons[cell] as readonly CellPoint[];
    feed(polygon.length);
    for (const corner of polygon) {
      feed(corner.x);
      feed(corner.y);
    }
    const around = geometry.adjacency[cell] as readonly number[];
    feed(around.length);
    for (const other of around) {
      feed(other);
    }
  }
  return laneA.toString(16).padStart(8, "0") + laneB.toString(16).padStart(8, "0");
}
