import { MapError, MapErrorKind } from "./MapError";
import { voronoiMaxCoordinate } from "./mapTypes";
import type { CellPoint } from "./mapTypes";

/**
 * Result of {@link triangulate}: the Delaunay graph and the clipped Voronoi polygons.
 */
export type Triangulation = {
  /**
   * Delaunay neighbours of every site, ascending site index.
   */
  adjacency: number[][];
  /**
   * Voronoi cell polygon of every site: circumcentres rounded to integers, clamped to the world
   * square, counter-ring.
   */
  polygons: CellPoint[][];
};

const superSize = 1 << 20;
const incircleErrorFactor = 2e-15;

function signOfBig(value: bigint): number {
  if (value > 0n) {
    return 1;
  }
  return value < 0n ? -1 : 0;
}

function floorDivBig(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator !== 0n && numerator < 0n ? quotient - 1n : quotient;
}

/**
 * Divides and rounds half up with exact integer math.
 *
 * @param numerator - Any integer.
 * @param denominator - Non-zero integer.
 * @returns round(numerator / denominator) with halves rounded up.
 */
function roundDivBig(numerator: bigint, denominator: bigint): bigint {
  const sign = denominator < 0n ? -1n : 1n;
  return floorDivBig(2n * numerator * sign + denominator * sign, 2n * denominator * sign);
}

/**
 * Exact sign of the in-circle determinant: positive when `p` lies strictly inside the circle
 * through the counter-ring triangle `a, b, c`. Double arithmetic is only a filter with a
 * conservative error bound; any near-zero result is recomputed with exact BigInt arithmetic, so
 * the returned sign is always the mathematically exact one on every platform.
 *
 * @param pts - Flat `[x0, y0, x1, y1, ...]` coordinates.
 * @param vertexA - Triangle vertex index.
 * @param vertexB - Triangle vertex index.
 * @param vertexC - Triangle vertex index.
 * @param queryVertex - Query vertex index.
 * @returns 1 inside, -1 outside, 0 on the circle.
 */
function inCircleSign(
  pts: readonly number[],
  vertexA: number,
  vertexB: number,
  vertexC: number,
  queryVertex: number,
): number {
  const pointX = pts[2 * queryVertex] as number;
  const pointY = pts[2 * queryVertex + 1] as number;
  const adx = (pts[2 * vertexA] as number) - pointX;
  const ady = (pts[2 * vertexA + 1] as number) - pointY;
  const bdx = (pts[2 * vertexB] as number) - pointX;
  const bdy = (pts[2 * vertexB + 1] as number) - pointY;
  const cdx = (pts[2 * vertexC] as number) - pointX;
  const cdy = (pts[2 * vertexC + 1] as number) - pointY;
  const alift = adx * adx + ady * ady;
  const blift = bdx * bdx + bdy * bdy;
  const clift = cdx * cdx + cdy * cdy;
  const det =
    alift * (bdx * cdy - cdx * bdy) +
    blift * (cdx * ady - adx * cdy) +
    clift * (adx * bdy - bdx * ady);
  const permanent =
    alift * (Math.abs(bdx * cdy) + Math.abs(cdx * bdy)) +
    blift * (Math.abs(cdx * ady) + Math.abs(adx * cdy)) +
    clift * (Math.abs(adx * bdy) + Math.abs(bdx * ady));
  if (Math.abs(det) > incircleErrorFactor * permanent) {
    return det > 0 ? 1 : -1;
  }
  const big = (value: number): bigint => BigInt(value);
  const eax = big(adx);
  const eay = big(ady);
  const ebx = big(bdx);
  const eby = big(bdy);
  const ecx = big(cdx);
  const ecy = big(cdy);
  const exact =
    (eax * eax + eay * eay) * (ebx * ecy - ecx * eby) +
    (ebx * ebx + eby * eby) * (ecx * eay - eax * ecy) +
    (ecx * ecx + ecy * ecy) * (eax * eby - ebx * eay);
  return signOfBig(exact);
}

function orientation(
  pts: readonly number[],
  vertexA: number,
  vertexB: number,
  pointX: number,
  pointY: number,
): number {
  const firstX = pts[2 * vertexA] as number;
  const firstY = pts[2 * vertexA + 1] as number;
  const cross =
    ((pts[2 * vertexB] as number) - firstX) * (pointY - firstY) -
    ((pts[2 * vertexB + 1] as number) - firstY) * (pointX - firstX);
  return cross > 0 ? 1 : cross < 0 ? -1 : 0;
}

const farLimit = 1 << 30;

function clampFar(value: bigint): number {
  const limit = BigInt(farLimit);
  if (value < -limit) {
    return -farLimit;
  }
  return Number(value > limit ? limit : value);
}

/**
 * Clips a convex polygon to the world square `0..65535` (Sutherland-Hodgman, axis-aligned
 * half-planes). Corner coordinates are exact integers; intersections are rounded half up with
 * exact BigInt division. Orientation is preserved.
 *
 * @param polygon - Corners in order.
 * @returns The clipped corners with consecutive duplicates removed.
 */
function clipToWorld(polygon: readonly CellPoint[]): CellPoint[] {
  let current = polygon.slice();
  const planes = [
    { axis: "x" as const, bound: 0, keepAbove: true },
    { axis: "x" as const, bound: voronoiMaxCoordinate, keepAbove: false },
    { axis: "y" as const, bound: 0, keepAbove: true },
    { axis: "y" as const, bound: voronoiMaxCoordinate, keepAbove: false },
  ];
  for (const plane of planes) {
    const other = plane.axis === "x" ? "y" : "x";
    const inside = (point: CellPoint): boolean =>
      plane.keepAbove ? point[plane.axis] >= plane.bound : point[plane.axis] <= plane.bound;
    const next: CellPoint[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const from = current[index] as CellPoint;
      const target = current[(index + 1) % current.length] as CellPoint;
      if (inside(from)) {
        next.push(from);
      }
      if (inside(from) !== inside(target)) {
        const run = BigInt(target[plane.axis] - from[plane.axis]);
        const shift = roundDivBig(
          BigInt(target[other] - from[other]) * BigInt(plane.bound - from[plane.axis]),
          run,
        );
        const crossing = { x: 0, y: 0 };
        crossing[plane.axis] = plane.bound;
        crossing[other] = from[other] + Number(shift);
        next.push(crossing);
      }
    }
    current = next;
  }
  const cleaned: CellPoint[] = [];
  for (const point of current) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      cleaned.push(point);
    }
  }
  const head = cleaned[0];
  const tail = cleaned[cleaned.length - 1];
  if (cleaned.length > 1 && head && tail && head.x === tail.x && head.y === tail.y) {
    cleaned.pop();
  }
  return cleaned;
}

/**
 * Rounded circumcentre of a triangle with exact rational arithmetic, clamped to +-2^30 (only
 * triangles touching the far super triangle ever get that large).
 *
 * @param pts - Flat coordinates.
 * @param vertexA - Vertex index.
 * @param vertexB - Vertex index.
 * @param vertexC - Vertex index.
 * @returns Integer point.
 */
function circumcentre(
  pts: readonly number[],
  vertexA: number,
  vertexB: number,
  vertexC: number,
): CellPoint {
  const firstX = BigInt(pts[2 * vertexA] as number);
  const firstY = BigInt(pts[2 * vertexA + 1] as number);
  const secondX = BigInt(pts[2 * vertexB] as number) - firstX;
  const secondY = BigInt(pts[2 * vertexB + 1] as number) - firstY;
  const thirdX = BigInt(pts[2 * vertexC] as number) - firstX;
  const thirdY = BigInt(pts[2 * vertexC + 1] as number) - firstY;
  const denominator = 2n * (secondX * thirdY - secondY * thirdX);
  const blift = secondX * secondX + secondY * secondY;
  const clift = thirdX * thirdX + thirdY * thirdY;
  const shiftX = roundDivBig(thirdY * blift - secondY * clift, denominator);
  const shiftY = roundDivBig(secondX * clift - thirdX * blift, denominator);
  return { x: clampFar(firstX + shiftX), y: clampFar(firstY + shiftY) };
}

/**
 * Computes the Delaunay triangulation of distinct integer sites (Bowyer-Watson with a visibility
 * walk and a far-away super triangle) and derives adjacency and Voronoi polygons. Every
 * predicate is exact, so the result is a pure function of the site list in the given order,
 * identical on every platform. Sites must be distinct and inside `0..65535`.
 *
 * Hull sites whose true Delaunay edge is cut off by the finite super triangle (only possible for
 * near-collinear hull points) may lack that edge; this is deterministic and harmless.
 *
 * @param sites - Distinct integer points.
 * @returns Neighbours and polygons per site.
 */
export function triangulate(sites: readonly CellPoint[]): Triangulation {
  const count = sites.length;
  if (count === 0) {
    return { adjacency: [], polygons: [] };
  }
  const pts: number[] = [];
  for (const site of sites) {
    pts.push(site.x, site.y);
  }
  pts.push(-superSize, -superSize, 5 * superSize, -superSize, -superSize, 5 * superSize);
  const triVertices: number[] = [count, count + 1, count + 2];
  const triNeighbours: number[] = [-1, -1, -1];
  const alive: boolean[] = [true];
  const badStamp: number[] = [0];
  const goodStamp: number[] = [0];
  const free: number[] = [];
  let stamp = 0;
  let last = 0;

  const locate = (pointX: number, pointY: number): number => {
    let current = last;
    for (let steps = 0; steps < 4 * alive.length + 16; steps += 1) {
      let moved = false;
      for (let edge = 0; edge < 3; edge += 1) {
        const from = triVertices[3 * current + edge] as number;
        const target = triVertices[3 * current + ((edge + 1) % 3)] as number;
        const next = triNeighbours[3 * current + edge] as number;
        if (next >= 0 && orientation(pts, from, target, pointX, pointY) < 0) {
          current = next;
          moved = true;
          break;
        }
      }
      if (!moved) {
        return current;
      }
    }
    for (let candidate = 0; candidate < alive.length; candidate += 1) {
      if (!alive[candidate]) {
        continue;
      }
      let inside = true;
      for (let edge = 0; edge < 3 && inside; edge += 1) {
        const from = triVertices[3 * candidate + edge] as number;
        const target = triVertices[3 * candidate + ((edge + 1) % 3)] as number;
        inside = orientation(pts, from, target, pointX, pointY) >= 0;
      }
      if (inside) {
        return candidate;
      }
    }
    throw new MapError(
      MapErrorKind.InvalidState,
      `no triangle contains site (${pointX}, ${pointY})`,
    );
  };

  for (let site = 0; site < count; site += 1) {
    stamp += 1;
    const start = locate(pts[2 * site] as number, pts[2 * site + 1] as number);
    const bad = [start];
    badStamp[start] = stamp;
    for (let head = 0; head < bad.length; head += 1) {
      const current = bad[head] as number;
      for (let edge = 0; edge < 3; edge += 1) {
        const next = triNeighbours[3 * current + edge] as number;
        if (next < 0 || badStamp[next] === stamp || goodStamp[next] === stamp) {
          continue;
        }
        const inside =
          inCircleSign(
            pts,
            triVertices[3 * next] as number,
            triVertices[3 * next + 1] as number,
            triVertices[3 * next + 2] as number,
            site,
          ) > 0;
        if (inside) {
          badStamp[next] = stamp;
          bad.push(next);
        } else {
          goodStamp[next] = stamp;
        }
      }
    }
    const boundary: { from: number; target: number; outside: number; owner: number }[] = [];
    for (const owner of bad) {
      for (let edge = 0; edge < 3; edge += 1) {
        const outside = triNeighbours[3 * owner + edge] as number;
        if (outside < 0 || badStamp[outside] !== stamp) {
          boundary.push({
            from: triVertices[3 * owner + edge] as number,
            target: triVertices[3 * owner + ((edge + 1) % 3)] as number,
            outside,
            owner,
          });
        }
      }
    }
    const startingAt = new Map<number, number>();
    const endingAt = new Map<number, number>();
    const created: number[] = [];
    for (const edge of boundary) {
      const slot = free.pop() ?? alive.length;
      if (slot === alive.length) {
        triVertices.push(0, 0, 0);
        triNeighbours.push(-1, -1, -1);
        alive.push(false);
        badStamp.push(0);
        goodStamp.push(0);
      }
      alive[slot] = true;
      triVertices[3 * slot] = edge.from;
      triVertices[3 * slot + 1] = edge.target;
      triVertices[3 * slot + 2] = site;
      triNeighbours[3 * slot] = edge.outside;
      if (edge.outside >= 0) {
        for (let across = 0; across < 3; across += 1) {
          if (triNeighbours[3 * edge.outside + across] === edge.owner) {
            triNeighbours[3 * edge.outside + across] = slot;
          }
        }
      }
      startingAt.set(edge.from, slot);
      endingAt.set(edge.target, slot);
      created.push(slot);
    }
    for (const slot of created) {
      triNeighbours[3 * slot + 1] = startingAt.get(triVertices[3 * slot + 1] as number) as number;
      triNeighbours[3 * slot + 2] = endingAt.get(triVertices[3 * slot] as number) as number;
    }
    for (const owner of bad) {
      alive[owner] = false;
      free.push(owner);
    }
    last = created[0] as number;
  }

  const neighbourSets: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  const incident: number[] = new Array<number>(count).fill(-1);
  for (let tri = 0; tri < alive.length; tri += 1) {
    if (!alive[tri]) {
      continue;
    }
    for (let edge = 0; edge < 3; edge += 1) {
      const from = triVertices[3 * tri + edge] as number;
      const target = triVertices[3 * tri + ((edge + 1) % 3)] as number;
      if (from < count) {
        incident[from] = tri;
        if (target < count) {
          neighbourSets[from]?.add(target);
          neighbourSets[target]?.add(from);
        }
      }
    }
  }
  const centres = new Map<number, CellPoint>();
  const centreOf = (tri: number): CellPoint => {
    let found = centres.get(tri);
    if (!found) {
      found = circumcentre(
        pts,
        triVertices[3 * tri] as number,
        triVertices[3 * tri + 1] as number,
        triVertices[3 * tri + 2] as number,
      );
      centres.set(tri, found);
    }
    return found;
  };
  const polygons: CellPoint[][] = [];
  for (let site = 0; site < count; site += 1) {
    const first = incident[site] as number;
    const ring: CellPoint[] = [];
    let current = first;
    do {
      const point = centreOf(current);
      const previous = ring[ring.length - 1];
      if (!previous || previous.x !== point.x || previous.y !== point.y) {
        ring.push(point);
      }
      let corner = 0;
      while (triVertices[3 * current + corner] !== site) {
        corner += 1;
      }
      current = triNeighbours[3 * current + corner] as number;
    } while (current !== first && current >= 0);
    polygons.push(clipToWorld(ring).reverse());
  }
  return {
    adjacency: neighbourSets.map((set) => [...set].sort((left, right) => left - right)),
    polygons,
  };
}
