import type { GameEngine } from "../engine/GameEngine";
import type { ZoneService } from "./ZoneService";

const services = new WeakMap<GameEngine, ZoneService>();

/**
 * Remembers the zone service of an engine (called once by `registerZones`).
 *
 * @param engine - The owning engine.
 * @param service - Its zone service.
 */
export function bindZoneService(engine: GameEngine, service: ZoneService): void {
  services.set(engine, service);
}

/**
 * The zone service of an engine: zones, merge offers and the slot-9 evaluation. The engine
 * registers the zones for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its zone service; throws when zones were never registered.
 */
export function getZoneService(engine: GameEngine): ZoneService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the zone system is not registered with this engine");
  }
  return service;
}
