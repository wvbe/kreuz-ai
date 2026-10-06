import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { Prng } from "../engine/Prng";
import { MapSize } from "../map/mapSize";
import type { CellPoint } from "../map/mapTypes";
import { buildVoronoiGeometry } from "../map/voronoiGeometry";
import { reachableCells } from "../pathfinding/reachableCells";
import { distanceSquared } from "./distanceSquared";
import { cellSpacing, generateOutdoorTerrain } from "./generateOutdoorTerrain";
import { chooseVillageCenter, layoutVillage } from "./layoutVillage";
import {
  baseTerrainOf,
  costlyFeatureKeepOutSpacings,
  featureBaseTerrain,
  featureKeepOutSpacings,
  featuresStreamName,
  nonGeneratedTerrain,
  oreKeepOutSpacings,
  placeFeatures,
} from "./placeFeatures";
import { placeIronOre } from "./placeIronOre";
import { readWorldLayout } from "./readWorldLayout";
import { WorldTerrain } from "./WorldTerrain";

const content = loadContent();
const sizes: readonly [MapSize, number][] = [
  [MapSize.Small, 600],
  [MapSize.Medium, 1200],
  [MapSize.Large, 2400],
];

type Painted = {
  before: string[];
  after: string[];
  center: number;
  ore: number[];
  clearing: number[];
  geometry: ReturnType<typeof buildVoronoiGeometry>;
};

function paint(seed: number, cells: number): Painted {
  const geometry = buildVoronoiGeometry({ seed, cellCount: cells, relaxPasses: 2 });
  const stream = Prng.create({ seed }).stream("world.gen");
  const center = chooseVillageCenter(geometry, stream);
  const terrain = generateOutdoorTerrain({ geometry, stream, villageCenter: center });
  const village = layoutVillage(geometry, stream, terrain, center);
  const ore = placeIronOre(geometry, stream, terrain, center, village.clearing);
  const before = terrain.slice();
  placeFeatures(terrain, {
    geometry,
    stream: Prng.create({ seed }).stream(featuresStreamName),
    villageCenter: center,
    oreCells: ore,
    clearing: village.clearing,
    hasTerrain: (id) => content.terrain.has(id),
  });
  return { before, after: terrain, center, ore, clearing: village.clearing, geometry };
}

const seeds = [42, 7, 1, 2024, 99, 5, 314, 8, 123, 4567];

describe("placeFeatures", () => {
  it("is a pure function of the geometry, the stream seed and the base terrain", () => {
    expect(paint(42, 600)).toEqual(paint(42, 600));
    expect(paint(42, 600).after).not.toEqual(paint(43, 600).after);
  });

  it("changes only cells of the base biome of the new terrain (inverse via baseTerrainOf)", () => {
    for (const seed of seeds) {
      const painted = paint(seed, 600);
      expect(painted.after.map(baseTerrainOf)).toEqual(painted.before);
    }
  });

  it("never touches the clearing, the ore deposit or a cell within the keep-out of the village", () => {
    for (const [, cells] of sizes) {
      for (const seed of seeds) {
        const { before, after, center, ore, clearing, geometry } = paint(seed, cells);
        const spacing = cellSpacing(cells);
        const village = geometry.centroids[center] as CellPoint;
        for (let cell = 0; cell < cells; cell += 1) {
          if (before[cell] === after[cell]) {
            continue;
          }
          const point = geometry.centroids[cell] as CellPoint;
          const away = Math.floor((distanceSquared(point, village) * 1) / (spacing * spacing));
          expect(clearing).not.toContain(cell);
          expect(away).toBeGreaterThanOrEqual(featureKeepOutSpacings * featureKeepOutSpacings);
          for (const oreCell of ore) {
            expect(
              distanceSquared(point, geometry.centroids[oreCell] as CellPoint),
            ).toBeGreaterThanOrEqual(oreKeepOutSpacings * oreKeepOutSpacings * spacing * spacing);
          }
          if (after[cell] === WorldTerrain.Marsh) {
            expect(away).toBeGreaterThanOrEqual(
              costlyFeatureKeepOutSpacings * costlyFeatureKeepOutSpacings,
            );
          }
        }
      }
    }
  });

  it("keeps the passability of every cell, so reachability is that of the base map", () => {
    for (const seed of seeds) {
      const { before, after } = paint(seed, 600);
      for (let cell = 0; cell < before.length; cell += 1) {
        expect(content.terrainContent.require(after[cell] as string).passable).toBe(
          content.terrainContent.require(before[cell] as string).passable,
        );
      }
    }
  });

  it("keeps the move cost of every cell except marsh", () => {
    for (const seed of seeds) {
      const { before, after } = paint(seed, 600);
      for (let cell = 0; cell < before.length; cell += 1) {
        if (after[cell] === WorldTerrain.Marsh || before[cell] === after[cell]) {
          continue;
        }
        expect(content.terrainContent.require(after[cell] as string).moveCost).toBe(
          content.terrainContent.require(before[cell] as string).moveCost,
        );
      }
    }
  });

  it("skips the rules of terrain ids the pack does not have", () => {
    const geometry = buildVoronoiGeometry({ seed: 42, cellCount: 600, relaxPasses: 2 });
    const stream = Prng.create({ seed: 42 }).stream("world.gen");
    const center = chooseVillageCenter(geometry, stream);
    const terrain = generateOutdoorTerrain({ geometry, stream, villageCenter: center });
    const before = terrain.slice();
    const changed = placeFeatures(terrain, {
      geometry,
      stream: Prng.create({ seed: 42 }).stream(featuresStreamName),
      villageCenter: center,
      oreCells: [],
      clearing: [],
      hasTerrain: () => false,
    });
    expect(changed).toBe(0);
    expect(terrain).toEqual(before);
  });
});

describe("terrain coverage of generated worlds", () => {
  function used(seed: number, size: MapSize): Set<string> {
    const engine = new GameEngine(content, { entropy: () => 1 });
    engine.newGame({ seed, mapSize: size });
    const map = engine.maps.require(1);
    const ids = new Set<string>();
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      ids.add(map.terrainAt(cell));
    }
    return ids;
  }

  // Twenty generated maps over all three sizes: a pack terrain id is either generated or listed
  // with a reason in `nonGeneratedTerrain`.
  it("paints every terrain id of the pack in twenty maps, except the listed non-generated ones", () => {
    const seen = new Set<string>();
    const sample: [number, MapSize][] = [];
    for (const seed of [42, 7, 1, 2024, 99, 5, 314]) {
      sample.push([seed, MapSize.Small], [seed, MapSize.Medium]);
    }
    for (const seed of [2024, 99, 5, 314, 8, 123]) {
      sample.push([seed, MapSize.Large]);
    }
    expect(sample).toHaveLength(20);
    for (const [seed, size] of sample) {
      for (const id of used(seed, size)) {
        seen.add(id);
      }
    }
    for (const id of content.terrain.ids()) {
      if (nonGeneratedTerrain.has(id)) {
        expect(seen.has(id), `${id} is listed as non-generated but was painted`).toBe(false);
        expect(nonGeneratedTerrain.get(id)?.length ?? 0).toBeGreaterThan(10);
      } else {
        expect(seen.has(id), `${id} never appears on a generated map`).toBe(true);
      }
    }
  }, 120_000);

  it("lists only ids of the pack, and every feature base is an outdoor biome of the generator", () => {
    for (const id of nonGeneratedTerrain.keys()) {
      expect(content.terrain.has(id), id).toBe(true);
    }
    for (const [feature, base] of featureBaseTerrain) {
      expect(content.terrain.has(feature), feature).toBe(true);
      expect(content.terrain.has(base), base).toBe(true);
    }
  });

  it("puts pine, birch, clay, sand, ore veins, rocky ground, orchard and vineyard soil on seed 42 Small", () => {
    const ids = used(42, MapSize.Small);
    for (const id of [
      WorldTerrain.ForestPine,
      WorldTerrain.ForestBirch,
      WorldTerrain.ClayDeposit,
      WorldTerrain.Sand,
      WorldTerrain.OreVein,
      WorldTerrain.Rocky,
      WorldTerrain.OrchardSoil,
      WorldTerrain.VineyardSoil,
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("keeps the connectivity guarantee: new terrains are passable and the village reaches them", () => {
    for (const [seed, size] of [
      [42, MapSize.Small],
      [7, MapSize.Small],
      [1, MapSize.Medium],
      [2024, MapSize.Large],
    ] as const) {
      const engine = new GameEngine(content, { entropy: () => 1 });
      engine.newGame({ seed, mapSize: size });
      const map = engine.maps.require(1);
      const layout = readWorldLayout(engine);
      const reached = new Set(
        reachableCells(map, layout?.villageCell ?? 0).map((entry) => entry.cell),
      );
      const reachedIds = new Set([...reached].map((cell) => map.terrainAt(cell)));
      for (const id of [WorldTerrain.ForestPine, WorldTerrain.Sand, WorldTerrain.Rocky]) {
        expect(reachedIds.has(id), `${id} reachable from the village (${String(seed)})`).toBe(true);
      }
    }
  }, 120_000);

  it("is independent of the fauna and every other stream: newGame equals the bare pipeline", () => {
    const engine = new GameEngine(content, { entropy: () => 1 });
    engine.newGame({ seed: 42, mapSize: MapSize.Small });
    const map = engine.maps.require(1);
    const ids: string[] = [];
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      ids.push(map.terrainAt(cell));
    }
    expect(ids).toEqual(paint(42, 600).after);
  });
});
