import type { GameEngine } from "../engine/GameEngine";
import type { AiService } from "./AiService";

const services = new WeakMap<GameEngine, AiService>();

/**
 * Remembers the AI service of an engine (called once by `registerAi`).
 *
 * @param engine - The owning engine.
 * @param service - Its AI service.
 */
export function bindAiService(engine: GameEngine, service: AiService): void {
  services.set(engine, service);
}

/**
 * The AI service of an engine: the place to register need sources and the difficulty hook. The
 * engine registers the AI for itself, so this works for every engine.
 *
 * @param engine - The engine.
 * @returns Its AI service; throws when the AI was never registered.
 */
export function getAiService(engine: GameEngine): AiService {
  const service = services.get(engine);
  if (service === undefined) {
    throw new Error("the AI system is not registered with this engine");
  }
  return service;
}
