/**
 * Voronoi outdoor map generator.
 * Generates the main world map with biomes based on elevation and moisture.
 * Uses Lloyd relaxation for natural cell distribution.
 */

import type { PrngState } from "../../engine/Prng";
import { randomFloat, randomInt } from "../../engine/Prng";
import { createVoronoiTileMap } from "../VoronoiTileMap";
import type { TileMap } from "../TileMap";
import { TerrainType } from "../TileMap";

export type OutdoorGeneratorConfig = {
  mapId: string;
  cellCount: number;
  width: number;
  height: number;
  waterLevel: number;
  mountainLevel: number;
};

/**
 * Generates an outdoor voronoi map with terrain assignment based on elevation and moisture.
 */
export function generateOutdoorMap(
  config: OutdoorGeneratorConfig,
  prng: PrngState,
): { map: TileMap; prng: PrngState } {
  const { map, prng: afterMap } = createVoronoiTileMap(
    config.mapId,
    config.cellCount,
    config.width,
    config.height,
    prng,
  );

  let currentPrng = afterMap;

  // Assign elevation using gradient noise approximation
  for (const cell of map.cells) {
    const { value: elevation, prng: next1 } = randomFloat(currentPrng, 0, 1);
    currentPrng = next1;
    const { value: moisture, prng: next2 } = randomFloat(currentPrng, 0, 1);
    currentPrng = next2;

    // Distance from center affects elevation (island shape)
    const centerDistX = (cell.centerX / config.width - 0.5) * 2;
    const centerDistY = (cell.centerY / config.height - 0.5) * 2;
    const centerDist = Math.sqrt(centerDistX * centerDistX + centerDistY * centerDistY);
    const elevationMod = Math.max(0, elevation - centerDist * 0.3);

    cell.elevation = elevationMod;
    cell.moisture = moisture;
    cell.terrain = assignTerrain(elevationMod, moisture, config);
    cell.walkable = cell.terrain !== TerrainType.DeepWater && cell.terrain !== TerrainType.Mountain;
  }

  // Smooth terrain: ensure no isolated single-cell terrain patches
  smoothTerrain(map);

  return { map, prng: currentPrng };
}

/**
 * Assigns terrain type based on elevation and moisture.
 */
function assignTerrain(
  elevation: number,
  moisture: number,
  config: OutdoorGeneratorConfig,
): TerrainType {
  if (elevation < config.waterLevel * 0.5) return TerrainType.DeepWater;
  if (elevation < config.waterLevel) return TerrainType.Water;
  if (elevation > config.mountainLevel) return TerrainType.Mountain;
  if (elevation > config.mountainLevel * 0.8) return TerrainType.Hills;

  if (elevation > config.mountainLevel * 0.6) {
    return moisture > 0.5 ? TerrainType.Forest : TerrainType.Hills;
  }

  if (moisture < 0.2) return TerrainType.Desert;
  if (moisture < 0.4) return TerrainType.Grassland;
  if (moisture < 0.6) return TerrainType.Farmland;
  if (moisture < 0.8) return TerrainType.Forest;
  return TerrainType.Marsh;
}

/**
 * Smooth terrain to reduce isolated patches.
 */
function smoothTerrain(map: TileMap): void {
  for (const cell of map.cells) {
    const neighbors = cell.adjacentCells
      .map((id) => map.cells[id])
      .filter((neighbor): neighbor is NonNullable<typeof neighbor> => neighbor !== undefined);
    if (neighbors.length < 3) continue;

    // If surrounded by same terrain, adopt it
    const terrainCounts = new Map<TerrainType, number>();
    for (const neighbor of neighbors) {
      terrainCounts.set(neighbor.terrain, (terrainCounts.get(neighbor.terrain) ?? 0) + 1);
    }
    const dominant = [...terrainCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[1] >= neighbors.length * 0.7 && dominant[0] !== cell.terrain) {
      // Keep water/mountain boundaries sharp
      if (cell.terrain === TerrainType.Water || cell.terrain === TerrainType.DeepWater) continue;
      if (dominant[0] === TerrainType.Water || dominant[0] === TerrainType.DeepWater) continue;
      cell.terrain = dominant[0];
    }
  }
}
