import type { GameMap } from "../map/GameMap";
import { PathHeap } from "./PathHeap";
import { cellHeuristic } from "./pathHeuristic";
import { NoPathReason, PathResultKind } from "./pathTypes";
import type { PathResult } from "./pathTypes";

/**
 * What {@link searchPath} needs besides the endpoints.
 */
export type SearchSettings = {
  /**
   * Lowest cost of entering any passable cell of the content (heuristic scale).
   */
  minStepCost: number;
  /**
   * Node-expansion budget.
   */
  maxExpansions: number;
};

/**
 * A result together with the number of node expansions it took, so a cache can honour the
 * budget exactly like a fresh search would.
 */
export type SearchOutcome = {
  result: PathResult;
  expansions: number;
};

const unseen = -1;

/**
 * Deterministic A* inside one map (spec 012, DECISIONS D-21, plan AD7). A pure function of
 * `(map state, from, to, settings)`: ties break on `(f, h, cell index)` ascending, neighbours are
 * visited in ascending cell index, nothing random and no cache is involved. Cost is the sum of the
 * terrain move costs of the entered cells; blocked cells are never entered, but the start cell may
 * itself be blocked (an entity can path out of a freshly built wall). A target that is not
 * traversable is `NoPath` at once. Hitting `maxExpansions` ends the search as `NoPath` with reason
 * `BudgetExceeded`.
 *
 * @param map - The map to search.
 * @param from - Start cell index.
 * @param target - Target cell index.
 * @param settings - Heuristic scale and budget.
 * @returns The result and the expansion count.
 */
export function searchPath(
  map: GameMap,
  from: number,
  target: number,
  settings: SearchSettings,
): SearchOutcome {
  if (!map.inBounds(from) || !map.inBounds(target)) {
    return noPath(NoPathReason.InvalidPosition, 0);
  }
  if (from === target) {
    return { result: { kind: PathResultKind.AlreadyThere }, expansions: 0 };
  }
  if (!map.isTraversable(target)) {
    return noPath(NoPathReason.Unreachable, 0);
  }
  const best = new Int32Array(map.cellCount).fill(unseen);
  const parent = new Int32Array(map.cellCount).fill(unseen);
  const open = new PathHeap();
  best[from] = 0;
  const startHeuristic = cellHeuristic(map, from, target, settings.minStepCost);
  open.push({ priority: startHeuristic, estimate: startHeuristic, key: from, cost: 0 });
  let expansions = 0;
  for (let entry = open.pop(); entry !== undefined; entry = open.pop()) {
    const cell = entry.key;
    if (entry.cost !== best[cell]) {
      continue;
    }
    if (cell === target) {
      return { result: buildFound(parent, from, target, entry.cost), expansions };
    }
    if (expansions >= settings.maxExpansions) {
      return noPath(NoPathReason.BudgetExceeded, expansions);
    }
    expansions += 1;
    for (const next of map.neighbors(cell)) {
      if (!map.isTraversable(next)) {
        continue;
      }
      const cost = entry.cost + map.moveCost(next);
      const known = best[next] as number;
      if (known !== unseen && cost >= known) {
        continue;
      }
      best[next] = cost;
      parent[next] = cell;
      const heuristic = cellHeuristic(map, next, target, settings.minStepCost);
      open.push({ priority: cost + heuristic, estimate: heuristic, key: next, cost });
    }
  }
  return noPath(NoPathReason.Unreachable, expansions);
}

function noPath(reason: NoPathReason, expansions: number): SearchOutcome {
  return { result: { kind: PathResultKind.NoPath, reason }, expansions };
}

function buildFound(parent: Int32Array, from: number, target: number, cost: number): PathResult {
  const cells: number[] = [];
  for (let cell = target; cell !== from; cell = parent[cell] as number) {
    cells.push(cell);
  }
  cells.reverse();
  return { kind: PathResultKind.Found, cells, cost };
}
