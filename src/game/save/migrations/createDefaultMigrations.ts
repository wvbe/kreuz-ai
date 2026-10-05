import { MigrationRegistry } from "./MigrationRegistry";
import { migrateV0ToV1 } from "./migrateV0ToV1";

/**
 * Builds the registry holding every built-in migration step, oldest first. Add the step for a
 * new save version here.
 *
 * @returns A fresh registry (per call, so engines may add their own steps without sharing).
 */
export function createDefaultMigrations(): MigrationRegistry {
  const registry = new MigrationRegistry();
  registry.register({
    fromVersion: 0,
    description: "rename difficulty normal/hard to steady/harsh, add counters and systems",
    migrate: migrateV0ToV1,
  });
  return registry;
}
