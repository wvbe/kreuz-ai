import type { GameEngine } from "../engine/GameEngine";
import type { JobService } from "./JobService";

const services = new WeakMap<GameEngine, JobService>();

/**
 * Remembers the job service of an engine (called once by `registerJobs`).
 *
 * @param engine - The owning engine.
 * @param service - Its job service.
 */
export function bindJobService(engine: GameEngine, service: JobService): void {
  services.set(engine, service);
}

/**
 * The job service of an engine: the place to set the wage payer and the tier source. The engine
 * registers the job boards for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its job service; throws when the job system was never registered.
 */
export function getJobService(engine: GameEngine): JobService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the job board system is not registered with this engine");
  }
  return service;
}
