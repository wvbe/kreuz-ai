import type { GameEngine } from "../engine/GameEngine";
import type { StorageService } from "./StorageService";

const services = new WeakMap<GameEngine, StorageService>();

/**
 * Remembers the storage service of an engine (called once by `registerStorage`).
 *
 * @param engine - The owning engine.
 * @param service - Its storage service.
 */
export function bindStorageService(engine: GameEngine, service: StorageService): void {
  services.set(engine, service);
}

/**
 * The storage service of an engine: reservations, the decay modifier hook and the
 * no-destination marks. The engine registers storage for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its storage service; throws when storage was never registered.
 */
export function getStorageService(engine: GameEngine): StorageService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the storage system is not registered with this engine");
  }
  return service;
}
