import { describe, it, expect } from 'vitest';
import { createSkillRegistry } from '../../src/registries/SkillRegistry.js';

describe('SkillRegistry', () => {
  const registry = createSkillRegistry();

  it('loads at least 20 skills (FR-006)', () => {
    expect(registry.size).toBeGreaterThanOrEqual(20);
  });

  it('every skill has valid growth parameters', () => {
    for (const skill of registry.getAll()) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.baseGrowthPerCompletion).toBeGreaterThan(0);
      expect(skill.diminishingReturnsThreshold).toBeGreaterThanOrEqual(0);
      expect(skill.diminishingReturnsThreshold).toBeLessThanOrEqual(100);
      expect(skill.diminishingReturnsFactor).toBeGreaterThanOrEqual(0);
      expect(skill.diminishingReturnsFactor).toBeLessThanOrEqual(1);
    }
  });

  it('every skill has at least one outcome effect', () => {
    for (const skill of registry.getAll()) {
      expect(skill.outcomeEffects.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('contains key skills (smithing, farming, combat)', () => {
    expect(registry.has('smithing')).toBe(true);
    expect(registry.has('farming')).toBe(true);
    expect(registry.has('combat')).toBe(true);
  });
});
