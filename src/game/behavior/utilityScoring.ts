import type { Entity, EntityId } from "../ecs/Entity";
import type { EntityStore } from "../ecs/EntityStore";
import { BehaviorError, BehaviorErrorKind } from "./BehaviorError";

/**
 * One behavior the utility layer may choose: a registered tree id and an integer base score.
 */
export type BehaviorCandidate = {
  treeId: string;
  base: number;
};

/**
 * What a scoring factor may look at. Factors are pure functions of game state.
 */
export type UtilityContext = {
  entityId: EntityId;
  entity: Entity;
  tick: number;
  store: EntityStore;
};

/**
 * The plugin interface for utility scoring (spec 013 FR-014, SC-011): an engine-registered
 * factor that adds an integer to a candidate's score. Task 2.4 supplies the actual factors and
 * numerics; this task only fixes the hook shape.
 */
export type UtilityFactor = {
  id: string;
  score: (context: UtilityContext, candidate: BehaviorCandidate) => number;
};

/**
 * Chooses among behavior candidates with `score = base + sum(factor scores)` (DECISIONS D-25):
 * integer scores, the highest wins, ties go to the lowest candidate index.
 *
 * @param candidates - Behaviors to choose from, in priority-neutral order.
 * @param factors - Scoring factors; their order does not matter.
 * @param context - Entity state the factors read.
 * @returns The winning candidate, or null when there are no candidates.
 */
export function pickBestCandidate(
  candidates: BehaviorCandidate[],
  factors: UtilityFactor[],
  context: UtilityContext,
): BehaviorCandidate | null {
  let best: BehaviorCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    let total = candidate.base;
    for (const factor of factors) {
      const value = factor.score(context, candidate);
      if (!Number.isSafeInteger(value)) {
        throw new BehaviorError(
          BehaviorErrorKind.InvalidDefinition,
          `utility factor "${factor.id}" returned a non-integer score for "${candidate.treeId}"`,
        );
      }
      total += value;
    }
    if (best === null || total > bestScore) {
      best = candidate;
      bestScore = total;
    }
  }
  return best;
}
