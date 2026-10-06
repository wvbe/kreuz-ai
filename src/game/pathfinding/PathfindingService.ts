import { isJsonObject } from "../ecs/jsonData";
import type { EventBus } from "../engine/EventBus";
import type { MapRegistry } from "../map/MapRegistry";
import type { TerrainRegistry } from "../map/TerrainRegistry";
import { findPathBreak } from "./findPathBreak";
import { PathCache } from "./PathCache";
import { defaultMaxExpansions, NoPathReason, PathResultKind } from "./pathTypes";
import type {
  PathLocation,
  PathOptions,
  PathResult,
  ReachableCell,
  RouteResult,
} from "./pathTypes";
import { reachableCells } from "./reachableCells";
import { ReachCache } from "./ReachCache";
import { searchPath } from "./searchPath";
import type { SearchOutcome } from "./searchPath";
import { searchRoute } from "./searchRoute";

/**
 * Everything a {@link PathfindingService} needs; all instances are owned by one engine.
 */
export type PathfindingServiceOptions = {
  maps: MapRegistry;
  terrain: TerrainRegistry;
  /**
   * Map-change events purge the cache of the affected map.
   */
  bus: EventBus;
  /**
   * Maximum number of cached paths; default `defaultPathCacheCapacity`.
   */
  cacheCapacity?: number;
};

const mapChangeEvents = ["map.terrain.changed", "map.cell.obstruction.changed"];

/**
 * Pathfinding for one engine (spec 012, DECISIONS D-21 and D-41): `findPath` inside a map,
 * `findRoute` across map links, `reachable` and `findPathBreak`. Every answer is a pure function
 * of the map state and the arguments; the bounded path cache only saves time. It is derived
 * state (not saved) and stale entries can never be served: they are keyed on the map object and
 * its synchronous `revision`, and the bus events additionally purge a map's entries as soon as
 * they are delivered. Results are plain JSON, safe to store in tasks and saves.
 */
export class PathfindingService {
  private readonly cache: PathCache;
  private readonly reachCache = new ReachCache();
  private reachHits = 0;
  private reachMisses = 0;

  /**
   * Creates the service and subscribes it to the map-change events.
   *
   * @param options - Maps, terrain, bus and cache size of the owning engine.
   */
  constructor(private readonly options: PathfindingServiceOptions) {
    this.cache = new PathCache(options.cacheCapacity);
    for (const name of mapChangeEvents) {
      options.bus.subscribe(name, (payload) => {
        const mapId = isJsonObject(payload) ? payload["mapId"] : undefined;
        if (typeof mapId === "number") {
          this.cache.invalidateMap(mapId);
        }
      });
    }
  }

  /**
   * Cheapest path inside one map: A* on the cell adjacency graph (spec 012). Out-of-range cells or
   * an unknown map give `NoPath` / `InvalidPosition`, never an exception.
   *
   * @param mapId - Map id.
   * @param from - Start cell index (may be blocked: the mover may path out).
   * @param target - Target cell index.
   * @param options - Expansion budget.
   * @returns `Found` (cells exclude the start, plus cost), `AlreadyThere` or `NoPath`.
   */
  findPath(mapId: number, from: number, target: number, options: PathOptions = {}): PathResult {
    const budget = resolveBudget(options);
    const map = this.options.maps.get(mapId);
    if (map === undefined) {
      return { kind: PathResultKind.NoPath, reason: NoPathReason.InvalidPosition };
    }
    const cached = this.cache.get(map, from, target);
    if (cached !== undefined) {
      return fromOutcome(cached, budget);
    }
    const outcome = searchPath(map, from, target, {
      minStepCost: this.minStepCost(),
      maxExpansions: budget,
    });
    const failedOnBudget =
      outcome.result.kind === PathResultKind.NoPath &&
      outcome.result.reason === NoPathReason.BudgetExceeded;
    if (!failedOnBudget && outcome.expansions > 0) {
      this.cache.set(map, from, target, outcome);
    }
    return copyResult(outcome.result);
  }

  /**
   * Cheapest route that may cross map links (cost {@link linkTraversalCost} per link). Without
   * any link out of the start map it is exactly `findPath` (cached); otherwise a deterministic
   * Dijkstra over the flattened graph of all maps (not cached).
   *
   * @param from - Start location.
   * @param target - Target location.
   * @param options - Expansion budget.
   * @returns `Found` with steps on one or more maps, `AlreadyThere` or `NoPath`.
   */
  findRoute(from: PathLocation, target: PathLocation, options: PathOptions = {}): RouteResult {
    const budget = resolveBudget(options);
    const source = this.options.maps.get(from.mapId);
    if (source !== undefined && from.mapId === target.mapId && source.links().length === 0) {
      const local = this.findPath(from.mapId, from.cellIndex, target.cellIndex, options);
      if (local.kind !== PathResultKind.Found) {
        return local;
      }
      return {
        kind: PathResultKind.Found,
        steps: local.cells.map((cellIndex) => ({ mapId: from.mapId, cellIndex })),
        cost: local.cost,
      };
    }
    return searchRoute(this.options.maps, from, target, budget).result;
  }

  /**
   * Everything reachable from a cell with its cheapest cost (spec 012 FR-010).
   *
   * @param mapId - Map id.
   * @param from - Start cell index.
   * @param maxCost - Optional cost bound.
   * @returns Reachable cells, ascending cell index; empty for an unknown map or cell. The list
   * may be shared with later answers (a bounded cache keyed on the map revision, never stale):
   * do not change it.
   */
  reachable(mapId: number, from: number, maxCost?: number): readonly ReachableCell[] {
    const map = this.options.maps.get(mapId);
    if (map === undefined) {
      return [];
    }
    const cached = this.reachCache.get(map, from, maxCost);
    if (cached !== undefined) {
      this.reachHits += 1;
      return cached;
    }
    this.reachMisses += 1;
    const cells = reachableCells(map, from, maxCost);
    this.reachCache.set(map, from, maxCost, cells);
    return cells;
  }

  /**
   * Checks a stored path against the current map (spec 012 FR-006).
   *
   * @param mapId - Map id.
   * @param from - Cell the mover stands on.
   * @param cells - Remaining steps.
   * @returns Index of the first invalid step, or null when the path is still valid (an unknown
   * map invalidates step 0).
   */
  findPathBreak(mapId: number, from: number, cells: readonly number[]): number | null {
    const map = this.options.maps.get(mapId);
    if (map === undefined) {
      return 0;
    }
    return findPathBreak(map, from, cells);
  }

  /**
   * Number of cached paths.
   *
   * @returns The count.
   */
  get cacheSize(): number {
    return this.cache.size;
  }

  /**
   * Cache hit and miss counters since the last {@link PathfindingService.clearCache}.
   *
   * @returns The counters.
   */
  get cacheStats(): { hits: number; misses: number } {
    return { hits: this.cache.hits, misses: this.cache.misses };
  }

  /**
   * How many `reachable` questions were answered from the cache and how many needed a search
   * since the last {@link PathfindingService.clearCache}.
   *
   * @returns The counters.
   */
  get reachStats(): { hits: number; misses: number } {
    return { hits: this.reachHits, misses: this.reachMisses };
  }

  /**
   * Empties the caches; results are unaffected.
   */
  clearCache(): void {
    this.cache.clear();
    this.reachCache.clear();
    this.reachHits = 0;
    this.reachMisses = 0;
  }

  private minStepCost(): number {
    let lowest = Number.MAX_SAFE_INTEGER;
    for (const id of this.options.terrain.ids()) {
      const definition = this.options.terrain.require(id);
      if (definition.passable && definition.moveCost < lowest) {
        lowest = definition.moveCost;
      }
    }
    return lowest === Number.MAX_SAFE_INTEGER ? 1 : lowest;
  }
}

function resolveBudget(options: PathOptions): number {
  const budget = options.maxExpansions ?? defaultMaxExpansions;
  if (!Number.isInteger(budget) || budget < 1) {
    throw new RangeError(`maxExpansions must be a positive integer, got ${String(budget)}`);
  }
  return budget;
}

function fromOutcome(outcome: SearchOutcome, budget: number): PathResult {
  if (outcome.expansions > budget) {
    return { kind: PathResultKind.NoPath, reason: NoPathReason.BudgetExceeded };
  }
  return copyResult(outcome.result);
}

function copyResult(result: PathResult): PathResult {
  return result.kind === PathResultKind.Found
    ? { kind: PathResultKind.Found, cells: [...result.cells], cost: result.cost }
    : { ...result };
}
