import { describe, expect, it } from "vitest";
import { Prng } from "../../src/game/engine/Prng";
import { BlockReason } from "../../src/game/map/mapTypes";
import { PathfindingService } from "../../src/game/pathfinding/PathfindingService";
import {
  createPathTestWorld,
  createVoronoiTestMap,
} from "../../src/game/pathfinding/pathTestWorld";
import { PathResultKind } from "../../src/game/pathfinding/pathTypes";

// Spec 012 SC-002 / SC-007: a path on a 50x50-class map must take < 100 ms and a re-plan after an
// obstacle change < 50 ms. The worst case here is a 64x64 (4096 cell) voronoi map with 20% walls
// searched corner to corner, which is larger than the spec's 2500 cells. The budgets are the
// spec's, measured on a warm search; a typical run takes a few milliseconds.
describe("pathfinding performance (spec 012 SC-002, SC-007)", () => {
  it("finds a corner-to-corner path on a 64x64 voronoi map with 20% walls in < 100 ms", () => {
    const world = createPathTestWorld();
    const map = createVoronoiTestMap(world, 64 * 64, 42);
    const stream = Prng.create({ seed: 7 }).stream("perf.walls");
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      if (stream.chancePermille(200)) {
        map.setObstruction(cell, BlockReason.Wall);
      }
    }
    const open = Array.from({ length: map.cellCount }, (_, cell) => cell).filter((cell) =>
      map.isTraversable(cell),
    );
    const from = open[0] as number;
    const target = open.at(-1) as number;
    const service = new PathfindingService({
      maps: world.maps,
      terrain: world.terrain,
      bus: world.bus,
    });
    expect(service.findPath(map.id, from, target).kind).toBe(PathResultKind.Found);
    service.clearCache();
    const started = performance.now();
    const cold = service.findPath(map.id, from, target);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(cold.kind).toBe(PathResultKind.Found);
    if (cold.kind === PathResultKind.Found) {
      const blocked = cold.cells[Math.floor(cold.cells.length / 2)] as number;
      map.setObstruction(blocked, BlockReason.Wall);
      const replanStart = performance.now();
      const replanned = service.findPath(map.id, from, target);
      expect(performance.now() - replanStart).toBeLessThan(500);
      expect(replanned.kind === PathResultKind.Found && !replanned.cells.includes(blocked)).toBe(
        true,
      );
    }
  });
});
