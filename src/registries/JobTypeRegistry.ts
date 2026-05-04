import { Registry } from '../engine/Registry.js';
import { JobTypeSchema, type JobType } from '../schemas/jobs.js';
import jobsData from '../data/jobs.json' with { type: 'json' };

export function createJobTypeRegistry(): Registry<JobType> {
  const registry = new Registry<JobType>();

  for (const raw of jobsData) {
    const parsed = JobTypeSchema.parse(raw);
    registry.register(parsed);
  }

  registry.freeze();
  return registry;
}
