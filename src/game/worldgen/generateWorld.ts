import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { GridType } from "../map/mapTypes";
import type { MapSize } from "../map/mapSize";
import { carvePath } from "./carvePath";
import { generateOutdoorTerrain } from "./generateOutdoorTerrain";
import { chooseVillageCenter, layoutVillage } from "./layoutVillage";
import type { VillageLayout } from "./layoutVillage";
import { placeIronOre } from "./placeIronOre";
import { spawnSettlers } from "./spawnSettlers";
import { verifyWorld } from "./verifyWorld";
import { WorldGenError, WorldGenErrorKind } from "./WorldGenError";
import { WorldTerrain } from "./WorldTerrain";

/**
 * Name of the PRNG stream every world generator draws from (DECISIONS section 0).
 */
export const worldGenStreamName = "world.gen";

/**
 * Generator name stored in the `params` of the main outdoor map.
 */
export const outdoorGeneratorName = "outdoor";

/**
 * Bounded number of candidate maps tried before the repair step.
 */
export const maxWorldAttempts = 8;

/**
 * Result of {@link generateWorld}.
 */
export type GeneratedWorld = {
  /**
   * Id of the main outdoor map.
   */
  mapId: number;
  /**
   * The village clearing, roads and plots.
   */
  village: VillageLayout;
  /**
   * Cells of the iron ore deposit, ascending.
   */
  oreCells: number[];
  /**
   * Candidate maps drawn (1 means the first one was valid).
   */
  attempts: number;
  /**
   * Whether the connectivity repair step had to carve a path.
   */
  repaired: boolean;
  /**
   * Job board at the village center, or null when the pack has no such prototype.
   */
  jobBoardId: EntityId | null;
  /**
   * Starting settlers in spawn order.
   */
  settlerIds: EntityId[];
};

const requiredTerrain: readonly WorldTerrain[] = [
  WorldTerrain.Grassland,
  WorldTerrain.FertileSoil,
  WorldTerrain.ForestOak,
  WorldTerrain.WaterShallow,
  WorldTerrain.StoneDeposit,
  WorldTerrain.IronOreDeposit,
  WorldTerrain.Mountain,
  WorldTerrain.RoadDirt,
];

/**
 * The world generator behind `newGame({ mapSize })` (plan task 2.1, DECISIONS D-06): creates the
 * main voronoi map of the requested size (seed = game seed), paints it from the `world.gen`
 * stream (biomes, lakes, rivers, forests, stone, mountains, village with roads and plots, iron
 * ore deposit) and spawns the settlement kit. A candidate map is verified with
 * {@link verifyWorld}; an invalid one is replaced by the next draw of the same stream, up to
 * {@link maxWorldAttempts} times, after which the iron ore is connected to the village by carving
 * a path. The result is a pure function of `(seed, size, content terrain ids)`.
 *
 * @param engine - The engine in `NewGame` init; its map registry, store and PRNG are used.
 * @param mapSize - Requested starting map size.
 * @param seed - Game seed, also the voronoi geometry seed.
 * @param maxAttempts - Candidate maps to try before repairing (default {@link maxWorldAttempts}).
 * @returns Ids and layout of the generated world.
 */
export function generateWorld(
  engine: GameEngine,
  mapSize: MapSize,
  seed: number,
  maxAttempts: number = maxWorldAttempts,
): GeneratedWorld {
  for (const terrainId of requiredTerrain) {
    if (!engine.content.terrain.has(terrainId)) {
      throw new WorldGenError(
        WorldGenErrorKind.MissingTerrain,
        `the content pack has no terrain "${terrainId}" which the world generator needs`,
      );
    }
  }
  const stream = engine.prng.stream(worldGenStreamName);
  const map = engine.maps.createMap({
    gridType: GridType.Voronoi,
    terrainId: WorldTerrain.Grassland,
    size: mapSize,
    seed,
    generator: outdoorGeneratorName,
  });
  const { geometry } = map;
  let village: VillageLayout | null = null;
  let oreCells: number[] = [];
  let terrain: string[] = [];
  let attempts = 0;
  let repaired = false;
  let problems: string[] = ["no attempt made"];
  while (attempts < maxAttempts && problems.length > 0) {
    attempts += 1;
    const center = chooseVillageCenter(geometry, stream);
    terrain = generateOutdoorTerrain({ geometry, stream, villageCenter: center });
    village = layoutVillage(geometry, stream, terrain, center);
    oreCells = placeIronOre(geometry, stream, terrain, center, village.clearing);
    map.assignTerrain(terrain);
    problems = verifyWorld(map, village);
  }
  if (village === null || problems.length > 0) {
    const ore = oreCells[0];
    if (village !== null && ore !== undefined) {
      carvePath(geometry, terrain, village.center, ore);
      map.assignTerrain(terrain);
      repaired = true;
      problems = verifyWorld(map, village);
    }
  }
  if (village === null || problems.length > 0) {
    throw new WorldGenError(
      WorldGenErrorKind.GenerationFailed,
      `no valid world after ${attempts} attempts: ${problems.join("; ")}`,
    );
  }
  const spawned = spawnSettlers(engine, map.id, village);
  return {
    mapId: map.id,
    village,
    oreCells,
    attempts,
    repaired,
    jobBoardId: spawned.jobBoardId,
    settlerIds: spawned.settlerIds,
  };
}
