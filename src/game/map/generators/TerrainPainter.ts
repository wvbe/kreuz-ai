/**
 * Terrain painter: assigns terrain types to cells based on elevation and moisture.
 * Used as a post-processing step after map generation.
 */

import type { TileMap } from "../TileMap";
import { TerrainType } from "../TileMap";

export type BiomeConfig = {
  elevationThresholds: { water: number; mountain: number };
  moistureZones: Array<{ maxMoisture: number; terrain: TerrainType }>;
};

export const defaultBiomeConfig: BiomeConfig = {
  elevationThresholds: { water: 0.25, mountain: 0.75 },
  moistureZones: [
    { maxMoisture: 0.2, terrain: TerrainType.Desert },
    { maxMoisture: 0.4, terrain: TerrainType.Grassland },
    { maxMoisture: 0.6, terrain: TerrainType.Farmland },
    { maxMoisture: 0.8, terrain: TerrainType.Forest },
    { maxMoisture: 1.0, terrain: TerrainType.Marsh },
  ],
};

/**
 * Paints terrain on all cells based on their elevation and moisture values.
 */
export function paintTerrain(map: TileMap, config: BiomeConfig = defaultBiomeConfig): void {
  for (const cell of map.cells) {
    if (cell.elevation < config.elevationThresholds.water * 0.5) {
      cell.terrain = TerrainType.DeepWater;
      cell.walkable = false;
    } else if (cell.elevation < config.elevationThresholds.water) {
      cell.terrain = TerrainType.Water;
      cell.walkable = false;
    } else if (cell.elevation > config.elevationThresholds.mountain) {
      cell.terrain = TerrainType.Mountain;
      cell.walkable = false;
    } else if (cell.elevation > config.elevationThresholds.mountain * 0.85) {
      cell.terrain = TerrainType.Snow;
      cell.walkable = true;
    } else if (cell.elevation > config.elevationThresholds.mountain * 0.7) {
      cell.terrain = TerrainType.Hills;
      cell.walkable = true;
    } else {
      // Assign by moisture zone
      for (const zone of config.moistureZones) {
        if (cell.moisture <= zone.maxMoisture) {
          cell.terrain = zone.terrain;
          break;
        }
      }
      cell.walkable = true;
    }
  }
}
