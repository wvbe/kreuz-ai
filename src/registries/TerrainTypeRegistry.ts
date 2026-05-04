import { Registry } from "../engine/Registry.js";
import { TerrainTypeSchema, type TerrainType } from "../schemas/terrain.js";
import terrainData from "../data/terrain.json" with { type: "json" };

export function createTerrainTypeRegistry(): Registry<TerrainType> {
  const registry = new Registry<TerrainType>();

  for (const raw of terrainData) {
    const parsed = TerrainTypeSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
