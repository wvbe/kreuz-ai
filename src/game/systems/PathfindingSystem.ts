/**
 * A* pathfinding on cell adjacency graphs.
 * Works with both voronoi and square-tile maps using their adjacency data.
 */

import type { TileMap, Cell } from "../map/TileMap.js";

export type PathResult = {
  path: number[];
  cost: number;
  found: boolean;
};

/**
 * Finds the shortest path between two cells using A* algorithm.
 * Returns empty path if target is unreachable.
 */
export function findPath(map: TileMap, startCellId: number, goalCellId: number): PathResult {
  if (startCellId === goalCellId) {
    return { path: [startCellId], cost: 0, found: true };
  }

  const startCell = map.cells[startCellId];
  const goalCell = map.cells[goalCellId];
  if (!startCell || !goalCell || !goalCell.walkable) {
    return { path: [], cost: 0, found: false };
  }

  const openSet = new Set<number>([startCellId]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  gScore.set(startCellId, 0);
  fScore.set(startCellId, heuristic(startCell, goalCell));

  while (openSet.size > 0) {
    // Get node with lowest fScore
    let current = -1;
    let lowestF = Infinity;
    for (const node of openSet) {
      const score = fScore.get(node) ?? Infinity;
      if (score < lowestF) {
        lowestF = score;
        current = node;
      }
    }

    if (current === goalCellId) {
      return {
        path: reconstructPath(cameFrom, current),
        cost: gScore.get(current) ?? 0,
        found: true,
      };
    }

    openSet.delete(current);
    const currentCell = map.cells[current];
    if (!currentCell) continue;

    for (const neighborId of currentCell.adjacentCells) {
      const neighborCell = map.cells[neighborId];
      if (!neighborCell || !neighborCell.walkable) continue;

      const tentativeG = (gScore.get(current) ?? Infinity) + movementCost(currentCell, neighborCell);

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        fScore.set(neighborId, tentativeG + heuristic(neighborCell, goalCell));
        openSet.add(neighborId);
      }
    }
  }

  return { path: [], cost: 0, found: false };
}

/**
 * Euclidean distance heuristic.
 */
function heuristic(cellA: Cell, cellB: Cell): number {
  const deltaX = cellA.centerX - cellB.centerX;
  const deltaY = cellA.centerY - cellB.centerY;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/**
 * Movement cost between two adjacent cells.
 */
function movementCost(from: Cell, to: Cell): number {
  const deltaX = from.centerX - to.centerX;
  const deltaY = from.centerY - to.centerY;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/**
 * Reconstructs the path from start to goal using the cameFrom map.
 */
function reconstructPath(cameFrom: Map<number, number>, current: number): number[] {
  const path = [current];
  let node = current;
  while (cameFrom.has(node)) {
    node = cameFrom.get(node)!;
    path.unshift(node);
  }
  return path;
}
