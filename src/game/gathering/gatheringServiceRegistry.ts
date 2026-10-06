import type { GameEngine } from "../engine/GameEngine";
import type { GatheringService } from "./GatheringService";

const services = new WeakMap<GameEngine, GatheringService>();

/**
 * Remembers the gathering service of an engine (called once by `registerGathering`).
 *
 * @param engine - The owning engine.
 * @param service - Its gathering service.
 */
export function bindGatheringService(engine: GameEngine, service: GatheringService): void {
  services.set(engine, service);
}

/**
 * The gathering service of an engine: crop plots and deposit charges. The engine registers
 * gathering for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its gathering service; throws when gathering was never registered.
 */
export function getGatheringService(engine: GameEngine): GatheringService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the gathering system is not registered with this engine");
  }
  return service;
}
