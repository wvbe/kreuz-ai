/**
 * Cave generator using cellular automata on a square grid.
 * Produces connected cave systems with flood-fill connectivity check.
 */

import type { PrngState } from "../../engine/Prng.js";
import { nextRandom } from "../../engine/Prng.js";
import { createSquareTileMap, type SquareTileMapData } from "../SquareTileMap.js";
import { TerrainType } from "../TileMap.js";

export type CaveConfig = {
  mapId: string;
  width: number;
  height: number;
  fillPercent: number;
  smoothIterations: number;
  parentMapId?: string;
  entranceCellId?: number;
};

/**
 * Generates a cave map using cellular automata.
 */
export function generateCave(
  config: CaveConfig,
  prng: PrngState,
): { data: SquareTileMapData; prng: PrngState } {
  const { width, height } = config;
  let currentPrng = prng;
  let grid: boolean[] = new Array(width * height).fill(false);

  // Initial random fill
  for (let index = 0; index < grid.length; index++) {
    const { value, prng: next } = nextRandom(currentPrng);
    currentPrng = next;
    // Borders are always walls
    const row = Math.floor(index / width);
    const col = index % width;
    if (row === 0 || row === height - 1 || col === 0 || col === width - 1) {
      grid[index] = false;
    } else {
      grid[index] = value > config.fillPercent;
    }
  }

  // Cellular automata smoothing
  for (let iteration = 0; iteration < config.smoothIterations; iteration++) {
    grid = smoothStep(grid, width, height);
  }

  // Ensure connectivity via flood-fill
  grid = ensureConnectivity(grid, width, height);

  // Create the square tile map
  const data = createSquareTileMap(
    config.mapId,
    width,
    height,
    config.parentMapId,
    config.entranceCellId,
  );

  // Apply cave terrain
  for (let index = 0; index < grid.length; index++) {
    const cell = data.map.cells[index]!;
    if (grid[index]) {
      cell.terrain = TerrainType.Stone;
      cell.walkable = true;
    } else {
      cell.terrain = TerrainType.Mountain;
      cell.walkable = false;
    }
  }

  return { data, prng: currentPrng };
}

function smoothStep(grid: boolean[], width: number, height: number): boolean[] {
  const newGrid = [...grid];
  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const index = row * width + col;
      const wallCount = countWallNeighbors(grid, width, height, col, row);
      newGrid[index] = wallCount < 4;
    }
  }
  return newGrid;
}

function countWallNeighbors(
  grid: boolean[],
  width: number,
  height: number,
  col: number,
  row: number,
): number {
  let count = 0;
  for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
    for (let deltaCol = -1; deltaCol <= 1; deltaCol++) {
      if (deltaRow === 0 && deltaCol === 0) continue;
      const neighborRow = row + deltaRow;
      const neighborCol = col + deltaCol;
      if (neighborRow < 0 || neighborRow >= height || neighborCol < 0 || neighborCol >= width) {
        count++;
      } else if (!grid[neighborRow * width + neighborCol]) {
        count++;
      }
    }
  }
  return count;
}

function ensureConnectivity(grid: boolean[], width: number, height: number): boolean[] {
  const visited = new Set<number>();
  let largestRegion: Set<number> = new Set();

  // Find all connected regions of floor tiles
  for (let index = 0; index < grid.length; index++) {
    if (!grid[index] || visited.has(index)) continue;
    const region = floodFill(grid, width, height, index);
    for (const cell of region) visited.add(cell);
    if (region.size > largestRegion.size) {
      largestRegion = region;
    }
  }

  // Keep only the largest region
  const result = [...grid];
  for (let index = 0; index < result.length; index++) {
    if (result[index] && !largestRegion.has(index)) {
      result[index] = false;
    }
  }
  return result;
}

function floodFill(
  grid: boolean[],
  width: number,
  height: number,
  start: number,
): Set<number> {
  const region = new Set<number>();
  const queue = [start];
  region.add(start);

  while (queue.length > 0) {
    const current = queue.pop()!;
    const row = Math.floor(current / width);
    const col = current % width;
    const neighbors = [
      row > 0 ? (row - 1) * width + col : -1,
      col < width - 1 ? row * width + col + 1 : -1,
      row < height - 1 ? (row + 1) * width + col : -1,
      col > 0 ? row * width + col - 1 : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && grid[neighbor] && !region.has(neighbor)) {
        region.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return region;
}
