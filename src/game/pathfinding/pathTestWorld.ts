import { EventBus } from "../engine/EventBus";
import { IdCounters } from "../engine/IdCounters";
import type { GameMap } from "../map/GameMap";
import { MapRegistry } from "../map/MapRegistry";
import { BlockReason, GridType, MoveCostClass } from "../map/mapTypes";
import { TerrainRegistry } from "../map/TerrainRegistry";

/**
 * A map registry with the terrain used by the pathfinding tests.
 */
export type PathTestWorld = {
  maps: MapRegistry;
  terrain: TerrainRegistry;
  bus: EventBus;
};

/**
 * Creates an empty world with `grass` (10), `road` (5), `mud` (25), impassable `river` and a bus.
 *
 * @returns The world.
 */
export function createPathTestWorld(): PathTestWorld {
  const terrain = new TerrainRegistry();
  terrain.registerAll([
    { id: "grass", moveCost: MoveCostClass.Normal, passable: true, blockReason: null },
    { id: "road", moveCost: MoveCostClass.Fastest, passable: true, blockReason: null },
    { id: "mud", moveCost: MoveCostClass.VerySlow, passable: true, blockReason: null },
    { id: "river", moveCost: MoveCostClass.Slow, passable: false, blockReason: BlockReason.Water },
  ]);
  const bus = new EventBus();
  const maps = new MapRegistry({ terrain, counters: new IdCounters(), bus });
  return { maps, terrain, bus };
}

const rowLegend = new Map<string, string>([
  [".", "grass"],
  [",", "road"],
  ["m", "mud"],
  ["~", "river"],
  ["#", BlockReason.Wall],
]);

/**
 * Creates a square map from ASCII rows: `.` grass, `,` road, `m` mud, `~` river, `#` wall
 * (an obstruction on grass).
 *
 * @param world - World to create the map in.
 * @param rows - Equal-length rows.
 * @returns The new map.
 */
export function createAsciiMap(world: PathTestWorld, rows: readonly string[]): GameMap {
  const map = world.maps.createMap({
    gridType: GridType.Square,
    terrainId: "grass",
    width: (rows[0] as string).length,
    height: rows.length,
  });
  rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      const kind = rowLegend.get(glyph) as string;
      const cell = map.squareCell(x, y);
      if (kind === BlockReason.Wall) {
        map.setObstruction(cell, BlockReason.Wall);
      } else {
        map.setTerrain(cell, kind);
      }
    });
  });
  return map;
}

/**
 * Creates a voronoi map of grass.
 *
 * @param world - World to create the map in.
 * @param cellCount - Number of cells.
 * @param seed - Geometry seed.
 * @returns The new map.
 */
export function createVoronoiTestMap(
  world: PathTestWorld,
  cellCount: number,
  seed: number,
): GameMap {
  return world.maps.createMap({
    gridType: GridType.Voronoi,
    terrainId: "grass",
    cellCount,
    seed,
  });
}
