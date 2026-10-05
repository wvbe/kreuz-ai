import type { JsonValue } from "../engine/EventBus";
import { Prng } from "../engine/Prng";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { parseSave } from "./parseSave";
import { saveGame } from "./saveGame";
import { SaveSectionLocation } from "./SaveSectionRegistry";
import type { GameSnapshotParts, LoadOptions, ParsedSave } from "./saveTypes";
import { currentSaveVersion } from "./saveTypes";

/**
 * What a successful load reports.
 */
export type LoadResult = {
  /**
   * Version of the input before migration.
   */
  originalVersion: number;
  /**
   * True when the input was older and has been migrated forward.
   */
  migrated: boolean;
  /**
   * The save's metadata timestamp.
   */
  timestamp: string;
};

/**
 * Applies a validated save to the live parts in dependency order: counters first (the entity
 * store and map registry check ids against them), then clock, PRNG, event queue, entities, maps,
 * the derived occupant index and task wait index, init options, and finally registered sections
 * in their registered order.
 *
 * @param parts - The live parts to overwrite.
 * @param parsed - A save from {@link parseSave}.
 */
function applyParsedSave(parts: GameSnapshotParts, parsed: ParsedSave): void {
  const { core } = parsed;
  parts.counters.restore(core.counters);
  parts.time.restore(core.time);
  parts.prng.prng = Prng.fromState(core.prng);
  parts.bus.restore(core.eventQueue);
  parts.store.restore({ entities: core.entities });
  parts.maps.restore(core.maps);
  parts.maps.rebuildOccupants(parts.store.entities());
  parts.tasks.rebuildWaitIndex();
  parts.initOptions.options = core.initOptions;
  for (const section of parts.sections.list()) {
    const saved: JsonValue | undefined =
      section.location === SaveSectionLocation.Root
        ? parsed.rootSections[section.key]
        : parsed.systems[section.key];
    if (saved !== undefined) {
      section.restore(saved);
    }
  }
}

/**
 * Loads a save into the live game parts (spec 006 US2 and US3). The input is parsed, version
 * checked, migrated and validated before anything is touched; if applying it still fails, the
 * previous state is restored, so a rejected load leaves the running game as it was (SC-004).
 * Call it between ticks with no entity flagged for deletion. Subscriptions are not part of a
 * save, so systems keep their own; event-bus subscribers registered before or after the load
 * receive the restored queue.
 *
 * @param input - Save text or an already parsed object (not modified).
 * @param parts - The live game parts to overwrite.
 * @param options - Optional migration chain override.
 * @returns Version and timestamp information about the loaded save.
 * @throws {InvalidSaveFormatError} for invalid JSON, failed validation or content that cannot be applied.
 * @throws {UnsupportedSaveVersionError} when the save is newer than this build understands.
 */
export function loadGame(
  input: string | JsonValue,
  parts: GameSnapshotParts,
  options: LoadOptions = {},
): LoadResult {
  const parsed = parseSave(input, { ...options, sections: parts.sections });
  const backup = parseSave(saveGame(parts), { sections: parts.sections });
  try {
    applyParsedSave(parts, parsed);
  } catch (error) {
    try {
      applyParsedSave(parts, backup);
    } catch (rollbackError) {
      throw new Error("load failed and the previous game state could not be restored", {
        cause: rollbackError,
      });
    }
    if (error instanceof InvalidSaveFormatError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidSaveFormatError(
      `save could not be applied: ${message}`,
      [message],
      error instanceof Error ? error : undefined,
    );
  }
  return {
    originalVersion: parsed.originalVersion,
    migrated: parsed.originalVersion !== currentSaveVersion,
    timestamp: parsed.timestamp,
  };
}
