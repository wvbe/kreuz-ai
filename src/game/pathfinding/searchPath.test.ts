import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import type { PrngStream } from "../engine/Prng";
import type { GameMap } from "../map/GameMap";
import { BlockReason, GridType } from "../map/mapTypes";
import { createAsciiMap, createPathTestWorld, createVoronoiTestMap } from "./pathTestWorld";
import type { PathTestWorld } from "./pathTestWorld";
import { defaultMaxExpansions, NoPathReason, PathResultKind } from "./pathTypes";
import type { PathResult } from "./pathTypes";
import { searchPath } from "./searchPath";
import type { SearchOutcome } from "./searchPath";

const settings = { minStepCost: 5, maxExpansions: defaultMaxExpansions };

function run(
  map: GameMap,
  from: number,
  target: number,
  maxExpansions = defaultMaxExpansions,
): SearchOutcome {
  return searchPath(map, from, target, { minStepCost: 5, maxExpansions });
}

function expectFound(result: PathResult): { cells: number[]; cost: number } {
  if (result.kind !== PathResultKind.Found) {
    throw new Error(`expected a path, got ${result.kind}`);
  }
  return result;
}

/**
 * Independent reference: plain O(n^2) Dijkstra with an array scan.
 */
function bruteForceCost(map: GameMap, from: number, target: number): number | null {
  const distance = new Array<number>(map.cellCount).fill(Infinity);
  const done = new Array<boolean>(map.cellCount).fill(false);
  distance[from] = 0;
  for (;;) {
    let current = -1;
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      if (
        !done[cell] &&
        distance[cell] !== Infinity &&
        (current < 0 || distance[cell]! < distance[current]!)
      ) {
        current = cell;
      }
    }
    if (current < 0) {
      break;
    }
    done[current] = true;
    for (const next of map.neighbors(current)) {
      if (map.isTraversable(next)) {
        distance[next] = Math.min(distance[next]!, distance[current]! + map.moveCost(next));
      }
    }
  }
  return distance[target] === Infinity ? null : (distance[target] as number);
}

function randomMap(world: PathTestWorld, stream: PrngStream, index: number): GameMap {
  let map: GameMap;
  if (index % 2 === 0) {
    map = world.maps.createMap({
      gridType: GridType.Square,
      terrainId: "grass",
      width: stream.nextInt(2, 9),
      height: stream.nextInt(2, 9),
    });
  } else {
    map = createVoronoiTestMap(world, stream.nextInt(4, 70), stream.nextBelow(100000));
  }
  const terrains = ["grass", "grass", "road", "mud", "river"];
  for (let cell = 0; cell < map.cellCount; cell += 1) {
    map.setTerrain(cell, terrains[stream.nextBelow(terrains.length)] as string);
    if (stream.chancePermille(200)) {
      map.setObstruction(cell, BlockReason.Wall);
    }
  }
  return map;
}

describe("searchPath scenarios (spec 012)", () => {
  it("US1.1: empty square map, (5,5) to (15,15) is the Manhattan distance", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(
      world,
      Array.from({ length: 20 }, () => ".".repeat(20)),
    );
    const found = expectFound(run(map, map.squareCell(5, 5), map.squareCell(15, 15)).result);
    expect(found.cells).toHaveLength(20);
    expect(found.cost).toBe(200);
    expect(found.cells.at(-1)).toBe(map.squareCell(15, 15));
  });

  it("US1.2: goes around a wall instead of through it", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["........", "...#....", "........"]);
    const found = expectFound(run(map, map.squareCell(1, 1), map.squareCell(6, 1)).result);
    expect(found.cells).not.toContain(map.squareCell(3, 1));
    expect(found.cost).toBe(70);
  });

  it("US1.3: an enclosed start has no path, an enclosed target has none either", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, [".#...", "#.#..", ".#...", "....."]);
    expect(run(map, map.squareCell(1, 1), map.squareCell(4, 3)).result).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.Unreachable,
    });
    expect(run(map, map.squareCell(4, 3), map.squareCell(1, 1)).result).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.Unreachable,
    });
  });

  it("US1.4: start equal to target is AlreadyThere, distinct from NoPath", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["...", "..."]);
    expect(run(map, 4, 4)).toEqual({
      result: { kind: PathResultKind.AlreadyThere },
      expansions: 0,
    });
    map.setObstruction(4, BlockReason.Wall);
    expect(run(map, 4, 4).result.kind).toBe(PathResultKind.AlreadyThere);
  });

  it("US4: prefers cheap road over grass, never enters impassable terrain", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["......", ",,,,,,", "~~~~~."]);
    const found = expectFound(run(map, 0, map.squareCell(5, 1)).result);
    expect(found.cost).toBe(5 + 5 * 5);
    for (const cell of found.cells) {
      expect(map.blockReason(cell)).toBeNull();
    }
    expect(expectFound(run(map, map.squareCell(5, 2), 0).result).cells).not.toContain(
      map.squareCell(0, 2),
    );
  });

  it("an out-of-range or fractional cell is an invalid position, without throwing", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["..."]);
    for (const [from, target] of [
      [0, 3],
      [0, -1],
      [7, 1],
      [0.5, 1],
    ] as const) {
      expect(run(map, from, target)).toEqual({
        result: { kind: PathResultKind.NoPath, reason: NoPathReason.InvalidPosition },
        expansions: 0,
      });
    }
  });

  it("a blocked start may path out, a blocked target is unreachable at once", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["...", "..."]);
    map.setObstruction(0, BlockReason.Wall);
    expect(expectFound(run(map, 0, 2).result).cost).toBe(20);
    expect(run(map, 2, 0)).toEqual({
      result: { kind: PathResultKind.NoPath, reason: NoPathReason.Unreachable },
      expansions: 0,
    });
  });

  it("ends as BudgetExceeded when the expansion budget is too small", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, [".".repeat(12)]);
    expect(run(map, 0, 11, 3).result).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.BudgetExceeded,
    });
    expect(run(map, 0, 11, 11).result.kind).toBe(PathResultKind.Found);
  });
});

describe("searchPath determinism and optimality", () => {
  it("matches a brute-force Dijkstra on 200 random square and voronoi maps", () => {
    const stream = Prng.create({ seed: 20261005 }).stream("test.pathfinding");
    let compared = 0;
    for (let index = 0; index < 200; index += 1) {
      const world = createPathTestWorld();
      const map = randomMap(world, stream, index);
      for (let pair = 0; pair < 6; pair += 1) {
        const from = stream.nextBelow(map.cellCount);
        const target = stream.nextBelow(map.cellCount);
        const { result } = searchPath(map, from, target, settings);
        if (from === target) {
          expect(result.kind).toBe(PathResultKind.AlreadyThere);
          continue;
        }
        const reference = map.isTraversable(target) ? bruteForceCost(map, from, target) : null;
        if (reference === null) {
          expect(result).toEqual({
            kind: PathResultKind.NoPath,
            reason: NoPathReason.Unreachable,
          });
          continue;
        }
        const found = expectFound(result);
        expect(found.cost).toBe(reference);
        expect(Number.isInteger(found.cost)).toBe(true);
        let current = from;
        let total = 0;
        for (const cell of found.cells) {
          expect(map.neighbors(current)).toContain(cell);
          expect(map.isTraversable(cell)).toBe(true);
          total += map.moveCost(cell);
          current = cell;
        }
        expect(current).toBe(target);
        expect(total).toBe(found.cost);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(300);
  });

  it("gives identical paths for identical input on two independent worlds", () => {
    const rows = ["..m...", ".#.#..", "...,,.", "m#....", "......"];
    const first = createAsciiMap(createPathTestWorld(), rows);
    const second = createAsciiMap(createPathTestWorld(), rows);
    for (let from = 0; from < first.cellCount; from += 3) {
      for (let target = 1; target < first.cellCount; target += 4) {
        expect(run(first, from, target)).toEqual(run(second, from, target));
      }
    }
  });

  it("breaks ties by lowest cell index without randomness", () => {
    const world = createPathTestWorld();
    const map = createAsciiMap(world, ["...", "...", "..."]);
    // Both routes from the top-left to the centre cost 20; the lower cell index (1) wins.
    expect(expectFound(run(map, 0, 4).result).cells).toEqual([1, 4]);
  });

  it("expands each cell at most once on a 64x64 voronoi map with 20% walls", () => {
    const world = createPathTestWorld();
    const map = createVoronoiTestMap(world, 64 * 64, 42);
    const stream = Prng.create({ seed: 7 }).stream("test.pathfinding.walls");
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      if (stream.chancePermille(200)) {
        map.setObstruction(cell, BlockReason.Wall);
      }
    }
    const open = Array.from({ length: map.cellCount }, (_, cell) => cell).filter((cell) =>
      map.isTraversable(cell),
    );
    const outcome = run(map, open[0] as number, open.at(-1) as number);
    expect(outcome.result.kind).toBe(PathResultKind.Found);
    expect(outcome.expansions).toBeLessThanOrEqual(map.cellCount);
  });
});
