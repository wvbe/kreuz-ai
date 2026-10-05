import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { MapSize } from "../map/mapSize";
import { GridType } from "../map/mapTypes";
import { reachableCells } from "../pathfinding/reachableCells";
import { generateCellar, generateCellarTerrain } from "./generateCellar";
import { readWorldLayout } from "./readWorldLayout";
import { terrainHash } from "./terrainHash";
import { WorldGenError } from "./WorldGenError";
import { WorldTerrain } from "./WorldTerrain";

function start(seed: number): { engine: GameEngine; villageCell: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed, mapSize: MapSize.Small });
  return { engine, villageCell: readWorldLayout(engine)?.villageCell ?? 0 };
}

describe("generateCellarTerrain", () => {
  it("paints two to five non-overlapping rooms connected by corridors", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const stream = start(seed).engine.prng.stream("world.gen");
      const cellar = generateCellarTerrain(stream, 20, 14);
      expect(cellar.rooms.length).toBeGreaterThanOrEqual(2);
      expect(cellar.rooms.length).toBeLessThanOrEqual(5);
      expect(cellar.terrain).toHaveLength(280);
      expect(cellar.terrain[cellar.entrance]).toBe(WorldTerrain.FloorWood);
      const floor = cellar.terrain.filter((id) => id === WorldTerrain.FloorWood).length;
      expect(floor).toBeGreaterThanOrEqual(18);
    }
  });

  it("rejects sizes that cannot hold two rooms and is deterministic", () => {
    const stream = start(1).engine.prng.stream("world.gen");
    expect(() => generateCellarTerrain(stream, 5, 5)).toThrow(WorldGenError);
    const left = generateCellarTerrain(start(3).engine.prng.stream("world.gen"), 20, 14);
    const right = generateCellarTerrain(start(3).engine.prng.stream("world.gen"), 20, 14);
    expect(left).toEqual(right);
  });
});

describe("generateCellar", () => {
  it("creates a linked square sub-map whose floor is fully reachable from the stairs", () => {
    const { engine, villageCell } = start(42);
    const cellar = generateCellar(engine.maps, engine.prng.stream("world.gen"), {
      parentId: 1,
      parentCell: villageCell,
    });
    const map = engine.maps.require(cellar.mapId);
    expect(map.gridType).toBe(GridType.Square);
    expect(map.parentId).toBe(1);
    expect(map.params.generator).toBe("cellar");
    const floor: number[] = [];
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      if (map.terrainAt(cell) === WorldTerrain.FloorWood) {
        floor.push(cell);
      }
    }
    expect(reachableCells(map, cellar.entranceCell).map((entry) => entry.cell)).toEqual(floor);
    expect(cellar.roomCount).toBeGreaterThanOrEqual(2);
  });

  it("links both ways so an entity can walk down and up", () => {
    const { engine, villageCell } = start(42);
    const cellar = generateCellar(engine.maps, engine.prng.stream("world.gen"), {
      parentId: 1,
      parentCell: villageCell,
    });
    const walker = engine.store.spawn("peasant", {
      Position: { mapId: 1, cellIndex: villageCell },
    });
    engine.maps.placeEntity(walker.id, 1, villageCell);
    expect(engine.maps.travel(walker.id)).toEqual({
      mapId: cellar.mapId,
      cellIndex: cellar.entranceCell,
    });
    expect(engine.maps.travel(walker.id)).toEqual({ mapId: 1, cellIndex: villageCell });
  });

  it("is deterministic across engines and rejects a blocked cell", () => {
    const first = start(42);
    const second = start(42);
    const left = generateCellar(first.engine.maps, first.engine.prng.stream("world.gen"), {
      parentId: 1,
      parentCell: first.villageCell,
    });
    const right = generateCellar(second.engine.maps, second.engine.prng.stream("world.gen"), {
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
      generateCellar(first.engine.maps, first.engine.prng.stream("world.gen"), {
        parentId: 1,
        parentCell: mountain ?? 0,
      }),
    ).toThrow(WorldGenError);
  });
});
