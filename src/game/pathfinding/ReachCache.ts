import type { GameMap } from "../map/GameMap";
import type { ReachableCell } from "./pathTypes";

type ReachEntry = {
  map: GameMap;
  revision: number;
  cells: readonly ReachableCell[];
};

/**
 * Default bound on the cells held by all cached answers together (about 20 MB at most): every
 * cell of an answer is one small object. A 600-cell map keeps the answers of every start cell.
 */
export const defaultReachCacheCells = 500_000;

/**
 * Bounded cache of `reachable` answers (task 7.1: every citizen asks for everything it can walk
 * to each time it looks for work, which made a 200-citizen tick quadratic). Like the path cache
 * it never changes a result: an entry is used only while its map object and `GameMap.revision`
 * are unchanged, so any terrain, obstruction or link change makes it a miss. Eviction is
 * least-recently-used on an insertion-ordered `Map` until the cells held are within the bound,
 * which depends only on the call sequence. The cache is derived state and is never saved. The stored lists are shared: callers must not change
 * them.
 */
export class ReachCache {
  private readonly entries = new Map<string, ReachEntry>();
  private heldCells = 0;

  /**
   * Creates an empty cache.
   *
   * @param capacity - Maximum number of cells held by all answers together (at least 1); the
   * newest answer is always kept, even when it alone is larger.
   */
  constructor(private readonly capacity: number = defaultReachCacheCells) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`reach cache capacity must be a positive integer, got ${capacity}`);
    }
  }

  /**
   * Number of entries.
   *
   * @returns The count.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Looks up a cached answer; a stale entry is dropped.
   *
   * @param map - The map being searched.
   * @param from - Start cell.
   * @param maxCost - The cost bound the answer was computed with, or undefined for none.
   * @returns The cells, or undefined.
   */
  get(
    map: GameMap,
    from: number,
    maxCost: number | undefined,
  ): readonly ReachableCell[] | undefined {
    const key = keyOf(map.id, from, maxCost);
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    this.entries.delete(key);
    this.heldCells -= entry.cells.length;
    if (entry.map !== map || entry.revision !== map.revision) {
      return undefined;
    }
    this.entries.set(key, entry);
    this.heldCells += entry.cells.length;
    return entry.cells;
  }

  /**
   * Stores an answer, evicting the least recently used entry when full.
   *
   * @param map - The map that was searched.
   * @param from - Start cell.
   * @param maxCost - The cost bound used, or undefined for none.
   * @param cells - The answer to keep.
   */
  set(
    map: GameMap,
    from: number,
    maxCost: number | undefined,
    cells: readonly ReachableCell[],
  ): void {
    const key = keyOf(map.id, from, maxCost);
    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.heldCells -= previous.cells.length;
      this.entries.delete(key);
    }
    this.entries.set(key, { map, revision: map.revision, cells });
    this.heldCells += cells.length;
    while (this.heldCells > this.capacity && this.entries.size > 1) {
      const oldest = this.entries.entries().next();
      if (oldest.done === true) {
        break;
      }
      this.entries.delete(oldest.value[0]);
      this.heldCells -= oldest.value[1].cells.length;
    }
  }

  /**
   * Drops everything.
   */
  clear(): void {
    this.entries.clear();
    this.heldCells = 0;
  }

  /**
   * Number of cells held by all cached answers.
   *
   * @returns The count.
   */
  get cells(): number {
    return this.heldCells;
  }
}

function keyOf(mapId: number, from: number, maxCost: number | undefined): string {
  return `${mapId}:${from}:${maxCost ?? "-"}`;
}
