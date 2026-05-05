/**
 * Cellar generator using BSP (Binary Space Partition) room subdivision.
 * Creates small square-tile indoor spaces with rooms and connecting doors.
 */

import type { PrngState } from "../../engine/Prng";
import { randomInt } from "../../engine/Prng";
import { createSquareTileMap, addWall, type SquareTileMapData } from "../SquareTileMap";
import { TerrainType } from "../TileMap";

export type CellarConfig = {
  mapId: string;
  width: number;
  height: number;
  minRoomSize: number;
  maxRooms: number;
  parentMapId?: string;
  entranceCellId?: number;
};

type Room = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Generates a cellar map with rooms connected by doors.
 */
export function generateCellar(
  config: CellarConfig,
  prng: PrngState,
): { data: SquareTileMapData; rooms: Room[]; prng: PrngState } {
  let currentPrng = prng;
  const data = createSquareTileMap(
    config.mapId,
    config.width,
    config.height,
    config.parentMapId,
    config.entranceCellId,
  );

  // Start with all cells as walls
  for (const cell of data.map.cells) {
    cell.terrain = TerrainType.Mountain;
    cell.walkable = false;
  }

  // Generate rooms via BSP
  const rooms: Room[] = [];
  const result = generateRooms(config, currentPrng);
  currentPrng = result.prng;

  for (const room of result.rooms) {
    rooms.push(room);
    // Carve room
    for (let row = room.y; row < room.y + room.height; row++) {
      for (let col = room.x; col < room.x + room.width; col++) {
        const cellId = row * config.width + col;
        const cell = data.map.cells[cellId];
        if (cell) {
          cell.terrain = TerrainType.Stone;
          cell.walkable = true;
        }
      }
    }
  }

  // Connect rooms with corridors
  for (let index = 1; index < rooms.length; index++) {
    const prev = rooms[index - 1]!;
    const curr = rooms[index]!;
    carveCorridor(data, prev, curr, config.width);
  }

  return { data, rooms, prng: currentPrng };
}

function generateRooms(
  config: CellarConfig,
  prng: PrngState,
): { rooms: Room[]; prng: PrngState } {
  const rooms: Room[] = [];
  let currentPrng = prng;
  const attempts = config.maxRooms * 3;

  for (let attempt = 0; attempt < attempts && rooms.length < config.maxRooms; attempt++) {
    const { value: roomWidth, prng: p1 } = randomInt(currentPrng, config.minRoomSize, config.minRoomSize + 4);
    currentPrng = p1;
    const { value: roomHeight, prng: p2 } = randomInt(currentPrng, config.minRoomSize, config.minRoomSize + 4);
    currentPrng = p2;
    const { value: roomX, prng: p3 } = randomInt(currentPrng, 1, config.width - roomWidth - 1);
    currentPrng = p3;
    const { value: roomY, prng: p4 } = randomInt(currentPrng, 1, config.height - roomHeight - 1);
    currentPrng = p4;

    const room: Room = { x: roomX, y: roomY, width: roomWidth, height: roomHeight };

    // Check no overlap with existing rooms (with padding)
    const overlaps = rooms.some((existing) => roomsOverlap(room, existing));
    if (!overlaps) {
      rooms.push(room);
    }
  }

  return { rooms, prng: currentPrng };
}

function roomsOverlap(roomA: Room, roomB: Room): boolean {
  return (
    roomA.x < roomB.x + roomB.width + 1 &&
    roomA.x + roomA.width + 1 > roomB.x &&
    roomA.y < roomB.y + roomB.height + 1 &&
    roomA.y + roomA.height + 1 > roomB.y
  );
}

function carveCorridor(data: SquareTileMapData, from: Room, to: Room, mapWidth: number): void {
  const fromCenterX = Math.floor(from.x + from.width / 2);
  const fromCenterY = Math.floor(from.y + from.height / 2);
  const toCenterX = Math.floor(to.x + to.width / 2);
  const toCenterY = Math.floor(to.y + to.height / 2);

  // Horizontal then vertical
  let currentX = fromCenterX;
  let currentY = fromCenterY;

  while (currentX !== toCenterX) {
    const cellId = currentY * mapWidth + currentX;
    const cell = data.map.cells[cellId];
    if (cell) {
      cell.terrain = TerrainType.Stone;
      cell.walkable = true;
    }
    currentX += currentX < toCenterX ? 1 : -1;
  }

  while (currentY !== toCenterY) {
    const cellId = currentY * mapWidth + currentX;
    const cell = data.map.cells[cellId];
    if (cell) {
      cell.terrain = TerrainType.Stone;
      cell.walkable = true;
    }
    currentY += currentY < toCenterY ? 1 : -1;
  }
}
