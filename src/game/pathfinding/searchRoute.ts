import type { GameMap } from "../map/GameMap";
import type { MapRegistry } from "../map/MapRegistry";
import { PathHeap } from "./PathHeap";
import { linkTraversalCost, NoPathReason, PathResultKind } from "./pathTypes";
import type { PathLocation, RouteResult } from "./pathTypes";

/**
 * A route result with the number of node expansions it took.
 */
export type RouteOutcome = {
  result: RouteResult;
  expansions: number;
};

/**
 * Cell indices stay below this, so `mapId * keyStride + cell` is a unique integer node key whose
 * order is "map id, then cell index".
 */
const keyStride = 1 << 21;

type Node = {
  cost: number;
  parent: number;
};

/**
 * Deterministic cheapest route over the flattened graph of all maps (DECISIONS D-21): cells are
 * nodes, edges are the cell adjacency of each map plus every map link (cost
 * {@link linkTraversalCost}, landing on the link's target cell). Because a link can be cheaper
 * than any geometric bound, the heuristic is zero (Dijkstra order); ties break on
 * `(f, map id, cell index)`. Like {@link searchPath} the start may be blocked, other nodes must
 * be traversable, and `maxExpansions` ends the search as `NoPath` / `BudgetExceeded`.
 *
 * @param maps - The maps of the game.
 * @param from - Start location.
 * @param goal - Target location.
 * @param maxExpansions - Node-expansion budget.
 * @returns The result and the expansion count.
 */
export function searchRoute(
  maps: MapRegistry,
  from: PathLocation,
  goal: PathLocation,
  maxExpansions: number,
): RouteOutcome {
  const source = maps.get(from.mapId);
  const goalMap = maps.get(goal.mapId);
  if (
    source === undefined ||
    goalMap === undefined ||
    !source.inBounds(from.cellIndex) ||
    !goalMap.inBounds(goal.cellIndex)
  ) {
    return failure(NoPathReason.InvalidPosition, 0);
  }
  if (from.mapId === goal.mapId && from.cellIndex === goal.cellIndex) {
    return { result: { kind: PathResultKind.AlreadyThere }, expansions: 0 };
  }
  if (!goalMap.isTraversable(goal.cellIndex)) {
    return failure(NoPathReason.Unreachable, 0);
  }
  const startKey = keyOf(from);
  const goalKey = keyOf(goal);
  const nodes = new Map<number, Node>([[startKey, { cost: 0, parent: -1 }]]);
  const open = new PathHeap();
  open.push({ priority: 0, estimate: 0, key: startKey, cost: 0 });
  let expansions = 0;
  for (let entry = open.pop(); entry !== undefined; entry = open.pop()) {
    const node = nodes.get(entry.key) as Node;
    if (entry.cost !== node.cost) {
      continue;
    }
    if (entry.key === goalKey) {
      return { result: buildRoute(nodes, goalKey, entry.cost), expansions };
    }
    if (expansions >= maxExpansions) {
      return failure(NoPathReason.BudgetExceeded, expansions);
    }
    expansions += 1;
    const mapId = Math.floor(entry.key / keyStride);
    const cell = entry.key - mapId * keyStride;
    const map = maps.require(mapId);
    for (const next of map.neighbors(cell)) {
      relax(nodes, open, entry.key, entry.cost, map, mapId, next, 0);
    }
    const link = map.getLink(cell);
    const landing = link === null ? undefined : maps.get(link.targetMapId);
    if (link !== null && landing !== undefined && landing.inBounds(link.targetCell)) {
      relax(
        nodes,
        open,
        entry.key,
        entry.cost,
        landing,
        landing.id,
        link.targetCell,
        linkTraversalCost,
      );
    }
  }
  return failure(NoPathReason.Unreachable, expansions);
}

function relax(
  nodes: Map<number, Node>,
  open: PathHeap,
  parentKey: number,
  parentCost: number,
  map: GameMap,
  mapId: number,
  cell: number,
  extraCost: number,
): void {
  if (!map.isTraversable(cell)) {
    return;
  }
  const cost = parentCost + extraCost + map.moveCost(cell);
  const key = mapId * keyStride + cell;
  const known = nodes.get(key);
  if (known !== undefined && cost >= known.cost) {
    return;
  }
  nodes.set(key, { cost: cost, parent: parentKey });
  open.push({ priority: cost, estimate: 0, key, cost });
}

function keyOf(location: PathLocation): number {
  return location.mapId * keyStride + location.cellIndex;
}

function failure(reason: NoPathReason, expansions: number): RouteOutcome {
  return { result: { kind: PathResultKind.NoPath, reason }, expansions };
}

function buildRoute(nodes: Map<number, Node>, goalKey: number, cost: number): RouteResult {
  const steps: PathLocation[] = [];
  let key = goalKey;
  let node = nodes.get(key) as Node;
  while (node.parent >= 0) {
    const mapId = Math.floor(key / keyStride);
    steps.push({ mapId, cellIndex: key - mapId * keyStride });
    key = node.parent;
    node = nodes.get(key) as Node;
  }
  steps.reverse();
  return { kind: PathResultKind.Found, steps, cost };
}
