import { cloneJson } from "../../ecs/jsonData";
import { InvalidSaveFormatError } from "../InvalidSaveFormatError";
import type { JsonObject, SaveMigration } from "./migrationTypes";

/**
 * Ordered chain of version steps (spec 006 FR-012). A new save version adds exactly one
 * migration `fromVersion = previous` here and raises `currentSaveVersion`; nothing else changes.
 */
export class MigrationRegistry {
  private readonly steps = new Map<number, SaveMigration>();

  /**
   * Adds a step.
   *
   * @param migration - The step; one per `fromVersion`.
   */
  register(migration: SaveMigration): void {
    if (!Number.isInteger(migration.fromVersion) || migration.fromVersion < 0) {
      throw new Error(`migration fromVersion must be a non-negative integer`);
    }
    if (this.steps.has(migration.fromVersion)) {
      throw new Error(`a migration from version ${migration.fromVersion} is already registered`);
    }
    this.steps.set(migration.fromVersion, migration);
  }

  /**
   * Tells whether the chain covers every step from `fromVersion` up to `toVersion`.
   *
   * @param fromVersion - Oldest version to support.
   * @param toVersion - Target version.
   * @returns True when each step `n -> n+1` exists.
   */
  covers(fromVersion: number, toVersion: number): boolean {
    for (let version = fromVersion; version < toVersion; version += 1) {
      if (!this.steps.has(version)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Applies the steps from `fromVersion` to `toVersion` on a copy of the root.
   *
   * @param root - The saved root, not modified.
   * @param fromVersion - Version the root is in.
   * @param toVersion - Version to reach.
   * @returns The upgraded root with `version` set to `toVersion`.
   */
  migrate(root: JsonObject, fromVersion: number, toVersion: number): JsonObject {
    let current: JsonObject = cloneJson(root);
    for (let version = fromVersion; version < toVersion; version += 1) {
      const step = this.steps.get(version);
      if (!step) {
        throw new InvalidSaveFormatError(
          `no migration from save version ${version} to ${version + 1}`,
        );
      }
      current = { ...step.migrate(current), version: version + 1 };
    }
    return current;
  }
}
