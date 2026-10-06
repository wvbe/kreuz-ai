import type { GameEngine } from "../engine/GameEngine";
import type { TradeService } from "./TradeService";

const services = new WeakMap<GameEngine, TradeService>();

/**
 * Remembers the trade service of an engine (called once by `registerTrade`).
 *
 * @param engine - The owning engine.
 * @param service - Its trade service.
 */
export function bindTradeService(engine: GameEngine, service: TradeService): void {
  services.set(engine, service);
}

/**
 * The trade service of an engine: offers, orders, the refined-credit ledger and the visit
 * schedule. The engine registers trade for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its trade service; throws when trade was never registered.
 */
export function getTradeService(engine: GameEngine): TradeService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the trade system is not registered with this engine");
  }
  return service;
}
