import { describe, it, expect } from 'vitest';
import { createJobTypeRegistry } from '../../src/registries/JobTypeRegistry.js';

describe('JobTypeRegistry', () => {
  const registry = createJobTypeRegistry();

  it('loads at least 20 job types', () => {
    expect(registry.size).toBeGreaterThanOrEqual(20);
  });

  it('contains farming jobs', () => {
    const sow = registry.get('farm.sow');
    expect(sow.name).toBe('Sow Crops');
    expect(sow.skillDomain).toBe('farming');
    expect(sow.toolRequired).toBe('hoe');
  });

  it('contains combat jobs', () => {
    const patrol = registry.get('guard.patrol');
    expect(patrol.name).toBe('Patrol Area');
    expect(patrol.skillDomain).toBe('combat');
    expect(patrol.zoneContext).toBe('guard_post');
  });

  it('contains crafting job', () => {
    const craft = registry.get('craft.produce');
    expect(craft.name).toBe('Craft / Produce');
    expect(craft.recurrence).toBe('recurring');
  });

  it('all jobs have valid recurrence', () => {
    for (const job of registry.getAll()) {
      expect(['one-time', 'recurring']).toContain(job.recurrence);
    }
  });

  it('terrain-based jobs (mine.ore, fell.trees) have no zoneContext', () => {
    const mine = registry.get('mine.ore');
    expect(mine.zoneContext).toBeUndefined();
    const fell = registry.get('fell.trees');
    expect(fell.zoneContext).toBeUndefined();
  });

  it('has no duplicate IDs', () => {
    const all = registry.getAll();
    const ids = all.map(j => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
