import type { PrngStream } from "../engine/Prng";
import type { MapRegistry } from "../map/MapRegistry";
import { GridType } from "../map/mapTypes";
import { WorldGenError, WorldGenErrorKind } from "./WorldGenError";
import { WorldTerrain } from "./WorldTerrain";

/**
 * A rectangular room of a cellar, in tiles.
 */
export type CellarRoom = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Painted cellar: terrain, the rooms in connection order and the stairs cell.
 */
export type CellarTerrain = {
  /**
   * One terrain id per cell, `y * width + x`.
   */
  terrain: string[];
  rooms: CellarRoom[];
  /**
   * Entrance cell: the center of the first room.
   */
  entrance: number;
};

/**
 * Options of {@link generateCellar}.
 */
export type CellarOptions = {
  /**
   * Parent map above the cellar.
   */
  parentId: number;
  /**
   * Traversable cell of the parent map where the stairs come out.
   */
  parentCell: number;
  /**
   * Tiles per row (default 20).
   */
  width?: number;
  /**
   * Tile rows (default 14).
   */
  height?: number;
};

/**
 * Result of {@link generateCellar}.
 */
export type GeneratedCellar = {
  mapId: number;
  /**
   * Stairs cell inside the cellar; linked both ways to the parent cell.
   */
  entranceCell: number;
  roomCount: number;
};

const defaultCellarWidth = 20;
const defaultCellarHeight = 14;
const minCellarWidth = 12;
const minCellarHeight = 10;
const roomPlacementTries = 40;

function overlaps(candidate: CellarRoom, other: CellarRoom): boolean {
  return (
    candidate.left < other.left + other.width + 1 &&
    other.left < candidate.left + candidate.width + 1 &&
    candidate.top < other.top + other.height + 1 &&
    other.top < candidate.top + candidate.height + 1
  );
}

function centerOf(room: CellarRoom): { x: number; y: number } {
  return {
    x: room.left + Math.floor(room.width / 2),
    y: room.top + Math.floor(room.height / 2),
  };
}

/**
 * Paints a cellar (spec 004 cellar generator): three to five non-overlapping rooms on rock, each
 * joined to the next with an L-shaped corridor, floors of `floor_wood`. Rooms are connected by
 * construction, so every floor cell is reachable from the stairs. Placement uses at most 40
 * random tries per room; the first two rooms fall back to fixed rectangles so a cellar always
 * has at least two rooms.
 *
 * @param stream - The `world.gen` stream.
 * @param width - Tiles per row, at least 12.
 * @param height - Tile rows, at least 10.
 * @returns Terrain, rooms and the entrance cell.
 */
export function generateCellarTerrain(
  stream: PrngStream,
  width: number,
  height: number,
): CellarTerrain {
  if (width < minCellarWidth || height < minCellarHeight) {
    throw new WorldGenError(
      WorldGenErrorKind.InvalidOptions,
      `a cellar needs at least ${minCellarWidth}x${minCellarHeight} tiles, got ${width}x${height}`,
    );
  }
  const target = 3 + stream.nextInt(0, 2);
  const rooms: CellarRoom[] = [];
  for (let room = 0; room < target; room += 1) {
    for (let attempt = 0; attempt < roomPlacementTries; attempt += 1) {
      const roomWidth = stream.nextInt(3, 5);
      const roomHeight = stream.nextInt(3, 4);
      const candidate: CellarRoom = {
        left: stream.nextInt(1, width - roomWidth - 1),
        top: stream.nextInt(1, height - roomHeight - 1),
        width: roomWidth,
        height: roomHeight,
      };
      if (!rooms.some((existing) => overlaps(candidate, existing))) {
        rooms.push(candidate);
        break;
      }
    }
  }
  if (rooms.length < 2) {
    rooms.length = 0;
    rooms.push(
      { left: 1, top: 1, width: 4, height: 3 },
      { left: width - 6, top: height - 5, width: 5, height: 4 },
    );
  }
  const terrain: string[] = new Array<string>(width * height).fill(WorldTerrain.RockWall);
  const carve = (x: number, y: number): void => {
    terrain[y * width + x] = WorldTerrain.FloorWood;
  };
  for (const room of rooms) {
    for (let y = room.top; y < room.top + room.height; y += 1) {
      for (let x = room.left; x < room.left + room.width; x += 1) {
        carve(x, y);
      }
    }
  }
  for (let index = 1; index < rooms.length; index += 1) {
    const from = centerOf(rooms[index - 1] as CellarRoom);
    const goal = centerOf(rooms[index] as CellarRoom);
    const stepX = goal.x >= from.x ? 1 : -1;
    for (let x = from.x; x !== goal.x; x += stepX) {
      carve(x, from.y);
    }
    const stepY = goal.y >= from.y ? 1 : -1;
    for (let y = from.y; y !== goal.y; y += stepY) {
      carve(goal.x, y);
    }
    carve(goal.x, goal.y);
  }
  const first = centerOf(rooms[0] as CellarRoom);
  return { terrain, rooms, entrance: first.y * width + first.x };
}

/**
 * Creates a cellar sub-map under `parentId` and links its stairs both ways to a cell of the
 * parent.
 *
 * @param maps - The map registry.
 * @param stream - The `world.gen` stream.
 * @param options - Parent map and cell, optional size.
 * @returns The new map id, its entrance cell and the room count.
 */
export function generateCellar(
  maps: MapRegistry,
  stream: PrngStream,
  options: CellarOptions,
): GeneratedCellar {
  const parent = maps.require(options.parentId);
  if (!parent.isTraversable(options.parentCell)) {
    throw new WorldGenError(
      WorldGenErrorKind.InvalidOptions,
      `cell ${options.parentCell} of map ${parent.id} is not traversable, so it cannot hold cellar stairs`,
    );
  }
  const width = options.width ?? defaultCellarWidth;
  const height = options.height ?? defaultCellarHeight;
  const seed = stream.nextU32();
  const cellar = generateCellarTerrain(stream, width, height);
  const map = maps.createMap({
    gridType: GridType.Square,
    terrainId: WorldTerrain.RockWall,
    width,
    height,
    seed,
    generator: "cellar",
    parentId: parent.id,
  });
  map.assignTerrain(cellar.terrain);
  maps.linkMaps({
    mapId: parent.id,
    cell: options.parentCell,
    targetMapId: map.id,
    targetCell: cellar.entrance,
    bidirectional: true,
  });
  return { mapId: map.id, entranceCell: cellar.entrance, roomCount: cellar.rooms.length };
}
