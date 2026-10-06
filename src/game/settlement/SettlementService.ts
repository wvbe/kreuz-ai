import { SettlementTier } from "../content/contentTypes";
import type { DwellingLevel } from "../content/contentTypes";

/**
 * Counts the settlement's dwellings at or above a level (spec 029 `countDwellingsAtOrAbove`). Task
 * 4.5 installs the real one; until then there are no dwellings and the count is 0.
 */
export type DwellingCounter = (level: DwellingLevel) => number;

/**
 * Per-engine settlement state that is not saved: the tier in force (a cache of the
 * `SettlementProgress` component, refreshed by the settlement system's init and on every
 * promotion, so that the hot gate checks of the job, production, zone and construction systems
 * do not search for the government entity) and the hook through which housing reports dwellings.
 */
export class SettlementService {
  private currentTier: SettlementTier = SettlementTier.Hamlet;
  private dwellingCounter: DwellingCounter | null = null;

  /**
   * The tier in force (the job service's tier source reads this).
   *
   * @returns A tier; Hamlet before a game exists.
   */
  tier(): SettlementTier {
    return this.currentTier;
  }

  /**
   * Sets the cached tier (called by init, promotions and tests).
   *
   * @param tier - The tier now in force.
   */
  setTier(tier: SettlementTier): void {
    this.currentTier = tier;
  }

  /**
   * Installs the dwelling counter of the housing system (spec 029 FR-019), or removes it.
   *
   * @param counter - Function that counts dwellings at or above a level, or null for none.
   */
  setDwellingCounter(counter: DwellingCounter | null): void {
    this.dwellingCounter = counter;
  }

  /**
   * The number of dwellings at or above a level; 0 while no housing system is installed.
   *
   * @param level - A dwelling level.
   * @returns The count.
   */
  countDwellingsAtOrAbove(level: DwellingLevel): number {
    return this.dwellingCounter === null ? 0 : this.dwellingCounter(level);
  }
}
