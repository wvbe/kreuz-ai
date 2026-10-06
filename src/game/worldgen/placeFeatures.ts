import type { PrngStream } from "../engine/Prng";
import type { CellPoint, MapGeometry } from "../map/mapTypes";
import { distanceSquared } from "./distanceSquared";
import { cellSpacing } from "./generateOutdoorTerrain";
import { WorldTerrain } from "./WorldTerrain";

/**
 * Name of the PRNG stream of the late feature pass (D-250). A stream of its own, so adding or
 * changing a rule here never shifts a draw of `world.gen`, `world.fauna` or any other stream.
 */
export const featuresStreamName = "world.gen.features";

/**
 * Cells nearer than this many cell spacings to the village center keep the terrain of the base
 * generator (the starting fields, roads, plots and the first trees of the settlers).
 */
export const featureKeepOutSpacings = 8;

/**
 * Cells nearer than this many cell spacings to the iron ore deposit keep their terrain.
 */
export const oreKeepOutSpacings = 3;

/**
 * Marsh costs more to cross than the grass it replaces (25 against 10), so it keeps this many
 * cell spacings clear of the village, also in the guarantee step: no route of the first weeks
 * crosses it and the timing of every existing scenario stays what it was. A small map may
 * have no marsh because of it.
 */
export const costlyFeatureKeepOutSpacings = 13;

/**
 * Keep-out used by the guarantee step for a feature that the first pass did not place anywhere.
 */
export const featureFallbackKeepOutSpacings = 4;

/**
 * The biome a feature terrain was cut from. Systems that must behave as before the feature pass
 * (the wild animal spawn, whose habitat lists and stream draws are fixed by D-140) read a cell
 * through {@link baseTerrainOf}.
 */
export const featureBaseTerrain: ReadonlyMap<string, string> = new Map([
  [WorldTerrain.ForestPine, WorldTerrain.ForestOak],
  [WorldTerrain.ForestBirch, WorldTerrain.ForestOak],
  [WorldTerrain.Sand, WorldTerrain.Grassland],
  [WorldTerrain.ClayDeposit, WorldTerrain.Grassland],
  [WorldTerrain.Marsh, WorldTerrain.Grassland],
  [WorldTerrain.Rocky, WorldTerrain.Grassland],
  [WorldTerrain.OreVein, WorldTerrain.ForestOak],
  [WorldTerrain.OrchardSoil, WorldTerrain.FertileSoil],
  [WorldTerrain.VineyardSoil, WorldTerrain.FertileSoil],
  [WorldTerrain.WaterDeep, WorldTerrain.WaterShallow],
]);

/**
 * Terrain ids of the bundled pack that no outdoor generation path paints, with the reason. A test
 * checks that every other id of the pack appears on generated maps.
 */
export const nonGeneratedTerrain: ReadonlyMap<string, string> = new Map([
  [
    WorldTerrain.RockWall,
    "walls of caves and cellars (generateCave, generateCellar), not of the outdoors",
  ],
  [WorldTerrain.CaveFloor, "floor of caves and what a quarried deposit clears to"],
  [WorldTerrain.FloorWood, "built by the player (floors) and the floor of cellars"],
  ["floor_stone", "built by the player (stone floors); no outdoor biome"],
  ["road_stone", "built by the player (paving); the village roads are dirt"],
]);

/**
 * The terrain id a cell has for systems that ignore the feature pass.
 *
 * @param terrainId - Terrain id of a cell.
 * @returns The base biome of a feature terrain, or the id itself.
 */
export function baseTerrainOf(terrainId: string): string {
  return featureBaseTerrain.get(terrainId) ?? terrainId;
}

/**
 * Inputs of {@link placeFeatures}.
 */
export type FeatureOptions = {
  geometry: MapGeometry;
  /**
   * The `world.gen.features` stream.
   */
  stream: PrngStream;
  /**
   * Settlement cell.
   */
  villageCenter: number;
  /**
   * Cells of the iron ore deposit.
   */
  oreCells: readonly number[];
  /**
   * Cells that must never change (the village clearing).
   */
  clearing: readonly number[];
  /**
   * Whether the content pack has a terrain id; rules for missing ids are skipped.
   */
  hasTerrain: (terrainId: string) => boolean;
};

type Rule = {
  target: WorldTerrain;
  /**
   * Whether the cell of the base map can become the target.
   */
  eligible: (cell: number) => boolean;
  /**
   * Permille share of the single roll of a cell that this rule takes.
   */
  permille: number;
  /**
   * Biome that must keep at least one cell on the map.
   */
  source: WorldTerrain | null;
  /**
   * Village keep-out of this rule in cell spacings; the default is {@link featureKeepOutSpacings}.
   */
  keepOutSpacings?: number;
};

/**
 * Late pass of the outdoor generator (D-250): converts a few cells of existing biomes into the
 * terrains that the pack has but the base generator never paints (pine and birch forest, sand,
 * clay, marsh, rocky ground, ore veins, orchard and vineyard soil, deep water). It draws only from
 * `world.gen.features`, never touches the village clearing or a cell within
 * {@link featureKeepOutSpacings} of the village center or {@link oreKeepOutSpacings} of the iron
 * ore deposit, and keeps passability and build class of the cell it replaces (water stays water,
 * trees stay trees; clay and marsh are costlier than grass but passable), so reachability and the
 * connectivity guarantee of `verifyWorld` are those of the base map. A cell is decided by one
 * roll against the cumulative shares of the rules it fits, in cell order. Where a rule found
 * nothing on a map, a guarantee step converts one cell with a smaller keep-out.
 *
 * @param terrain - Terrain list to modify in place.
 * @param options - Geometry, stream, village cell, ore cells and the clearing.
 * @returns The number of cells converted.
 */
export function placeFeatures(terrain: string[], options: FeatureOptions): number {
  const { geometry, stream } = options;
  const base = terrain.slice();
  const spacing = cellSpacing(geometry.cellCount);
  const village = geometry.centroids[options.villageCenter] as CellPoint;
  const neighborsOf = (cell: number): readonly number[] => geometry.adjacency[cell] as number[];
  const hasNeighbor = (cell: number, id: WorldTerrain): boolean =>
    neighborsOf(cell).some((next) => base[next] === id);
  const fixed = new Set<number>(options.clearing);
  const keepOut = (cell: number, villageSpacings: number): boolean => {
    const point = geometry.centroids[cell] as CellPoint;
    return (
      fixed.has(cell) ||
      distanceSquared(point, village) < villageSpacings * villageSpacings * spacing * spacing ||
      options.oreCells.some(
        (ore) =>
          distanceSquared(point, geometry.centroids[ore] as CellPoint) <
          oreKeepOutSpacings * oreKeepOutSpacings * spacing * spacing,
      )
    );
  };
  const count = (id: WorldTerrain): number => terrain.filter((entry) => entry === id).length;
  const isForestEdge = (cell: number): boolean =>
    base[cell] === WorldTerrain.ForestOak &&
    neighborsOf(cell).some((next) => base[next] !== WorldTerrain.ForestOak);
  const isShoreGrass = (cell: number): boolean =>
    base[cell] === WorldTerrain.Grassland && hasNeighbor(cell, WorldTerrain.WaterShallow);
  const isGrassByStone = (cell: number): boolean =>
    base[cell] === WorldTerrain.Grassland && hasNeighbor(cell, WorldTerrain.StoneDeposit);
  const isFertileInland = (cell: number): boolean =>
    base[cell] === WorldTerrain.FertileSoil && hasNeighbor(cell, WorldTerrain.FertileSoil);
  const isLakeHeart = (cell: number): boolean =>
    base[cell] === WorldTerrain.WaterShallow &&
    neighborsOf(cell).every((next) => base[next] === WorldTerrain.WaterShallow);
  const allRules: readonly Rule[] = [
    {
      target: WorldTerrain.ForestPine,
      eligible: isForestEdge,
      permille: 300,
      source: WorldTerrain.ForestOak,
    },
    {
      target: WorldTerrain.ForestBirch,
      eligible: isForestEdge,
      permille: 300,
      source: WorldTerrain.ForestOak,
    },
    { target: WorldTerrain.Sand, eligible: isShoreGrass, permille: 350, source: null },
    { target: WorldTerrain.ClayDeposit, eligible: isShoreGrass, permille: 200, source: null },
    {
      target: WorldTerrain.Marsh,
      eligible: isShoreGrass,
      permille: 150,
      source: null,
      keepOutSpacings: costlyFeatureKeepOutSpacings,
    },
    { target: WorldTerrain.Rocky, eligible: isGrassByStone, permille: 400, source: null },
    {
      target: WorldTerrain.OreVein,
      eligible: isForestEdge,
      permille: 150,
      source: WorldTerrain.ForestOak,
    },
    { target: WorldTerrain.OrchardSoil, eligible: isFertileInland, permille: 300, source: null },
    { target: WorldTerrain.VineyardSoil, eligible: isFertileInland, permille: 200, source: null },
    { target: WorldTerrain.WaterDeep, eligible: isLakeHeart, permille: 1000, source: null },
  ];
  const rules = allRules.filter((rule) => options.hasTerrain(rule.target));
  const keepsSource = (rule: Rule): boolean => rule.source === null || count(rule.source) > 1;
  let converted = 0;
  for (let cell = 0; cell < terrain.length; cell += 1) {
    if (keepOut(cell, featureKeepOutSpacings)) {
      continue;
    }
    const roll = stream.nextInt(0, 999);
    const tooNear = (rule: Rule): boolean => keepOut(cell, rule.keepOutSpacings ?? 0);
    let ceiling = 0;
    for (const rule of rules) {
      if (!rule.eligible(cell) || tooNear(rule)) {
        continue;
      }
      ceiling += rule.permille;
      if (roll < ceiling) {
        if (keepsSource(rule)) {
          terrain[cell] = rule.target;
          converted += 1;
        }
        break;
      }
    }
  }
  for (const rule of rules) {
    if (count(rule.target) > 0) {
      continue;
    }
    for (const spacings of [featureKeepOutSpacings, featureFallbackKeepOutSpacings].map((entry) =>
      Math.max(entry, rule.keepOutSpacings ?? 0),
    )) {
      const candidates: number[] = [];
      for (let cell = 0; cell < terrain.length; cell += 1) {
        if (terrain[cell] === base[cell] && !keepOut(cell, spacings) && rule.eligible(cell)) {
          candidates.push(cell);
        }
      }
      if (candidates.length > 0 && keepsSource(rule)) {
        terrain[stream.choice(candidates)] = rule.target;
        converted += 1;
        break;
      }
    }
  }
  return converted;
}
