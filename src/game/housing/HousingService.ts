import type { DwellingLevel } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";
import type { DwellingEvaluation } from "./evaluateDwelling";
import type { ImmigrationBlockedReason } from "./housingTypes";

/**
 * Per-engine housing state that is not saved: what the last daily evaluation found for each
 * dwelling (the status provider reports at the evaluation, spec 029 FR-019a) and why settlers
 * could not come. After a load the cache is empty and the provider derives the status itself;
 * everything that matters (levels, streaks, accumulators, food, homes) lives in components.
 */
export class HousingService {
  private readonly evaluations = new Map<EntityId, { tick: number; value: DwellingEvaluation }>();
  private readonly retired = new Map<EntityId, DwellingLevel>();
  private blocked: ImmigrationBlockedReason | null = null;

  /**
   * Remembers the findings of today's evaluation of one dwelling.
   *
   * @param dwellingId - The dwelling.
   * @param tick - The tick of the evaluation.
   * @param value - The requirement status found.
   */
  remember(dwellingId: EntityId, tick: number, value: DwellingEvaluation): void {
    this.evaluations.set(dwellingId, { tick, value });
  }

  /**
   * The findings of the last evaluation of a dwelling, if it ran since the game was loaded.
   *
   * @param dwellingId - The dwelling.
   * @returns The tick and findings, or null.
   */
  recall(dwellingId: EntityId): { tick: number; value: DwellingEvaluation } | null {
    return this.evaluations.get(dwellingId) ?? null;
  }

  /**
   * Forgets everything about a dwelling (it was deleted or became inactive for good).
   *
   * @param dwellingId - The dwelling.
   */
  forget(dwellingId: EntityId): void {
    this.evaluations.delete(dwellingId);
  }

  /**
   * Remembers the level of a dwelling that is being removed from the store, so that the merge
   * handler (which runs after the removal, in the slot-20 drain) can still read it.
   *
   * @param dwellingId - The dwelling that was removed.
   * @param level - Its level when it went.
   */
  retire(dwellingId: EntityId, level: DwellingLevel): void {
    this.retired.set(dwellingId, level);
  }

  /**
   * The level a removed dwelling had, if it was removed in this session.
   *
   * @param dwellingId - The dwelling that was removed.
   * @returns The level, or null.
   */
  retiredLevel(dwellingId: EntityId): DwellingLevel | null {
    return this.retired.get(dwellingId) ?? null;
  }

  /**
   * Forgets a retired dwelling once its removal has been handled.
   *
   * @param dwellingId - The dwelling.
   */
  unretire(dwellingId: EntityId): void {
    this.retired.delete(dwellingId);
  }

  /**
   * Clears every remembered finding (new game or load).
   */
  reset(): void {
    this.evaluations.clear();
    this.retired.clear();
    this.blocked = null;
  }

  /**
   * Records why settlers could not come at the last evaluation, or null when they could (or none
   * were due).
   *
   * @param reason - The reason, or null.
   */
  setBlocked(reason: ImmigrationBlockedReason | null): void {
    this.blocked = reason;
  }

  /**
   * Why settlers could not come at the last evaluation.
   *
   * @returns The reason, or null.
   */
  immigrationBlocked(): ImmigrationBlockedReason | null {
    return this.blocked;
  }
}
