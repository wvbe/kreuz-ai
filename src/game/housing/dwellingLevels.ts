import { DwellingLevel } from "../content/contentTypes";
import type { DwellingLevelContent } from "../content/schemas/tableSchemas";
import type { GameEngine } from "../engine/GameEngine";

/**
 * The dwelling levels from lowest to highest (spec 029 FR-002).
 */
export const orderedLevels: readonly DwellingLevel[] = [
  DwellingLevel.Hovel,
  DwellingLevel.Cottage,
  DwellingLevel.TimberFramedHouse,
  DwellingLevel.BurgherHouse,
];

/**
 * Position of a level in the ladder, 0 for the Hovel.
 *
 * @param level - A dwelling level.
 * @returns The rank.
 */
export function levelRank(level: DwellingLevel): number {
  return orderedLevels.indexOf(level);
}

/**
 * The level above, or null at the Burgher House.
 *
 * @param level - A dwelling level.
 * @returns The next level.
 */
export function nextLevelOf(level: DwellingLevel): DwellingLevel | null {
  return orderedLevels[levelRank(level) + 1] ?? null;
}

/**
 * The level below, or null at the Hovel.
 *
 * @param level - A dwelling level.
 * @returns The previous level.
 */
export function previousLevelOf(level: DwellingLevel): DwellingLevel | null {
  return levelRank(level) === 0 ? null : (orderedLevels[levelRank(level) - 1] ?? null);
}

/**
 * Whether a level is the same as or above another.
 *
 * @param level - The level to test.
 * @param minimum - The lower bound.
 * @returns True when `level` is at or above `minimum`.
 */
export function isAtOrAbove(level: DwellingLevel, minimum: DwellingLevel): boolean {
  return levelRank(level) >= levelRank(minimum);
}

/**
 * The content record of a level (`dwelling-levels.json`, exactly one per level).
 *
 * @param engine - The engine.
 * @param level - A dwelling level.
 * @returns The record.
 */
export function levelDefinition(engine: GameEngine, level: DwellingLevel): DwellingLevelContent {
  return engine.content.dwellingLevels.require(level);
}

/**
 * The display name of a level (spec 029 FR-002).
 *
 * @param level - A dwelling level.
 * @returns `Hovel`, `Cottage`, `Timber-Framed House` or `Burgher House`.
 */
export function levelName(level: DwellingLevel): string {
  switch (level) {
    case DwellingLevel.Hovel:
      return "Hovel";
    case DwellingLevel.Cottage:
      return "Cottage";
    case DwellingLevel.TimberFramedHouse:
      return "Timber-Framed House";
    case DwellingLevel.BurgherHouse:
      return "Burgher House";
  }
}
