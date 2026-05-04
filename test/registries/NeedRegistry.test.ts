import { describe, it, expect } from 'vitest';
import { createNeedRegistry } from '../../src/registries/NeedRegistry.js';

describe('NeedRegistry', () => {
  const registry = createNeedRegistry();

  it('loads exactly 6 needs (FR-008)', () => {
    expect(registry.size).toBe(6);
  });

  it('contains all required needs', () => {
    expect(registry.has('hunger')).toBe(true);
    expect(registry.has('rest')).toBe(true);
    expect(registry.has('safety')).toBe(true);
    expect(registry.has('social')).toBe(true);
    expect(registry.has('comfort')).toBe(true);
    expect(registry.has('faith')).toBe(true);
  });

  it('every need has valid decay and threshold', () => {
    for (const need of registry.getAll()) {
      expect(need.decayPerTick).toBeGreaterThan(0);
      expect(need.criticalThreshold).toBeGreaterThan(0);
      expect(need.criticalThreshold).toBeLessThanOrEqual(1);
    }
  });

  it('every need has at least one satisfaction method', () => {
    for (const need of registry.getAll()) {
      expect(need.satisfactionMethods.length).toBeGreaterThanOrEqual(1);
    }
  });
});
