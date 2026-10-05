import { loadContent } from "../../content/ContentLoader";
import type { ContentRegistries } from "../../content/ContentRegistries";
import { GameSession } from "../GameSession";
import { createDebugSpawnSystem } from "./createDebugSpawnSystem";

/**
 * Builds the session scenarios and tests run on: an ordinary `GameSession` plus the debug-only
 * command `DebugSpawn` (the scenario step `debugSpawn`). `runScenario` uses it by default, so a
 * scenario file can set up a world (zone walls, workstations, stock) that the game itself would
 * only get from construction (task 3.5) and gathering. Real front-ends build a plain
 * `GameSession`, which has no such command.
 *
 * @param content - Content registries; default the bundled pack.
 * @returns A session without a game.
 */
export function createScenarioSession(content?: ContentRegistries): GameSession {
  const session = new GameSession(content ?? loadContent());
  session.registerSystem(createDebugSpawnSystem());
  return session;
}
