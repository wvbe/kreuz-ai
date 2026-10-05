import type { PrngStream } from "../engine/Prng";
import type { MapRegistry } from "../map/MapRegistry";
import { GridType } from "../map/mapTypes";
import { WorldGenError, WorldGenErrorKind } from "./WorldGenError";
import { WorldTerrain } from "./WorldTerrain";

/**
 * Painted cave: terrain per cell plus the cell where the cave connects to the outside.
 */
export type CaveTerrain = {
  /**
   * One terrain id per cell, `y * width + x`.
   */
  terrain: string[];
  /**
   * Entrance cell: the westernmost (then northernmost) cell of the main cavern.
   */
  entrance: number;
};

/**
 * Options of {@link generateCave}.
 */
export type CaveOptions = {
  /**
   * Parent map the cave hangs off.
   */
  parentId: number;
  /**
   * Traversable cell of the parent map that becomes the cave mouth.
   */
  parentCell: number;
  /**
   * Tiles per row (default 40).
   */
  width?: number;
  /**
   * Tile rows (default 30).
   */
  height?: number;
};

/**
 * Result of {@link generateCave}.
 */
export type GeneratedCave = {
  mapId: number;
  /**
   * Entrance cell inside the cave map; it is linked both ways to the parent cell.
   */
  entranceCell: number;
};

const defaultCaveWidth = 40;
const defaultCaveHeight = 30;
const minCaveSide = 8;
const wallChancePermille = 450;
const smoothingPasses = 4;
const wallNeighborLimit = 5;
const maxCaveAttempts = 8;

function wallAt(walls: readonly boolean[], width: number, height: number, x: number, y: number) {
  return x < 0 || y < 0 || x >= width || y >= height || walls[y * width + x] === true;
}

function smooth(walls: readonly boolean[], width: number, height: number): boolean[] {
  const next: boolean[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((dx !== 0 || dy !== 0) && wallAt(walls, width, height, x + dx, y + dy)) {
            count += 1;
          }
        }
      }
      next.push(count >= wallNeighborLimit);
    }
  }
  return next;
}

function largestCavern(walls: readonly boolean[], width: number, height: number): number[] {
  const seen = new Set<number>();
  let best: number[] = [];
  for (let start = 0; start < walls.length; start += 1) {
    if (walls[start] === true || seen.has(start)) {
      continue;
    }
    const region = [start];
    seen.add(start);
    for (let head = 0; head < region.length; head += 1) {
      const cell = region[head] as number;
      const x = cell % width;
      const y = Math.floor(cell / width);
      const around = [
        x > 0 ? cell - 1 : -1,
        x < width - 1 ? cell + 1 : -1,
        y > 0 ? cell - width : -1,
        y < height - 1 ? cell + width : -1,
      ];
      for (const next of around) {
        if (next >= 0 && walls[next] === false && !seen.has(next)) {
          seen.add(next);
          region.push(next);
        }
      }
    }
    if (region.length > best.length) {
      best = region;
    }
  }
  return best;
}

/**
 * Paints a cave with a cellular automaton (spec 004 cave generator): about 45% random rock, four
 * smoothing passes (a cell is rock with five or more rock neighbours of its eight, outside counts
 * as rock), then only the largest connected cavern is kept as `cave_floor`, everything else is
 * `rock_wall`. Caverns smaller than a quarter of the map are redrawn from the stream (bounded);
 * the last resort carves a corridor through the middle row, so the result always has a cavern
 * and is connected by construction.
 *
 * @param stream - The `world.gen` stream.
 * @param width - Tiles per row, at least 8.
 * @param height - Tile rows, at least 8.
 * @returns Terrain per cell and the entrance cell.
 */
export function generateCaveTerrain(
  stream: PrngStream,
  width: number,
  height: number,
): CaveTerrain {
  if (width < minCaveSide || height < minCaveSide) {
    throw new WorldGenError(
      WorldGenErrorKind.InvalidOptions,
      `a cave needs at least ${minCaveSide}x${minCaveSide} tiles, got ${width}x${height}`,
    );
  }
  let cavern: number[] = [];
  for (let attempt = 0; attempt < maxCaveAttempts; attempt += 1) {
    let walls: boolean[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        walls.push(border || stream.chancePermille(wallChancePermille));
      }
    }
    for (let pass = 0; pass < smoothingPasses; pass += 1) {
      walls = smooth(walls, width, height);
    }
    cavern = largestCavern(walls, width, height);
    if (cavern.length * 4 >= width * height) {
      break;
    }
  }
  if (cavern.length * 4 < width * height) {
    const middle = Math.floor(height / 2);
    cavern = [];
    for (let x = 1; x < width - 1; x += 1) {
      cavern.push(middle * width + x);
    }
  }
  const terrain: string[] = new Array<string>(width * height).fill(WorldTerrain.RockWall);
  for (const cell of cavern) {
    terrain[cell] = WorldTerrain.CaveFloor;
  }
  const entrance = [...cavern].sort(
    (left, right) =>
      (left % width) - (right % width) || Math.floor(left / width) - Math.floor(right / width),
  )[0] as number;
  return { terrain, entrance };
}

/**
 * Creates a cave sub-map under `parentId` and links its entrance both ways to a cell of the
 * parent (so `MapRegistry.travel` works in both directions).
 *
 * @param maps - The map registry.
 * @param stream - The `world.gen` stream.
 * @param options - Parent map and cell, optional size.
 * @returns The new map id and its entrance cell.
 */
export function generateCave(
  maps: MapRegistry,
  stream: PrngStream,
  options: CaveOptions,
): GeneratedCave {
  const parent = maps.require(options.parentId);
  if (!parent.isTraversable(options.parentCell)) {
    throw new WorldGenError(
      WorldGenErrorKind.InvalidOptions,
      `cell ${options.parentCell} of map ${parent.id} is not traversable, so it cannot be a cave mouth`,
    );
  }
  const width = options.width ?? defaultCaveWidth;
  const height = options.height ?? defaultCaveHeight;
  const seed = stream.nextU32();
  const cave = generateCaveTerrain(stream, width, height);
  const map = maps.createMap({
    gridType: GridType.Square,
    terrainId: WorldTerrain.RockWall,
    width,
    height,
    seed,
    generator: "cave",
    parentId: parent.id,
  });
  map.assignTerrain(cave.terrain);
  maps.linkMaps({
    mapId: parent.id,
    cell: options.parentCell,
    targetMapId: map.id,
    targetCell: cave.entrance,
    bidirectional: true,
  });
  return { mapId: map.id, entranceCell: cave.entrance };
}
