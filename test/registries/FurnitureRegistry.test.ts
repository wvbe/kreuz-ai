import { describe, it, expect } from 'vitest';
import { createFurnitureRegistry } from '../../src/registries/FurnitureRegistry.js';

describe('FurnitureRegistry', () => {
  const registry = createFurnitureRegistry();

  it('loads at least 50 furniture entries', () => {
    expect(registry.size).toBeGreaterThanOrEqual(50);
  });

  it('contains workstation furniture', () => {
    const anvil = registry.get('anvil');
    expect(anvil.name).toBe('Anvil');
    expect(anvil.categories).toContain('workstation');
    expect(anvil.hasInventory).toBe(true);
  });

  it('contains storage furniture', () => {
    const chest = registry.get('chest');
    expect(chest.name).toBe('Chest');
    expect(chest.categories).toContain('storage');
    expect(chest.inventorySlots).toBe(12);
  });

  it('contains comfort furniture', () => {
    const bed = registry.get('wooden_bed');
    expect(bed.name).toBe('Wooden Bed');
    expect(bed.categories).toContain('bed');
  });

  it('contains religious furniture', () => {
    const altar = registry.get('altar');
    expect(altar.name).toBe('Altar');
    expect(altar.categories).toContain('religious');
  });

  it('all furniture with hasInventory=true have inventorySlots and inventoryWeightLimit', () => {
    for (const f of registry.getAll()) {
      if (f.hasInventory) {
        expect(f.inventorySlots).toBeGreaterThan(0);
        expect(f.inventoryWeightLimit).toBeGreaterThan(0);
      }
    }
  });

  it('all construction costs reference valid material IDs', () => {
    // Verify no empty material IDs
    for (const f of registry.getAll()) {
      for (const cost of f.constructionCost) {
        expect(cost.materialId.length).toBeGreaterThan(0);
        expect(cost.quantity).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('has no duplicate IDs', () => {
    const all = registry.getAll();
    const ids = all.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
