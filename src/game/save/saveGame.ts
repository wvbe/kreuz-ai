import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { isoTimestampPattern } from "./parseSave";
import type { JsonObject } from "./migrations/migrationTypes";
import { SaveSectionLocation } from "./SaveSectionRegistry";
import { stableStringify } from "./stableStringify";
import { CoreSaveKey, currentSaveVersion, defaultSaveTimestamp } from "./saveTypes";
import type { GameSnapshotParts, SaveOptions } from "./saveTypes";

/**
 * Builds the root object of a save from the live parts without changing any of them (DECISIONS
 * D-05: `save()` is read-only). Registered sections are validated against their schema so a bug
 * in a system surfaces at save time, not at the next load.
 *
 * @param parts - The live game parts.
 * @param options - Optional host-injected timestamp.
 * @returns The root as a JSON object (key order is irrelevant until {@link saveGame}).
 */
export function serializeGame(parts: GameSnapshotParts, options: SaveOptions = {}): JsonObject {
  const timestamp = options.timestamp ?? defaultSaveTimestamp;
  if (!isoTimestampPattern.test(timestamp)) {
    throw new InvalidSaveFormatError(`timestamp "${timestamp}" is not ISO 8601 UTC`, [
      "timestamp: must look like 2026-10-05T12:00:00.000Z",
    ]);
  }
  const root: JsonObject = {
    [CoreSaveKey.Version]: currentSaveVersion,
    [CoreSaveKey.Timestamp]: timestamp,
    [CoreSaveKey.Time]: { ...parts.time.serialize() },
    [CoreSaveKey.Prng]: parts.prng.prng.serialize(),
    [CoreSaveKey.EventQueue]: parts.bus.serialize(),
    [CoreSaveKey.InitOptions]: { ...parts.initOptions.options },
    [CoreSaveKey.Counters]: { ...parts.counters.serialize() },
    [CoreSaveKey.Entities]: parts.store.serialize().entities,
    [CoreSaveKey.Maps]: parts.maps.serialize(),
  };
  const systems: JsonObject = {};
  for (const section of parts.sections.list()) {
    const label =
      section.location === SaveSectionLocation.Root ? section.key : `systems.${section.key}`;
    const checked = section.schema.safeParse(section.serialize());
    if (!checked.success) {
      throw new InvalidSaveFormatError(`section ${label} produced invalid state`, [
        `${label}: ${checked.error.message}`,
      ]);
    }
    if (section.location === SaveSectionLocation.Root) {
      root[section.key] = checked.data;
    } else {
      systems[section.key] = checked.data;
    }
  }
  root[CoreSaveKey.Systems] = systems;
  return root;
}

/**
 * Saves the game as canonical JSON text: sorted keys, no whitespace, integers only. The same
 * state always yields the same string apart from the injected `timestamp` (spec 006 SC-002).
 * No file I/O happens here; persisting the text is the host's job (FR-011).
 *
 * @param parts - The live game parts; they are only read.
 * @param options - Optional host-injected timestamp.
 * @returns The save text.
 */
export function saveGame(parts: GameSnapshotParts, options: SaveOptions = {}): string {
  return stableStringify(serializeGame(parts, options));
}
