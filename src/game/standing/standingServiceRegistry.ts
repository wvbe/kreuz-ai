import type { GameEngine } from "../engine/GameEngine";
import type { StandingService } from "./StandingService";

const services = new WeakMap<GameEngine, StandingService>();

/**
 * Remembers the standing-order service of an engine (called once by `registerStanding`).
 *
 * @param engine - The owning engine.
 * @param service - Its standing-order service.
 */
export function bindStandingService(engine: GameEngine, service: StandingService): void {
  services.set(engine, service);
}

/**
 * The standing-order service of an engine: orders, owned runs and the Steward. The engine
 * registers the system for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its service; throws when the system was never registered.
 */
export function getStandingService(engine: GameEngine): StandingService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the standing-order system is not registered with this engine");
  }
  return service;
}
