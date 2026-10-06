import { describe, expect, it } from "vitest";
import { loadContent } from "../../src/game/content/ContentLoader";
import { requireComponent } from "../../src/game/ecs/Entity";
import { GameEngine } from "../../src/game/engine/GameEngine";
import { Prng } from "../../src/game/engine/Prng";
import { MapSize } from "../../src/game/map/mapSize";
import { BlockReason, GridType } from "../../src/game/map/mapTypes";
import { positionComponent } from "../../src/game/map/positionComponent";
import { PathfindingService } from "../../src/game/pathfinding/PathfindingService";
import {
  createAsciiMap,
  createPathTestWorld,
  createVoronoiTestMap,
} from "../../src/game/pathfinding/pathTestWorld";
import { PathResultKind } from "../../src/game/pathfinding/pathTypes";
import { generateCave } from "../../src/game/worldgen/generateCave";
import { generateCellar } from "../../src/game/worldgen/generateCellar";
import { readWorldLayout } from "../../src/game/worldgen/readWorldLayout";

// Performance and multi-map criteria of specs 004 and 012. Budgets are the spec figures times ten
// (the suite runs on shared machines; D-114).

const wallClockFactor = 10;

function openCells(map: { cellCount: number; isTraversable: (cell: number) => boolean }): number[] {
  const open: number[] = [];
  for (let cell = 0; cell < map.cellCount; cell += 1) {
    if (map.isTraversable(cell)) {
      open.push(cell);
    }
  }
  return open;
}

function wallsOnTenth(map: {
  cellCount: number;
  setObstruction: (cell: number, reason: BlockReason) => void;
}): void {
  const stream = Prng.create({ seed: 9 }).stream("perf.walls");
  for (let cell = 0; cell < map.cellCount; cell += 1) {
    if (stream.chancePermille(100)) {
      map.setObstruction(cell, BlockReason.Wall);
    }
  }
}

describe("pathfinding and terrain budgets on both grid types", () => {
  // @covers 004:FR-009 004:SC-004 004:SC-005 012:FR-007 012:SC-006
  it("answers 100 concurrent path queries in under a second on a voronoi and on a square map", () => {
    const world = createPathTestWorld();
    const voronoi = createVoronoiTestMap(world, 2500, 5);
    const square = createAsciiMap(
      world,
      Array.from({ length: 50 }, () => ".".repeat(50)),
    );
    wallsOnTenth(square);
    wallsOnTenth(voronoi);
    const service = new PathfindingService({
      maps: world.maps,
      terrain: world.terrain,
      bus: world.bus,
    });
    const open = openCells(voronoi);
    const run = (): string[] => {
      const answers: string[] = [];
      for (let query = 0; query < 100; query += 1) {
        const from = open[(query * 7) % open.length] as number;
        const target = open[(query * 13 + 5) % open.length] as number;
        answers.push(JSON.stringify(service.findPath(voronoi.id, from, target)));
      }
      return answers;
    };
    const started = performance.now();
    const first = run();
    expect(performance.now() - started).toBeLessThan(1000 * wallClockFactor);
    service.clearCache();
    expect(run()).toEqual(first);
    const squareOpen = openCells(square);
    const squareRun = (): string[] => {
      const answers: string[] = [];
      for (let query = 0; query < 100; query += 1) {
        const from = squareOpen[(query * 7) % squareOpen.length] as number;
        const target = squareOpen[(query * 13 + 5) % squareOpen.length] as number;
        answers.push(JSON.stringify(service.findPath(square.id, from, target)));
      }
      return answers;
    };
    const squareStart = performance.now();
    const squareFirst = squareRun();
    expect(performance.now() - squareStart).toBeLessThan(1000 * wallClockFactor);
    service.clearCache();
    expect(squareRun()).toEqual(squareFirst);
    expect(square.gridType).toBe(GridType.Square);
  });

  // @covers 004:SC-003 004:SC-011 004:FR-015
  it("checks traversability of 100 entities and queries terrain on 1000+ cells quickly", () => {
    const world = createPathTestWorld();
    const map = createVoronoiTestMap(world, 4096, 3);
    wallsOnTenth(map);
    const started = performance.now();
    let traversable = 0;
    for (let entity = 0; entity < 100; entity += 1) {
      if (map.isTraversable((entity * 37) % map.cellCount)) {
        traversable += 1;
      }
    }
    expect(traversable).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(50 * wallClockFactor);
    const queryStart = performance.now();
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      map.terrainAt(cell);
      map.blockReason(cell);
      map.neighbors(cell);
    }
    expect(performance.now() - queryStart).toBeLessThan(5 * wallClockFactor * 100);
  });
});

describe("several maps share one clock", () => {
  // @covers 004:FR-010 004:FR-011 004:SC-006 004:SC-007 004:SC-009 004:FR-012 004:SC-008
  it("runs a voronoi world, a cave and a cellar side by side on the one tick counter", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 42, mapSize: MapSize.Small });
    const villageCell = readWorldLayout(engine)?.villageCell ?? 0;
    const stream = engine.prng.stream("world.gen");
    const cave = generateCave(engine.maps, stream, { parentId: 1, parentCell: villageCell });
    const outdoorMap = engine.maps.require(1);
    const stairs = outdoorMap
      .neighbors(villageCell)
      .find((cell) => outdoorMap.blockReason(cell) === null) as number;
    const cellar = generateCellar(engine.maps, stream, { parentId: 1, parentCell: stairs });
    expect(engine.maps.require(1).gridType).toBe(GridType.Voronoi);
    expect(engine.maps.require(cave.mapId).gridType).toBe(GridType.Square);
    expect(engine.maps.require(cellar.mapId).gridType).toBe(GridType.Square);
    const outdoor = engine.store.spawn("peasant", {
      Position: { mapId: 1, cellIndex: villageCell },
    });
    engine.maps.placeEntity(outdoor.id, 1, villageCell);
    const underground = engine.store.spawn("peasant", {
      Position: { mapId: 1, cellIndex: villageCell },
    });
    engine.maps.placeEntity(underground.id, 1, villageCell);
    const target = engine.maps.travel(underground.id);
    requireComponent(underground, positionComponent).mapId = target.mapId;
    requireComponent(underground, positionComponent).cellIndex = target.cellIndex;
    expect(target.mapId).toBe(cave.mapId);
    expect(engine.maps.queryCell(cave.mapId, target.cellIndex).occupants).toContain(underground.id);
    const before = engine.time.tickCount;
    engine.runTicks(20);
    expect(engine.time.tickCount).toBe(before + 20);
    const tickOnEveryMap = engine.maps.list().map(() => engine.time.tickCount);
    expect(new Set(tickOnEveryMap).size).toBe(1);
  });
});

describe("cross-map routes", () => {
  // @covers 012:SC-003 012:SC-004 012:FR-005
  it("plans a route over a link and the walk along it reaches the target", () => {
    const content = loadContent();
    const engine = new GameEngine(content, { entropy: () => 1 });
    engine.newGame({ seed: 42, mapSize: MapSize.Small });
    const villageCell = readWorldLayout(engine)?.villageCell ?? 0;
    const cave = generateCave(engine.maps, engine.prng.stream("world.gen"), {
      parentId: 1,
      parentCell: villageCell,
    });
    const service = new PathfindingService({
      maps: engine.maps,
      terrain: content.terrain,
      bus: engine.bus,
    });
    const floor = openCells(engine.maps.require(cave.mapId));
    const goal = floor[floor.length - 1] as number;
    const started = performance.now();
    const route = service.findRoute(
      { mapId: 1, cellIndex: villageCell },
      { mapId: cave.mapId, cellIndex: goal },
    );
    expect(performance.now() - started).toBeLessThan(50 * wallClockFactor);
    expect(route.kind).toBe(PathResultKind.Found);
    if (route.kind === PathResultKind.Found) {
      expect(route.steps[route.steps.length - 1]).toEqual({ mapId: cave.mapId, cellIndex: goal });
      expect(route.steps.every((step) => step.mapId === cave.mapId)).toBe(true);
    }
  });
});
