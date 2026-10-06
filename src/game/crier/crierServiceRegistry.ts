import type { GameEngine } from "../engine/GameEngine";
import type { CrierService } from "./CrierService";

const services = new WeakMap<GameEngine, CrierService>();

/**
 * Remembers the crier service of an engine (called once by `registerCrier`).
 *
 * @param engine - The owning engine.
 * @param service - Its crier service.
 */
export function bindCrierService(engine: GameEngine, service: CrierService): void {
  services.set(engine, service);
}

/**
 * The crier service of an engine: the pending board updates. The engine registers the Town
 * Crier system for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its crier service; throws when the system was never registered.
 */
export function getCrierService(engine: GameEngine): CrierService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the Town Crier system is not registered with this engine");
  }
  return service;
}
