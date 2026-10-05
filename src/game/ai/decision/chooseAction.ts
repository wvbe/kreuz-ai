import { BehaviorError, BehaviorErrorKind } from "../../behavior/BehaviorError";
import type { DecisionContext } from "./decisionContext";

/**
 * One action the utility layer may choose: an id (unique among the candidates, and the tie
 * break), the need it serves (null for needless actions such as wandering) and an integer base
 * score.
 */
export type ActionCandidate = {
  id: string;
  needId: string | null;
  base: number;
};

/**
 * The scoring plugin interface (spec 013 FR-014/017, SC-011): a factor adds an integer to a
 * candidate's score. Factors are pure functions of the context and the candidate.
 */
export type DecisionFactor = {
  id: string;
  score: (context: DecisionContext, candidate: ActionCandidate) => number;
};

/**
 * The scoring of one candidate, for views and tests: `total = base + sum of the factor values`.
 */
export type ScoredCandidate<Candidate extends ActionCandidate> = {
  candidate: Candidate;
  total: number;
};

/**
 * Scores every candidate with `score = base + sum(factor scores)` (DECISIONS D-25: integers only).
 *
 * @param candidates - The candidates to score.
 * @param factors - Scoring factors; their order does not matter.
 * @param context - The decision context the factors read.
 * @returns One entry per candidate, in the order given.
 */
export function scoreCandidates<Candidate extends ActionCandidate>(
  candidates: readonly Candidate[],
  factors: readonly DecisionFactor[],
  context: DecisionContext,
): ScoredCandidate<Candidate>[] {
  return candidates.map((candidate) => {
    let total = candidate.base;
    for (const factor of factors) {
      const value = factor.score(context, candidate);
      if (!Number.isSafeInteger(value)) {
        throw new BehaviorError(
          BehaviorErrorKind.InvalidDefinition,
          `decision factor "${factor.id}" returned a non-integer score for "${candidate.id}"`,
        );
      }
      total += value;
    }
    return { candidate, total };
  });
}

/**
 * Chooses the best candidate deterministically (spec 013 FR-014/022): the highest score wins and
 * equal scores go to the candidate with the lowest id (plain string order). No randomness is
 * involved, so equal state always gives the same action.
 *
 * @param candidates - The candidates to choose from.
 * @param factors - Scoring factors.
 * @param context - The decision context.
 * @returns The winner, or null when there are no candidates.
 */
export function chooseAction<Candidate extends ActionCandidate>(
  candidates: readonly Candidate[],
  factors: readonly DecisionFactor[],
  context: DecisionContext,
): Candidate | null {
  let best: ScoredCandidate<Candidate> | null = null;
  for (const scored of scoreCandidates(candidates, factors, context)) {
    if (
      best === null ||
      scored.total > best.total ||
      (scored.total === best.total && scored.candidate.id < best.candidate.id)
    ) {
      best = scored;
    }
  }
  return best === null ? null : best.candidate;
}
