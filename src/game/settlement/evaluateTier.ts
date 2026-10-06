import type { GameEngine } from "../engine/GameEngine";
import { evaluateRequirement } from "./evaluateRequirement";
import { getSettlementService } from "./settlementServiceRegistry";
import { nextTierOf } from "./tierOrder";
import type { TierEvaluation } from "./settlementTypes";

/**
 * Evaluates the requirements of the next tier against the world as it is now (spec 027 FR-004,
 * FR-006). Pure: nothing is changed and no event is emitted; the daily `runTierEvaluation` calls it
 * and promotes when everything holds. The result is a function of the world state only, so two
 * identical games always agree.
 *
 * @param engine - The engine.
 * @returns The tier in force, the next tier (null at the highest), the status of each of its
 *   requirements and whether all are met (never true at the highest tier).
 */
export function evaluateTier(engine: GameEngine): TierEvaluation {
  const tier = getSettlementService(engine).tier();
  const nextTier = nextTierOf(tier);
  if (nextTier === null) {
    return { tier, nextTier, requirements: [], allMet: false };
  }
  const requirements = engine.content.settlementTiers
    .require(nextTier)
    .requirements.map((requirement) => evaluateRequirement(engine, requirement));
  return { tier, nextTier, requirements, allMet: requirements.every((entry) => entry.met) };
}
