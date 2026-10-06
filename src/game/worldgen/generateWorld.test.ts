import { describe, expect, it } from "vitest";
import { bundledContentFiles, loadContent, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import { GameEngine } from "../engine/GameEngine";
import { GameEngineError } from "../engine/GameEngineError";
import { identityStreamName } from "../identity/identityTypes";
import { MapSize } from "../map/mapSize";
import { PathfindingService } from "../pathfinding/PathfindingService";
import { PathResultKind } from "../pathfinding/pathTypes";
import {
  generateWorld,
  maxWorldAttempts,
  outdoorGeneratorName,
  worldGenStreamName,
} from "./generateWorld";
import { traitStreamName } from "../skills/skillTypes";
import { terrainHash } from "./terrainHash";
import { WorldGenError, WorldGenErrorKind } from "./WorldGenError";
import { WorldTerrain } from "./WorldTerrain";

function start(seed: number, mapSize: MapSize): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed, mapSize });
  return engine;
}

function countTerrain(engine: GameEngine): Map<string, number> {
  const map = engine.maps.require(1);
  const counts = new Map<string, number>();
  for (let cell = 0; cell < map.cellCount; cell += 1) {
    counts.set(map.terrainAt(cell), (counts.get(map.terrainAt(cell)) ?? 0) + 1);
  }
  return counts;
}

describe("generateWorld through newGame", () => {
  // @covers 004:FR-016a
  // @covers 004:SC-014
  it("gives the same terrain hash for the same seed and size, on separate engines", () => {
    const first = terrainHash(start(42, MapSize.Small).maps.require(1));
    expect(terrainHash(start(42, MapSize.Small).maps.require(1))).toBe(first);
    expect(terrainHash(start(43, MapSize.Small).maps.require(1))).not.toBe(first);
    expect(terrainHash(start(42, MapSize.Medium).maps.require(1))).not.toBe(first);
  });

  it("matches the golden terrain hashes of three seeds", () => {
    expect(terrainHash(start(42, MapSize.Small).maps.require(1))).toBe("ffa3557e4ac960f6");
    expect(terrainHash(start(1, MapSize.Medium).maps.require(1))).toBe("75b840302f761935");
    expect(terrainHash(start(2024, MapSize.Large).maps.require(1))).toBe("2bb799d61e2e1f2b");
  });

  it("scales the map with the size and records the generator", () => {
    for (const [size, cells] of [
      [MapSize.Small, 600],
      [MapSize.Medium, 1200],
      [MapSize.Large, 2400],
    ] as const) {
      const map = start(5, size).maps.require(1);
      expect(map.cellCount).toBe(cells);
      expect(map.params.generator).toBe(outdoorGeneratorName);
    }
  });

  it("generates every required terrain class at every size", () => {
    for (const size of [MapSize.Small, MapSize.Medium, MapSize.Large]) {
      for (const seed of [1, 2, 3]) {
        const counts = countTerrain(start(seed, size));
        for (const terrain of [
          WorldTerrain.WaterShallow,
          WorldTerrain.FertileSoil,
          WorldTerrain.ForestOak,
          WorldTerrain.StoneDeposit,
          WorldTerrain.IronOreDeposit,
          WorldTerrain.Mountain,
          WorldTerrain.RoadDirt,
        ]) {
          expect(counts.get(terrain) ?? 0).toBeGreaterThan(0);
        }
        expect(counts.size).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("only draws from the world.gen, world.fauna, content.traits and identity.names streams", () => {
    const engine = start(42, MapSize.Small);
    expect(Object.keys(engine.prng.serialize().streams)).toEqual([
      traitStreamName,
      identityStreamName,
      "trade.visit",
      "world.fauna",
      worldGenStreamName,
    ]);
  });
});

describe("generateWorld connectivity", () => {
  function expectConnected(engine: GameEngine): void {
    const map = engine.maps.require(1);
    const service = new PathfindingService({
      maps: engine.maps,
      terrain: engine.content.terrain,
      bus: engine.bus,
    });
    const board = engine.getEntities().find((entity) => entity.prototype === "job_board");
    const village = (board?.components["Position"] as { cellIndex: number }).cellIndex;
    const targets: number[] = [];
    for (const entity of engine.getEntities()) {
      const position = entity.components["Position"] as { cellIndex: number } | undefined;
      if (position !== undefined) {
        targets.push(position.cellIndex);
      }
    }
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      if (map.terrainAt(cell) === WorldTerrain.IronOreDeposit) {
        targets.push(cell);
      }
    }
    expect(targets.length).toBeGreaterThanOrEqual(8);
    for (const target of targets) {
      expect(service.findPath(1, village, target).kind).not.toBe(PathResultKind.NoPath);
    }
  }

  it("reaches all spawn cells and the ore from the village for 50 seeds", () => {
    for (let seed = 100; seed < 150; seed += 1) {
      expectConnected(start(seed, MapSize.Small));
    }
  });

  it("holds on the larger sizes too", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      expectConnected(start(seed, MapSize.Medium));
      expectConnected(start(seed, MapSize.Large));
    }
  });

  it("falls back to carving a path when the attempts run out", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 185 });
    const world = generateWorld(engine, MapSize.Small, 185, 1);
    expect(world.attempts).toBe(1);
    expect(world.repaired).toBe(true);
    expect(world.settlerIds).toHaveLength(6);
    const normal = new GameEngine(loadContent(), { entropy: () => 1 });
    normal.newGame({ seed: 185 });
    const natural = generateWorld(normal, MapSize.Small, 185);
    expect(natural.attempts).toBeGreaterThan(1);
    expect(natural.attempts).toBeLessThanOrEqual(maxWorldAttempts);
    expect(natural.repaired).toBe(false);
  });

  it("fails clearly when no attempt is allowed", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 1 });
    expect(() => generateWorld(engine, MapSize.Small, 1, 0)).toThrow(WorldGenError);
  });
});

describe("generateWorld content requirements", () => {
  it("names the terrain a content pack lacks", () => {
    const terrain = (bundledContentFiles[ContentFile.Terrain] as { id: string }[]).filter(
      (entry) => entry.id !== WorldTerrain.IronOreDeposit,
    );
    const jobs = (bundledContentFiles[ContentFile.Jobs] as { id: string }[]).filter(
      (entry) => entry.id !== "mine.ore",
    );
    const engine = new GameEngine(
      loadContentPack({
        ...bundledContentFiles,
        [ContentFile.Terrain]: terrain,
        [ContentFile.Jobs]: jobs,
      }),
      { entropy: () => 1 },
    );
    try {
      engine.newGame({ seed: 1, mapSize: MapSize.Small });
      throw new Error("expected a failure");
    } catch (failure) {
      expect(failure).toBeInstanceOf(GameEngineError);
      const cause = (failure as GameEngineError).cause;
      expect(cause).toBeInstanceOf(WorldGenError);
      expect((cause as WorldGenError).kind).toBe(WorldGenErrorKind.MissingTerrain);
      expect((cause as WorldGenError).message).toContain("iron_ore_deposit");
    }
    expect(engine.hasGame).toBe(false);
  });
});

describe("generateWorld save and load", () => {
  // @covers 004:SC-013
  // @covers 004:SC-010
  it("round-trips a generated world exactly", () => {
    const engine = start(42, MapSize.Small);
    engine.runTicks(20);
    const text = engine.saveGame();
    const restored = new GameEngine(loadContent(), { entropy: () => 2 });
    restored.loadGame(text);
    expect(restored.saveGame()).toBe(text);
    expect(terrainHash(restored.maps.require(1))).toBe(terrainHash(engine.maps.require(1)));
    expect(restored.getEntities()).toEqual(engine.getEntities());
    expect(restored.getStateHash()).toBe(engine.getStateHash());
  });
});
