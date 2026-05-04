import { describe, it, expect } from 'vitest';
import { createTraitRegistry } from '../../src/registries/TraitRegistry.js';

describe('TraitRegistry', () => {
  const registry = createTraitRegistry();

  it('loads all traits without errors', () => {
    expect(registry.size).toBeGreaterThanOrEqual(24);
  });

  it('contains skill aptitude traits', () => {
    const trait = registry.get('born_baker');
    expect(trait.name).toBe('Born Baker');
    expect(trait.modifiers[0].type).toBe('skillAptitude');
  });

  it('contains performance modifier traits', () => {
    const trait = registry.get('strong');
    expect(trait.name).toBe('Strong');
    expect(trait.modifiers.every(m => m.type === 'performanceModifier')).toBe(true);
  });

  it('contains need modifier traits', () => {
    const trait = registry.get('tireless');
    expect(trait.name).toBe('Tireless');
    expect(trait.modifiers[0].type).toBe('needModifier');
  });

  it('has no duplicate IDs', () => {
    const all = registry.getAll();
    const ids = all.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all skill aptitude modifiers reference valid skill IDs', () => {
    const validSkills = [
      'farming', 'mining', 'woodcutting', 'masonry', 'smithing', 'carpentry',
      'weaving', 'tailoring', 'leatherworking', 'baking', 'brewing', 'cooking',
      'fishing', 'herbalism', 'animal_husbandry', 'trading', 'combat',
      'construction', 'hauling', 'preaching', 'glassblowing',
    ];
    for (const trait of registry.getAll()) {
      for (const mod of trait.modifiers) {
        if (mod.type === 'skillAptitude') {
          expect(validSkills).toContain(mod.skillId);
        }
      }
    }
  });

  it('all need modifier traits reference valid need IDs', () => {
    const validNeeds = ['hunger', 'rest', 'safety', 'social', 'comfort', 'faith'];
    for (const trait of registry.getAll()) {
      for (const mod of trait.modifiers) {
        if (mod.type === 'needModifier') {
          expect(validNeeds).toContain(mod.needId);
        }
      }
    }
  });
});
