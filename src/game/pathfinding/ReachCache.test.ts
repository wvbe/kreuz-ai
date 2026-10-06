import { describe, expect, it } from "vitest";
import { BlockReason } from "../map/mapTypes";
import { createAsciiMap, createPathTestWorld } from "./pathTestWorld";
import { ReachCache } from "./ReachCache";

const cells = [{ cell: 0, cost: 0 }];

describe("ReachCache", () => {
  it("rejects a non-positive capacity", () => {
    expect(() => new ReachCache(0)).toThrow(RangeError);
  });

  it("serves a stored answer for the same map, start and bound only", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..."]);
    const cache = new ReachCache();
    expect(cache.get(map, 0, undefined)).toBeUndefined();
    cache.set(map, 0, undefined, cells);
    expect(cache.get(map, 0, undefined)).toBe(cells);
    expect(cache.get(map, 0, 5)).toBeUndefined();
    expect(cache.get(map, 1, undefined)).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it("drops an entry once its map changed", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..."]);
    const cache = new ReachCache();
    cache.set(map, 0, undefined, cells);
    map.setObstruction(1, BlockReason.Wall);
    expect(cache.get(map, 0, undefined)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the least recently used entry when the cells held pass the bound", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..."]);
    const cache = new ReachCache(2);
    cache.set(map, 0, undefined, cells);
    cache.set(map, 1, undefined, cells);
    expect(cache.get(map, 0, undefined)).toBe(cells);
    cache.set(map, 2, undefined, cells);
    expect(cache.get(map, 1, undefined)).toBeUndefined();
    expect(cache.get(map, 0, undefined)).toBe(cells);
    expect(cache.get(map, 2, undefined)).toBe(cells);
  });

  it("counts the cells it holds and always keeps the newest answer", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..."]);
    const cache = new ReachCache(1);
    const two = [
      { cell: 0, cost: 0 },
      { cell: 1, cost: 10 },
    ];
    cache.set(map, 0, undefined, two);
    expect([cache.size, cache.cells]).toEqual([1, 2]);
    cache.set(map, 1, undefined, cells);
    expect([cache.size, cache.cells]).toEqual([1, 1]);
    cache.set(map, 1, undefined, two);
    expect([cache.size, cache.cells]).toEqual([1, 2]);
    expect(cache.get(map, 1, undefined)).toBe(two);
    expect(cache.cells).toBe(2);
  });

  it("clears everything", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..."]);
    const cache = new ReachCache();
    cache.set(map, 0, undefined, cells);
    cache.clear();
    expect([cache.size, cache.cells]).toEqual([0, 0]);
  });
});
