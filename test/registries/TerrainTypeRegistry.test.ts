import { describe, it, expect } from 'vitest';
import { createTerrainTypeRegistry } from '../../src/registries/TerrainTypeRegistry.js';
import { createMaterialRegistry } from '../../src/registries/MaterialRegistry.js';

describe('TerrainTypeRegistry', () => {
  const registry = createTerrainTypeRegistry();
  const materialRegistry = createMaterialRegistry();

  it('loads at least 15 terrain types (FR-010)', () => {
    expect(registry.size).toBeGreaterThanOrEqual(15);
  });

  it('every terrain type has valid traversable and buildable fields', () => {
    for (const terrain of registry.getAll()) {
      expect(terrain.id).toBeTruthy();
      expect(terrain.name).toBeTruthy();
      expect(typeof terrain.traversable).toBe('boolean');
      expect(typeof terrain.buildable).toBe('boolean');
    }
  });

  it('harvestable resources reference valid material IDs', () => {
    for (const terrain of registry.getAll()) {
      if (terrain.harvestableResources) {
        for (const resource of terrain.harvestableResources) {
          expect(
            materialRegistry.has(resource.materialId),
            `Terrain "${terrain.id}" references unknown material "${resource.materialId}"`
          ).toBe(true);
        }
      }
    }
  });

  it('clearResult references valid terrain IDs', () => {
    for (const terrain of registry.getAll()) {
      if (terrain.clearResult) {
        expect(
          registry.has(terrain.clearResult),
          `Terrain "${terrain.id}" clearResult references unknown terrain "${terrain.clearResult}"`
        ).toBe(true);
      }
    }
  });

  it('contains key terrain types', () => {
    expect(registry.has('grassland')).toBe(true);
    expect(registry.has('forest_oak')).toBe(true);
    expect(registry.has('ore_vein')).toBe(true);
    expect(registry.has('water_shallow')).toBe(true);
  });
});
