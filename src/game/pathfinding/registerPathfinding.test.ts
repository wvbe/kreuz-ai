import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { BlockReason, GridType } from "../map/mapTypes";
import { PathResultKind } from "./pathTypes";
import { pathResultSchema } from "./pathSchemas";
import { pathfindingSystemId, registerPathfinding } from "./registerPathfinding";

function createEngine(): GameEngine {
  return new GameEngine(loadContent(), { entropy: () => 5 });
}

function passableTerrain(engine: GameEngine): string {
  return engine.content.terrain
    .ids()
    .find((id) => engine.content.terrain.require(id).passable) as string;
}

function addSquareMap(engine: GameEngine) {
  return engine.maps.createMap({
    gridType: GridType.Square,
    terrainId: passableTerrain(engine),
    width: 6,
    height: 6,
  });
}

describe("registerPathfinding", () => {
  it("registers the system once per engine and returns the same service", () => {
    const engine = createEngine();
    const service = registerPathfinding(engine);
    expect(registerPathfinding(engine)).toBe(service);
    expect(registerPathfinding(createEngine())).not.toBe(service);
    expect(pathfindingSystemId).toBe("pathfinding");
    expect(engine.queryNames()).toEqual(
      expect.arrayContaining(["find-path", "find-route", "reachable"]),
    );
  });

  it("finds the same path on two engines and through the queries", () => {
    const results = [createEngine(), createEngine()].map((engine) => {
      const service = registerPathfinding(engine);
      engine.newGame({ seed: 3 });
      const map = addSquareMap(engine);
      map.setObstruction(map.squareCell(2, 0), BlockReason.Wall);
      return { engine, map, found: service.findPath(map.id, 0, map.squareCell(5, 0)) };
    });
    expect(results[0]?.found).toEqual(results[1]?.found);
    expect(results[0]?.found.kind).toBe(PathResultKind.Found);
    const first = results[0];
    const query = first?.engine.getQuery("find-path");
    const viaQuery = query?.run(
      { mapId: first?.map.id ?? 0, from: 0, target: 5 },
      first?.engine as GameEngine,
    );
    expect(pathResultSchema.parse(viaQuery)).toEqual(first?.found);
  });

  it("answers find-route and reachable queries and clears the cache on a new game", () => {
    const engine = createEngine();
    const service = registerPathfinding(engine);
    engine.newGame({ seed: 3 });
    const map = addSquareMap(engine);
    service.findPath(map.id, 0, 5);
    expect(service.cacheSize).toBe(1);
    const route = engine
      .getQuery("find-route")
      ?.run(
        { from: { mapId: map.id, cellIndex: 0 }, target: { mapId: map.id, cellIndex: 1 } },
        engine,
      );
    expect(route).toMatchObject({ kind: PathResultKind.Found });
    const reachable = engine
      .getQuery("reachable")
      ?.run({ mapId: map.id, from: 0, maxCost: 0 }, engine);
    expect(reachable).toEqual([{ cell: 0, cost: 0 }]);
    engine.newGame({ seed: 4 });
    expect(service.cacheSize).toBe(0);
  });
});
