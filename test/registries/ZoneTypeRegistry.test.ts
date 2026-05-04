import { describe, it, expect } from 'vitest';
import { createZoneTypeRegistry } from '../../src/registries/ZoneTypeRegistry.js';

describe('ZoneTypeRegistry', () => {
  const registry = createZoneTypeRegistry();

  it('loads at least 25 zone types', () => {
    expect(registry.size).toBeGreaterThanOrEqual(25);
  });

  it('contains production zones', () => {
    const bakery = registry.get('bakery');
    expect(bakery.name).toBe('Bakery');
    expect(bakery.requiresRoom).toBe(true);
    expect(bakery.minTiles).toBe(6);
  });

  it('contains open-air zones', () => {
    const farm = registry.get('farm_field');
    expect(farm.name).toBe('Farm Field');
    expect(farm.requiresRoom).toBe(false);
  });

  it('contains religious zones', () => {
    const chapel = registry.get('chapel');
    expect(chapel.name).toBe('Chapel');
    expect(chapel.requiresRoom).toBe(true);
    expect(chapel.effects.length).toBeGreaterThan(0);
  });

  it('no two zone types share identical ID', () => {
    const all = registry.getAll();
    const ids = all.map(z => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all furniture requirements have valid structure', () => {
    for (const zone of registry.getAll()) {
      for (const req of zone.furnitureRequirements) {
        expect(req.count).toBeGreaterThanOrEqual(1);
        expect(req.furnitureId || req.furnitureTag).toBeTruthy();
      }
    }
  });

  it('has production, storage, living, religious, military, and open-air zones', () => {
    expect(registry.has('bakery')).toBe(true);       // production
    expect(registry.has('pantry')).toBe(true);       // storage
    expect(registry.has('bedroom')).toBe(true);      // living
    expect(registry.has('chapel')).toBe(true);       // religious
    expect(registry.has('guard_post')).toBe(true);   // military
    expect(registry.has('farm_field')).toBe(true);   // open-air
  });
});
