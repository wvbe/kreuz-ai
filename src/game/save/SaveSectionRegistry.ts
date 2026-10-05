import type { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import { CoreSaveKey } from "./saveTypes";

/**
 * Where a registered section lives in the save.
 */
export enum SaveSectionLocation {
  /**
   * Its own root key, e.g. `statuses`, `productionLedger`, `stewardship` (DECISIONS D-05).
   */
  Root = "root",
  /**
   * An entry of the root `systems` object, keyed by the section key.
   */
  Systems = "systems",
}

/**
 * Global state of one system that no entity owns. A system registers one section per save key;
 * the save module never needs to know about it (spec 006 FR-004a, DECISIONS D-05).
 */
export type SaveSection = {
  /**
   * Root key name or `systems` entry name, `camelCase` with optional dots.
   */
  key: string;
  location: SaveSectionLocation;
  /**
   * Validates the section's JSON on save and on load before anything is applied.
   */
  schema: z.ZodType<JsonValue>;
  /**
   * Returns the section's state as JSON with safe-integer numbers only.
   */
  serialize: () => JsonValue;
  /**
   * Replaces the section's state with validated saved JSON. Runs after all core parts.
   */
  restore: (saved: JsonValue) => void;
  /**
   * Value used when the save is older than the current version and has no entry for this
   * section (a section introduced by a later version). Saves of the current version must
   * carry the section; there is no silent default for them.
   */
  defaultForOlderSaves?: () => JsonValue;
  /**
   * Restore order among sections, ascending (default 0); ties by registration order.
   */
  order?: number;
};

/**
 * Thrown for invalid or conflicting section registrations (programmer errors).
 */
export class SaveSectionError extends Error {
  /**
   * Creates the error.
   *
   * @param message - Description naming the section key.
   */
  constructor(message: string) {
    super(message);
    this.name = "SaveSectionError";
  }
}

const keyPattern = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/;

/**
 * Keys the save module itself owns at the root; sections may not take them.
 */
export const reservedRootKeys: readonly string[] = Object.values(CoreSaveKey);

/**
 * Per-engine registry of save sections (AD8). Later systems register their `statuses`,
 * `productionLedger`, `stewardship` or `systems.*` state here instead of editing a central
 * switch. Registered root sections are required in every save of the current version and
 * unregistered root keys are rejected (strict root, DECISIONS D-05).
 */
export class SaveSectionRegistry {
  private readonly sections: SaveSection[] = [];

  /**
   * Registers a section.
   *
   * @param section - The section; its key must be unique within its location.
   */
  register(section: SaveSection): void {
    if (!keyPattern.test(section.key)) {
      throw new SaveSectionError(`invalid save section key "${section.key}"`);
    }
    if (section.location === SaveSectionLocation.Root && reservedRootKeys.includes(section.key)) {
      throw new SaveSectionError(`root key "${section.key}" is reserved by the save module`);
    }
    if (this.get(section.location, section.key)) {
      throw new SaveSectionError(
        `save section "${section.key}" is already registered at ${section.location}`,
      );
    }
    this.sections.push(section);
  }

  /**
   * Finds a section.
   *
   * @param location - Root or systems.
   * @param key - Section key.
   * @returns The section or undefined.
   */
  get(location: SaveSectionLocation, key: string): SaveSection | undefined {
    return this.sections.find((section) => section.location === location && section.key === key);
  }

  /**
   * Lists sections in restore order: ascending `order`, then registration order.
   *
   * @returns A new array.
   */
  list(): SaveSection[] {
    return this.sections
      .map((section, index) => ({ section, index }))
      .sort(
        (left, right) =>
          (left.section.order ?? 0) - (right.section.order ?? 0) || left.index - right.index,
      )
      .map((entry) => entry.section);
  }

  /**
   * Lists sections of one location in restore order.
   *
   * @param location - Root or systems.
   * @returns A new array.
   */
  listAt(location: SaveSectionLocation): SaveSection[] {
    return this.list().filter((section) => section.location === location);
  }
}
