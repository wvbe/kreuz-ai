import { describe, expect, it } from "vitest";
import { BlockReason } from "../map/mapTypes";
import { PathCache } from "./PathCache";
import { createAsciiMap, createPathTestWorld } from "./pathTestWorld";
import { PathResultKind } from "./pathTypes";
import type { SearchOutcome } from "./searchPath";

const outcome: SearchOutcome = {
  result: { kind: PathResultKind.Found, cells: [1], cost: 10 },
  expansions: 1,
};

describe("PathCache", () => {
  it("rejects a non-positive capacity", () => {
    expect(() => new PathCache(0)).toThrow(RangeError);
  });

  it("serves stored outcomes and counts hits and misses", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..."]);
    const cache = new PathCache();
    expect(cache.get(map, 0, 1)).toBeUndefined();
    cache.set(map, 0, 1, outcome);
    expect(cache.get(map, 0, 1)).toBe(outcome);
    expect(cache.size).toBe(1);
    expect([cache.hits, cache.misses]).toEqual([1, 1]);
    cache.clear();
    expect([cache.size, cache.hits, cache.misses]).toEqual([0, 0, 0]);
  });

  // @covers 012:FR-006
  it("drops an entry once its map changed", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..."]);
    const cache = new PathCache();
    cache.set(map, 0, 1, outcome);
    map.setObstruction(1, BlockReason.Wall);
    expect(cache.get(map, 0, 1)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("does not serve an entry stored for another map object with the same id", () => {
    const first = createAsciiMap(createPathTestWorld(), ["..."]);
    const second = createAsciiMap(createPathTestWorld(), ["..."]);
    const cache = new PathCache();
    cache.set(first, 0, 1, outcome);
    expect(cache.get(second, 0, 1)).toBeUndefined();
  });

  it("evicts the least recently used entry deterministically", () => {
    const map = createAsciiMap(createPathTestWorld(), ["....."]);
    const cache = new PathCache(2);
    cache.set(map, 0, 1, outcome);
    cache.set(map, 0, 2, outcome);
    cache.get(map, 0, 1);
    cache.set(map, 0, 3, outcome);
    expect(cache.get(map, 0, 2)).toBeUndefined();
    expect(cache.get(map, 0, 1)).toBe(outcome);
    expect(cache.get(map, 0, 3)).toBe(outcome);
    expect(cache.size).toBe(2);
  });

  it("invalidates all entries of one map only", () => {
    const world = createPathTestWorld();
    const one = createAsciiMap(world, ["..."]);
    const two = createAsciiMap(world, ["..."]);
    const cache = new PathCache();
    cache.set(one, 0, 1, outcome);
    cache.set(one, 0, 2, outcome);
    cache.set(two, 0, 1, outcome);
    expect(cache.invalidateMap(one.id)).toBe(2);
    expect(cache.size).toBe(1);
  });
});
