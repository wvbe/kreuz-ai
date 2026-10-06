import type { GameEngine } from "../engine/GameEngine";
import type { TreasuryService } from "./TreasuryService";

const services = new WeakMap<GameEngine, TreasuryService>();

/**
 * Remembers the treasury service of an engine (called once by `registerTrade`).
 *
 * @param engine - The owning engine.
 * @param service - Its treasury service.
 */
export function bindTreasuryService(engine: GameEngine, service: TreasuryService): void {
  services.set(engine, service);
}

/**
 * The treasury service of an engine: the queued wages. The engine registers trade for itself, so
 * this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its treasury service; throws when trade was never registered.
 */
export function getTreasuryService(engine: GameEngine): TreasuryService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the treasury system is not registered with this engine");
  }
  return service;
}
