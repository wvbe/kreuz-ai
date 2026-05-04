import { Registry } from '../engine/Registry.js';
import { SkillSchema, type Skill } from '../schemas/skills.js';
import skillsData from '../data/skills.json' with { type: 'json' };

export function createSkillRegistry(): Registry<Skill> {
  const registry = new Registry<Skill>();

  for (const raw of skillsData) {
    const parsed = SkillSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
