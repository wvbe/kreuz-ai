import type { GameMap } from "../map/GameMap";
import type { SearchOutcome } from "./searchPath";

type CacheEntry = {
  mapId: number;
  map: GameMap;
  revision: number;
  outcome: SearchOutcome;
};

/**
 * Default number of cached paths.
 */
export const defaultPathCacheCapacity = 1024;

/**
 * Bounded cache of same-map search outcomes (spec 012 FR-006, DECISIONS D-41). It never changes a
 * result: an entry is used only while its map object and `GameMap.revision` are unchanged, so any
 * terrain, obstruction or link change makes it a miss, and entries remember their expansion count
 * so the service can apply the budget exactly as a fresh search would. Eviction is
 * least-recently-used on a plain insertion-ordered `Map`, which depends only on the call
 * sequence, not on time. The cache is derived state: it is not saved and is cleared on every
 * `newGame` / `loadGame`.
 */
export class PathCache {
  private readonly entries = new Map<string, CacheEntry>();
  private hitCount = 0;
  private missCount = 0;

  /**
   * Creates an empty cache.
   *
   * @param capacity - Maximum number of entries (at least 1).
   */
  constructor(private readonly capacity: number = defaultPathCacheCapacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`path cache capacity must be a positive integer, got ${capacity}`);
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
   * Lookups that returned an outcome.
   *
   * @returns The count.
   */
  get hits(): number {
    return this.hitCount;
  }

  /**
   * Lookups that found nothing usable.
   *
   * @returns The count.
   */
  get misses(): number {
    return this.missCount;
  }

  /**
   * Looks up a cached outcome; a stale entry is dropped.
   *
   * @param map - The map being searched.
   * @param from - Start cell.
   * @param target - Target cell.
   * @returns The outcome, or undefined.
   */
  get(map: GameMap, from: number, target: number): SearchOutcome | undefined {
    const key = keyOf(map.id, from, target);
    const entry = this.entries.get(key);
    if (entry === undefined || entry.map !== map || entry.revision !== map.revision) {
      if (entry !== undefined) {
        this.entries.delete(key);
      }
      this.missCount += 1;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hitCount += 1;
    return entry.outcome;
  }

  /**
   * Stores an outcome, evicting the least recently used entry when full.
   *
   * @param map - The map that was searched.
   * @param from - Start cell.
   * @param target - Target cell.
   * @param outcome - The outcome to keep.
   */
  set(map: GameMap, from: number, target: number, outcome: SearchOutcome): void {
    const key = keyOf(map.id, from, target);
    this.entries.delete(key);
    this.entries.set(key, { mapId: map.id, map, revision: map.revision, outcome });
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) {
        this.entries.delete(oldest.value);
      }
    }
  }

  /**
   * Drops every entry of one map (called on map-change events).
   *
   * @param mapId - Map id.
   * @returns Number of entries dropped.
   */
  invalidateMap(mapId: number): number {
    let dropped = 0;
    for (const [key, entry] of this.entries) {
      if (entry.mapId === mapId) {
        this.entries.delete(key);
        dropped += 1;
      }
    }
    return dropped;
  }

  /**
   * Drops everything and resets the counters.
   */
  clear(): void {
    this.entries.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }
}

function keyOf(mapId: number, from: number, target: number): string {
  return `${mapId}:${from}:${target}`;
}
