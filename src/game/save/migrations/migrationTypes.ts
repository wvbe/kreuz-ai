import type { JsonValue } from "../../engine/EventBus";

/**
 * A plain JSON object, the shape of a save root while it is being migrated.
 */
export type JsonObject = { [key: string]: JsonValue };

/**
 * One step of the migration chain: upgrades a save root from `fromVersion` to
 * `fromVersion + 1`. Steps work on raw JSON (no engine objects) and may assume nothing beyond
 * what the old version's format guaranteed; anything they leave malformed is caught by the
 * normal validation that follows the whole chain.
 */
export type SaveMigration = {
  fromVersion: number;
  /**
   * One line for logs and tests, e.g. "rename difficulty values and add counters".
   */
  description: string;
  /**
   * Receives a private copy of the root; returns the upgraded root (version is set by the registry).
   */
  migrate: (root: JsonObject) => JsonObject;
};
