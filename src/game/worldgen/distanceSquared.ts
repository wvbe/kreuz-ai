import type { CellPoint } from "../map/mapTypes";

/**
 * Squared Euclidean distance of two integer points. Exact for the voronoi world (coordinates up
 * to 65535 give at most 2^33, far below 2^53), so comparisons never need a square root.
 *
 * @param left - First point.
 * @param right - Second point.
 * @returns `dx*dx + dy*dy`.
 */
export function distanceSquared(left: CellPoint, right: CellPoint): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}
