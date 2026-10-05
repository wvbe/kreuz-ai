import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import { BlockReason } from "../map/mapTypes";
import { PathfindingService } from "./PathfindingService";
import { createAsciiMap, createPathTestWorld, createVoronoiTestMap } from "./pathTestWorld";
import type { PathTestWorld } from "./pathTestWorld";
import { NoPathReason, PathResultKind } from "./pathTypes";

function createService(world: PathTestWorld, cacheCapacity?: number): PathfindingService {
  return new PathfindingService({
    maps: world.maps,
    terrain: world.terrain,
    bus: world.bus,
    cacheCapacity,
  });
}

describe("PathfindingService.findPath", () => {
  it("returns the three distinct result kinds", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["..#.", "..#."]);
    const service = createService(world);
    expect(service.findPath(map.id, 0, 1)).toEqual({
      kind: PathResultKind.Found,
      cells: [1],
      cost: 10,
    });
    expect(service.findPath(map.id, 0, 0)).toEqual({ kind: PathResultKind.AlreadyThere });
    expect(service.findPath(map.id, 0, 3)).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.Unreachable,
    });
    expect(service.findPath(99, 0, 1)).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.InvalidPosition,
    });
    expect(service.findPath(map.id, 0, 40)).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.InvalidPosition,
    });
  });

  it("rejects a bad expansion budget", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["..."]);
    const service = createService(world);
    expect(() => service.findPath(map.id, 0, 2, { maxExpansions: 0 })).toThrow(RangeError);
  });

  it("gives the same answer cold and warm, on two independent services", () => {
    const rows = ["..m...", ".#.#..", "...,,.", "m#....", "......"];
    const worldA = createPathTestWorld();
    const worldB = createPathTestWorld();
    const mapA = createAsciiMap(worldA, rows);
    createAsciiMap(worldB, rows);
    const warm = createService(worldA);
    const cold = createService(worldB, 4);
    for (let round = 0; round < 2; round += 1) {
      for (let from = 0; from < mapA.cellCount; from += 2) {
        for (let target = 1; target < mapA.cellCount; target += 3) {
          const reference = createService(worldB).findPath(mapA.id, from, target);
          expect(warm.findPath(mapA.id, from, target)).toEqual(reference);
          expect(cold.findPath(mapA.id, from, target)).toEqual(reference);
        }
      }
    }
    expect(warm.cacheStats.hits).toBeGreaterThan(0);
    expect(cold.cacheSize).toBeLessThanOrEqual(4);
  });

  it("serves from the cache and hands out independent copies", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["....."]);
    const service = createService(world);
    const first = service.findPath(map.id, 0, 4);
    if (first.kind === PathResultKind.Found) {
      first.cells.length = 0;
    }
    expect(service.findPath(map.id, 0, 4)).toEqual({
      kind: PathResultKind.Found,
      cells: [1, 2, 3, 4],
      cost: 40,
    });
    expect(service.cacheStats).toEqual({ hits: 1, misses: 1 });
    service.clearCache();
    expect(service.cacheSize).toBe(0);
  });

  it("applies the budget to cached answers exactly as a fresh search would", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, [".".repeat(12)]);
    const service = createService(world);
    const tight = { maxExpansions: 3 };
    const budgetFailure = service.findPath(map.id, 0, 11, tight);
    expect(budgetFailure).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.BudgetExceeded,
    });
    expect(service.cacheSize).toBe(0);
    expect(service.findPath(map.id, 0, 11).kind).toBe(PathResultKind.Found);
    expect(service.cacheSize).toBe(1);
    expect(service.findPath(map.id, 0, 11, tight)).toEqual(budgetFailure);
  });

  it("invalidates cached paths on setTerrain and setObstruction (sync and by event)", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["...", "..."]);
    const service = createService(world);
    expect(service.findPath(map.id, 0, 2)).toMatchObject({ cost: 20 });
    map.setTerrain(1, "road");
    expect(service.findPath(map.id, 0, 2)).toMatchObject({ cost: 15, cells: [1, 2] });
    map.setObstruction(1, BlockReason.Wall);
    expect(service.findPath(map.id, 0, 2)).toMatchObject({ cost: 40, cells: [3, 4, 5, 2] });
    expect(service.cacheSize).toBe(1);
    world.bus.processQueue();
    expect(service.cacheSize).toBe(0);
    map.setObstruction(1, null);
    expect(service.findPath(map.id, 0, 2)).toMatchObject({ cost: 15 });
  });

  it("keeps other maps' entries when one map changes", () => {
    const world = createPathTestWorld();
    const first = createAsciiMap(world, ["..."]);
    const second = createAsciiMap(world, ["..."]);
    const service = createService(world);
    service.findPath(first.id, 0, 2);
    service.findPath(second.id, 0, 2);
    second.setTerrain(1, "mud");
    world.bus.processQueue();
    expect(service.cacheSize).toBe(1);
  });

  it("yields identical paths with a cold and a warm cache on a voronoi map", () => {
    const world = createPathTestWorld();
    const map = createVoronoiTestMap(world, 200, 9);
    const stream = Prng.create({ seed: 1 }).stream("test.service");
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      if (stream.chancePermille(150)) {
        map.setObstruction(cell, BlockReason.Wall);
      }
    }
    const pairs = Array.from({ length: 60 }, () => [stream.nextBelow(200), stream.nextBelow(200)]);
    const service = createService(world);
    const cold = pairs.map(([from, target]) =>
      service.findPath(map.id, from as number, target as number),
    );
    const warm = pairs.map(([from, target]) =>
      service.findPath(map.id, from as number, target as number),
    );
    expect(warm).toEqual(cold);
    service.clearCache();
    expect(
      pairs.map(([from, target]) => service.findPath(map.id, from as number, target as number)),
    ).toEqual(cold);
  });
});

describe("PathfindingService.findRoute", () => {
  it("equals findPath on a map without links", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["...", "..."]);
    const service = createService(world);
    expect(
      service.findRoute({ mapId: map.id, cellIndex: 0 }, { mapId: map.id, cellIndex: 5 }),
    ).toEqual({
      kind: PathResultKind.Found,
      steps: [
        { mapId: 1, cellIndex: 1 },
        { mapId: 1, cellIndex: 2 },
        { mapId: 1, cellIndex: 5 },
      ],
      cost: 30,
    });
    expect(
      service.findRoute({ mapId: map.id, cellIndex: 0 }, { mapId: map.id, cellIndex: 0 }),
    ).toEqual({ kind: PathResultKind.AlreadyThere });
    expect(service.findRoute({ mapId: map.id, cellIndex: 0 }, { mapId: 8, cellIndex: 0 })).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.InvalidPosition,
    });
  });

  it("crosses links and sees link changes immediately", () => {
    const world = createPathTestWorld();
    const first = createAsciiMap(world, ["..."]);
    const second = createAsciiMap(world, ["..."]);
    const service = createService(world);
    const from = { mapId: first.id, cellIndex: 0 };
    const target = { mapId: second.id, cellIndex: 2 };
    expect(service.findRoute(from, target).kind).toBe(PathResultKind.NoPath);
    world.maps.linkMaps({ mapId: first.id, cell: 2, targetMapId: second.id, targetCell: 0 });
    expect(service.findRoute(from, target)).toMatchObject({ kind: PathResultKind.Found, cost: 60 });
  });
});

describe("PathfindingService.reachable and findPathBreak", () => {
  it("answers reachability and path validity questions", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["..#."]);
    const service = createService(world);
    expect(service.reachable(map.id, 0).map((entry) => entry.cell)).toEqual([0, 1]);
    expect(service.reachable(77, 0)).toEqual([]);
    expect(service.findPathBreak(map.id, 0, [1])).toBeNull();
    expect(service.findPathBreak(map.id, 0, [1, 2])).toBe(1);
    expect(service.findPathBreak(77, 0, [1])).toBe(0);
  });
});
