import { describe, it, expect } from 'vitest';
import { createMaterialRegistry } from '../../src/registries/MaterialRegistry.js';

describe('MaterialRegistry', () => {
  const registry = createMaterialRegistry();

  it('loads at least 70 materials (FR-001)', () => {
    expect(registry.size).toBeGreaterThanOrEqual(70);
  });

  it('has no duplicate IDs (all entries loaded successfully)', () => {
    const ids = registry.getAll().map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every material has valid required fields', () => {
    for (const material of registry.getAll()) {
      expect(material.id).toBeTruthy();
      expect(material.name).toBeTruthy();
      expect(material.categories.length).toBeGreaterThan(0);
      expect(material.stackLimit).toBeGreaterThanOrEqual(1);
      expect(material.weight).toBeGreaterThanOrEqual(1);
      expect(material.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('perishable materials have valid perishTicks', () => {
    const perishable = registry.filter((m) => m.perishable);
    expect(perishable.length).toBeGreaterThan(0);
    for (const material of perishable) {
      expect(material.perishTicks).toBeDefined();
      expect(material.perishTicks!).toBeGreaterThan(0);
    }
  });

  it('contains food category materials (at least 15)', () => {
    const food = registry.filter((m) => m.categories.includes('food'));
    expect(food.length).toBeGreaterThanOrEqual(15);
  });

  it('contains the Silver Penny currency', () => {
    const penny = registry.get('silver_penny');
    expect(penny.categories).toContain('currency');
    expect(penny.stackLimit).toBe(1000);
  });
});
