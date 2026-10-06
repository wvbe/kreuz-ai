import type { GameEngine } from "../engine/GameEngine";
import { evaluateTier } from "./evaluateTier";
import { getSettlementService } from "./settlementServiceRegistry";
import { settlementProgressOf } from "./settlementProgressOf";
import { tierReachedEvent } from "./settlementTypes";
import type { TierReached } from "./settlementTypes";

/**
 * The daily tier check (spec 027 FR-004, DECISIONS D-16): counts the evaluation, runs
 * {@link evaluateTier} and, when every requirement of the next tier holds, advances exactly one
 * tier: the tier and its reach tick are stored, the cached tier changes at once (so commands later
 * in the same tick see the unlock, FR-012) and `settlement.tier.reached` is queued. A reached tier
 * is never checked again and never lost (FR-005).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns True when the settlement was promoted.
 */
export function runTierEvaluation(engine: GameEngine, tick: number): boolean {
  const progress = settlementProgressOf(engine);
  if (progress === null) {
    return false;
  }
  progress.evaluations += 1;
  progress.lastEvaluationTick = tick;
  const evaluation = evaluateTier(engine);
  if (!evaluation.allMet || evaluation.nextTier === null) {
    return false;
  }
  const previousTier = progress.tier;
  progress.tier = evaluation.nextTier;
  progress.tierReachedAtTick[evaluation.nextTier] = tick;
  getSettlementService(engine).setTier(evaluation.nextTier);
  const payload: TierReached = { tier: evaluation.nextTier, previousTier, tick };
  engine.bus.emit(tierReachedEvent, payload);
  return true;
}
