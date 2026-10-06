import type { GameMap } from "../map/GameMap";
import { PathHeap } from "../pathfinding/PathHeap";

/**
 * The cheapest path cost from the nearest of several start cells to every cell (spec 029 FR-008,
 * spec 012 FR-010): one multi-source Dijkstra over the map's adjacency with integer move costs.
 * It equals the minimum over the per-pair costs, depends only on costs (no tie-breaking, no
 * randomness) and never needs more than one pass. Start cells cost 0 even when blocked; other
 * cells must be traversable.
 *
 * @param map - The map.
 * @param starts - Start cell indices (the tiles of a dwelling).
 * @returns For every cell its cost, or -1 when no start reaches it.
 */
export function multiSourceCosts(map: GameMap, starts: readonly number[]): Int32Array {
  const best = new Int32Array(map.cellCount).fill(-1);
  const open = new PathHeap();
  for (const start of starts) {
    if (map.inBounds(start)) {
      best[start] = 0;
      open.push({ priority: 0, estimate: 0, key: start, cost: 0 });
    }
  }
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
      if (known !== -1 && cost >= known) {
        continue;
      }
      best[next] = cost;
      open.push({ priority: cost, estimate: 0, key: next, cost });
    }
  }
  return best;
}
