import type { GameEngine } from "../engine/GameEngine";
import type { StatusService } from "./StatusService";

const services = new WeakMap<GameEngine, StatusService>();

/**
 * Remembers the status service of an engine (called once by `registerStatus`).
 *
 * @param engine - The owning engine.
 * @param service - Its status service.
 */
export function bindStatusService(engine: GameEngine, service: StatusService): void {
  services.set(engine, service);
}

/**
 * The status service of an engine: the place to register status providers and to reach the flow
 * ledger. The engine registers the status system for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its status service; throws when the status system was never registered.
 */
export function getStatusService(engine: GameEngine): StatusService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the status system is not registered with this engine");
  }
  return service;
}
