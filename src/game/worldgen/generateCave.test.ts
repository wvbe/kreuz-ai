import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { MapSize } from "../map/mapSize";
import { GridType } from "../map/mapTypes";
import { reachableCells } from "../pathfinding/reachableCells";
import { generateCave, generateCaveTerrain } from "./generateCave";
import { readWorldLayout } from "./readWorldLayout";
import { terrainHash } from "./terrainHash";
import { WorldGenError } from "./WorldGenError";
import { WorldTerrain } from "./WorldTerrain";

function start(seed: number): { engine: GameEngine; villageCell: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed, mapSize: MapSize.Small });
  return { engine, villageCell: readWorldLayout(engine)?.villageCell ?? 0 };
}

describe("generateCaveTerrain", () => {
  it("keeps one connected cavern with the entrance on its west side", () => {
    const stream = start(7).engine.prng.stream("world.gen");
    const cave = generateCaveTerrain(stream, 40, 30);
    expect(cave.terrain).toHaveLength(1200);
    const floor = cave.terrain.filter((id) => id === WorldTerrain.CaveFloor).length;
    expect(floor).toBeGreaterThanOrEqual(300);
    expect(cave.terrain[cave.entrance]).toBe(WorldTerrain.CaveFloor);
    for (let cell = 0; cell < cave.terrain.length; cell += 1) {
      const border = cell % 40 === 0 || cell < 40 || cell >= 1160 || cell % 40 === 39;
      if (border) {
        expect(cave.terrain[cell]).toBe(WorldTerrain.RockWall);
      }
    }
  });

  it("is deterministic for the same stream state and rejects tiny sizes", () => {
    const left = generateCaveTerrain(start(7).engine.prng.stream("world.gen"), 24, 16);
    const right = generateCaveTerrain(start(7).engine.prng.stream("world.gen"), 24, 16);
    expect(left).toEqual(right);
    expect(() => generateCaveTerrain(start(7).engine.prng.stream("x"), 4, 4)).toThrow(
      WorldGenError,
    );
  });
});

describe("generateCave", () => {
  it("creates a linked sub-map whose floor is fully reachable from the entrance", () => {
    const { engine, villageCell } = start(42);
    const stream = engine.prng.stream("world.gen");
    const cave = generateCave(engine.maps, stream, {
      parentId: 1,
      parentCell: villageCell,
    });
    const map = engine.maps.require(cave.mapId);
    expect(map.gridType).toBe(GridType.Square);
    expect(map.parentId).toBe(1);
    expect(map.params.generator).toBe("cave");
    const floor: number[] = [];
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      if (map.terrainAt(cell) === WorldTerrain.CaveFloor) {
        floor.push(cell);
      }
    }
    const reached = reachableCells(map, cave.entranceCell).map((entry) => entry.cell);
    expect(reached).toEqual(floor);
  });

  it("links both ways so an entity can travel in and out", () => {
    const { engine, villageCell } = start(42);
    const cave = generateCave(engine.maps, engine.prng.stream("world.gen"), {
      parentId: 1,
      parentCell: villageCell,
      width: 20,
      height: 12,
    });
    const walker = engine.store.spawn("peasant", {
      Position: { mapId: 1, cellIndex: villageCell },
    });
    engine.maps.placeEntity(walker.id, 1, villageCell);
    expect(engine.maps.travel(walker.id)).toEqual({
      mapId: cave.mapId,
      cellIndex: cave.entranceCell,
    });
    expect(engine.maps.travel(walker.id)).toEqual({ mapId: 1, cellIndex: villageCell });
  });

  it("is deterministic across engines and rejects a blocked mouth", () => {
    const first = start(42);
    const second = start(42);
    const left = generateCave(first.engine.maps, first.engine.prng.stream("world.gen"), {
      parentId: 1,
      parentCell: first.villageCell,
    });
    const right = generateCave(second.engine.maps, second.engine.prng.stream("world.gen"), {
      parentId: 1,
      parentCell: second.villageCell,
    });
    expect(terrainHash(first.engine.maps.require(left.mapId))).toBe(
      terrainHash(second.engine.maps.require(right.mapId)),
    );
    const parent = first.engine.maps.require(1);
    const mountain = [...Array(parent.cellCount).keys()].find(
      (cell) => parent.terrainAt(cell) === WorldTerrain.Mountain,
    );
    expect(() =>
      generateCave(first.engine.maps, first.engine.prng.stream("world.gen"), {
        parentId: 1,
        parentCell: mountain ?? 0,
      }),
    ).toThrow(WorldGenError);
  });
});
