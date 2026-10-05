import type { GameMap } from "../map/GameMap";
import { PathHeap } from "./PathHeap";
import type { ReachableCell } from "./pathTypes";

/**
 * Reachability query (spec 012 FR-010): every cell an entity standing on `from` can walk to, with
 * its cheapest cost (Dijkstra). The start counts with cost 0 even when it is blocked. Result is in
 * ascending cell index. An invalid start gives an empty list.
 *
 * @param map - The map.
 * @param from - Start cell index.
 * @param maxCost - Only cells whose cheapest cost is at most this (default: unbounded).
 * @returns The reachable cells, ascending cell index.
 */
export function reachableCells(
  map: GameMap,
  from: number,
  maxCost: number = Number.MAX_SAFE_INTEGER,
): ReachableCell[] {
  if (!map.inBounds(from)) {
    return [];
  }
  const best = new Int32Array(map.cellCount).fill(-1);
  const open = new PathHeap();
  best[from] = 0;
  open.push({ priority: 0, estimate: 0, key: from, cost: 0 });
  for (let entry = open.pop(); entry !== undefined; entry = open.pop()) {
    if (entry.cost !== best[entry.key]) {
      continue;
    }
    for (const next of map.neighbors(entry.key)) {
      if (!map.isTraversable(next)) {
        continue;
      }
      const cost = entry.cost + map.moveCost(next);
      const known = best[next] as number;
      if (cost > maxCost || (known !== -1 && cost >= known)) {
        continue;
      }
      best[next] = cost;
      open.push({ priority: cost, estimate: 0, key: next, cost });
    }
  }
  const cells: ReachableCell[] = [];
  for (let cell = 0; cell < best.length; cell += 1) {
    const cost = best[cell] as number;
    if (cost !== -1) {
      cells.push({ cell, cost });
    }
  }
  return cells;
}
