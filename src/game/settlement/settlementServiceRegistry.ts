import type { GameEngine } from "../engine/GameEngine";
import type { SettlementService } from "./SettlementService";

const services = new WeakMap<GameEngine, SettlementService>();

/**
 * Remembers the settlement service of an engine (called once by `registerSettlement`).
 *
 * @param engine - The owning engine.
 * @param service - Its settlement service.
 */
export function bindSettlementService(engine: GameEngine, service: SettlementService): void {
  services.set(engine, service);
}

/**
 * The settlement service of an engine: the tier in force and the dwelling counter hook. The engine
 * registers the settlement system for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its settlement service; throws when the system was never registered.
 */
export function getSettlementService(engine: GameEngine): SettlementService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the settlement system is not registered with this engine");
  }
  return service;
}
