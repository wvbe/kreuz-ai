import { isJsonObject } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { serializeGame } from "./saveGame";
import { stableStringify } from "./stableStringify";
import { CoreSaveKey, defaultSaveTimestamp } from "./saveTypes";
import type { GameSnapshotParts } from "./saveTypes";

/**
 * 64-bit non-cryptographic hash (two FNV-1a style 32-bit lanes) of a text, as 16 lowercase hex
 * characters. Pure integer arithmetic, identical on every platform.
 *
 * @param text - Any text; it is hashed per UTF-16 code unit.
 * @returns A 16 character hex string.
 */
export function hashText(text: string): string {
  let laneA = 0x811c9dc5;
  let laneB = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    laneA = Math.imul(laneA ^ unit, 0x01000193) >>> 0;
    laneB = Math.imul(laneB ^ unit, 0x85ebca6b) >>> 0;
    laneB = (laneB ^ (laneB >>> 13)) >>> 0;
  }
  return laneA.toString(16).padStart(8, "0") + laneB.toString(16).padStart(8, "0");
}

/**
 * Hashes save text with the wall-clock `timestamp` neutralised, so two saves of the same state
 * taken at different times hash equal (spec 006 FR-006a).
 *
 * @param save - Save text from `saveGame`.
 * @returns The state hash.
 */
export function hashSaveText(save: string): string {
  let root: JsonValue;
  try {
    root = JSON.parse(save) as JsonValue;
  } catch (error) {
    throw new InvalidSaveFormatError(
      "cannot hash text that is not valid JSON",
      [],
      error instanceof Error ? error : undefined,
    );
  }
  if (!isJsonObject(root)) {
    throw new InvalidSaveFormatError("cannot hash a save whose root is not an object");
  }
  return hashText(stableStringify({ ...root, [CoreSaveKey.Timestamp]: defaultSaveTimestamp }));
}

/**
 * Hash of the live game state for determinism tests: equal hashes mean byte-identical saves
 * (ignoring the timestamp). The parts are only read.
 *
 * @param parts - The live game parts.
 * @returns The state hash.
 */
export function hashGameState(parts: GameSnapshotParts): string {
  return hashText(stableStringify(serializeGame(parts)));
}
