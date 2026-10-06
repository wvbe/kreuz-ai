import type { GameEngine } from "../engine/GameEngine";
import type { DiplomacyService } from "./DiplomacyService";

const services = new WeakMap<GameEngine, DiplomacyService>();

/**
 * Remembers the diplomacy service of an engine (called once by `registerDiplomacy`).
 *
 * @param engine - The owning engine.
 * @param service - Its diplomacy service.
 */
export function bindDiplomacyService(engine: GameEngine, service: DiplomacyService): void {
  services.set(engine, service);
}

/**
 * The diplomacy service of an engine: proposals, NPC act cooldowns and the hostility multiplier.
 * The engine registers diplomacy for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its diplomacy service; throws when the system was never registered.
 */
export function getDiplomacyService(engine: GameEngine): DiplomacyService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the diplomacy system is not registered with this engine");
  }
  return service;
}
