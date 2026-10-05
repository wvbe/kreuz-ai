import type { GameMap } from "../map/GameMap";
import { GridType } from "../map/mapTypes";

/**
 * Exact integer square root: the largest `r` with `r * r <= value`.
 *
 * @param value - Non-negative safe integer.
 * @returns The floor of the square root.
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
 * Admissible A* heuristic between two cells of one map (spec 012 FR-001, DECISIONS D-21).
 * Square: Manhattan distance in tiles times `minStepCost`. Voronoi: the centroid distance times
 * `minStepCost / stepUnit`, rounded down with integer arithmetic only. Every step moves at most
 * `stepUnit` (centroid distance of adjacent cells) and costs at least `minStepCost`, so the value
 * never exceeds the true cost.
 *
 * @param map - The map.
 * @param from - Cell index.
 * @param target - Cell index.
 * @param minStepCost - Lowest cost of entering any passable cell.
 * @returns A lower bound of the path cost, integer.
 */
export function cellHeuristic(
  map: GameMap,
  from: number,
  target: number,
  minStepCost: number,
): number {
  const start = map.geometry.centroids[from];
  const goal = map.geometry.centroids[target];
  if (start === undefined || goal === undefined) {
    return 0;
  }
  const deltaX = Math.abs(start.x - goal.x);
  const deltaY = Math.abs(start.y - goal.y);
  const unit = map.geometry.stepUnit;
  if (map.gridType === GridType.Square) {
    return Math.floor((deltaX + deltaY) / unit) * minStepCost;
  }
  const scaledSquare = (deltaX * deltaX + deltaY * deltaY) * minStepCost * minStepCost;
  return integerSqrt(Math.floor(scaledSquare / (unit * unit)));
}
