import type { GameEngine } from "../engine/GameEngine";
import type { HousingService } from "./HousingService";

const services = new WeakMap<GameEngine, HousingService>();

/**
 * Remembers the housing service of an engine (called once by `registerHousing`).
 *
 * @param engine - The owning engine.
 * @param service - Its housing service.
 */
export function bindHousingService(engine: GameEngine, service: HousingService): void {
  services.set(engine, service);
}

/**
 * The housing service of an engine: the findings of the last daily evaluation. The engine
 * registers housing for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its housing service; throws when the system was never registered.
 */
export function getHousingService(engine: GameEngine): HousingService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the housing system is not registered with this engine");
  }
  return service;
}
