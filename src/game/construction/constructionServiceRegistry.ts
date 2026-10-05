import type { GameEngine } from "../engine/GameEngine";
import type { ConstructionService } from "./ConstructionService";

const services = new WeakMap<GameEngine, ConstructionService>();

/**
 * Remembers the construction service of an engine (called once by `registerConstruction`).
 *
 * @param engine - The owning engine.
 * @param service - Its construction service.
 */
export function bindConstructionService(engine: GameEngine, service: ConstructionService): void {
  services.set(engine, service);
}

/**
 * The construction service of an engine: the recently finished jobs. The engine registers
 * construction for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its construction service; throws when construction was never registered.
 */
export function getConstructionService(engine: GameEngine): ConstructionService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the construction system is not registered with this engine");
  }
  return service;
}
