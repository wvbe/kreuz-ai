import { Registry } from '../engine/Registry.js';
import { NeedSchema, type Need } from '../schemas/needs.js';
import needsData from '../data/needs.json' with { type: 'json' };

export function createNeedRegistry(): Registry<Need> {
  const registry = new Registry<Need>();

  for (const raw of needsData) {
    const parsed = NeedSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
