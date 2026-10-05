import type { Difficulty } from "../save/initOptions";
import type { PathfindingService } from "../pathfinding/PathfindingService";
import type { ContentRegistries } from "../content/ContentRegistries";
import type { DecisionFactor } from "./decision/chooseAction";
import { defaultDecisionFactors } from "./decision/decisionFactors";
import type { NeedSourceFinder } from "./decision/needPlanTypes";

/**
 * Per-engine AI state that is code, not game state: the extension hooks other tasks plug into
 * (need sources, the difficulty multiplier) and the pathfinding service. Nothing here is saved;
 * the hooks are registered when the systems are set up, and `difficulty` is refreshed by the
 * AI system's init hook on every `newGame` / `loadGame`.
 */
export class AiService {
  private readonly finders: NeedSourceFinder[] = [];
  private readonly factors: DecisionFactor[] = [...defaultDecisionFactors];
  private decayMultiplierSource: (() => number) | null = null;
  private currentDifficulty: Difficulty | null = null;

  /**
   * Creates the service.
   *
   * @param content - Content with the difficulty table.
   * @param pathfinding - The engine's pathfinding service.
   */
  constructor(
    private readonly content: ContentRegistries,
    readonly pathfinding: PathfindingService,
  ) {}

  /**
   * Remembers the difficulty of the current game (called by the init hook).
   *
   * @param difficulty - The difficulty option in force.
   */
  setDifficulty(difficulty: Difficulty): void {
    this.currentDifficulty = difficulty;
  }

  /**
   * Replaces where the need decay multiplier comes from (the settlement difficulty task of
   * Phase 4 uses this hook). `null` restores the default: the `needDecayMultiplier` of the
   * game's difficulty mode (1000 for `steady`).
   *
   * @param source - Function returning permille (1000 = unchanged), or null.
   */
  setNeedDecayMultiplier(source: (() => number) | null): void {
    this.decayMultiplierSource = source;
  }

  /**
   * The need decay multiplier in force (027 FR-015): permille, 1000 = unchanged.
   *
   * @returns The multiplier.
   */
  needDecayMultiplierPermille(): number {
    if (this.decayMultiplierSource !== null) {
      return this.decayMultiplierSource();
    }
    if (this.currentDifficulty === null) {
      return 1000;
    }
    return this.content.difficultyModes.require(this.currentDifficulty).needDecayMultiplier;
  }

  /**
   * Adds a need source finder (see {@link NeedSourceFinder}); finders run in registration order.
   *
   * @param finder - The finder to add.
   */
  registerNeedSource(finder: NeedSourceFinder): void {
    this.finders.push(finder);
  }

  /**
   * The registered need source finders in registration order.
   *
   * @returns A read-only list.
   */
  needSources(): readonly NeedSourceFinder[] {
    return this.finders;
  }

  /**
   * Adds a utility scoring factor (spec 013 FR-017, SC-011): it takes part in every later
   * decision without a change to the core.
   *
   * @param factor - The factor to add; ids must be unique.
   */
  registerDecisionFactor(factor: DecisionFactor): void {
    if (this.factors.some((existing) => existing.id === factor.id)) {
      throw new Error(`decision factor "${factor.id}" is already registered`);
    }
    this.factors.push(factor);
  }

  /**
   * The scoring factors in force: the defaults, then the registered ones.
   *
   * @returns A read-only list.
   */
  decisionFactors(): readonly DecisionFactor[] {
    return this.factors;
  }
}
