import { truncDiv } from "../../engine/fixedPoint";
import { KnownNeed } from "../aiTypes";
import type { DecisionFactor } from "./chooseAction";
import { WealthClass } from "./decisionContext";
import type { DecisionContext } from "./decisionContext";

/**
 * Score added per rank step of the role-derived need priority: the first need of the order
 * beats the second even at the highest urgency (spec 013 FR-003, role order dominates).
 */
export const priorityStepScore = 1000;

/**
 * Highest urgency score: one less than a priority step, so urgency only orders needs of the
 * same rank (or breaks nothing at all).
 */
export const maxUrgencyScore = priorityStepScore - 1;

/**
 * Bonus for a need that is exactly zero: an emergency beats every role order.
 */
export const emergencyScore = 10 * priorityStepScore;

/**
 * Luxury needs the wealth factor shifts.
 */
const luxuryNeeds: readonly string[] = [KnownNeed.Comfort, KnownNeed.Faith, KnownNeed.Social];

/**
 * Shift of luxury needs for the wealthy (+) and the poor (-).
 */
export const wealthLuxuryScore = 300;

function needOf(
  context: DecisionContext,
  needId: string | null,
): DecisionContext["needs"][number] | undefined {
  return needId === null ? undefined : context.needs.find((need) => need.needId === needId);
}

/**
 * Base score of a need candidate from the entity's role-derived order: `(needCount - rank) *
 * 1000`, so a more important need always starts ahead of a less important one.
 *
 * @param context - The decision context.
 * @param needId - The need the candidate serves.
 * @returns The base score, 0 for unknown needs.
 */
export function needBaseScore(context: DecisionContext, needId: string): number {
  const need = needOf(context, needId);
  return need === undefined ? 0 : (context.needCount - need.rank) * priorityStepScore;
}

/**
 * Urgency: how far below its critical threshold a need is, `0..999`
 * (`trunc((critical - value) * 999 / critical)`).
 */
export const urgencyFactor: DecisionFactor = {
  id: "urgency",
  score: (context, candidate) => {
    const need = needOf(context, candidate.needId);
    if (need === undefined || need.criticalMilli === 0 || need.valueMilli >= need.criticalMilli) {
      return 0;
    }
    return truncDiv((need.criticalMilli - need.valueMilli) * maxUrgencyScore, need.criticalMilli);
  },
};

/**
 * Emergency: a need at zero outranks any role order (hunger at zero hurts health).
 */
export const emergencyFactor: DecisionFactor = {
  id: "emergency",
  score: (context, candidate) =>
    needOf(context, candidate.needId)?.valueMilli === 0 ? emergencyScore : 0,
};

/**
 * Wealth (spec 013 FR-010): the wealthy attend to luxury needs a little sooner, the poor a little
 * later.
 */
export const wealthLuxuryFactor: DecisionFactor = {
  id: "wealth_luxury",
  score: (context, candidate) => {
    if (candidate.needId === null || !luxuryNeeds.includes(candidate.needId)) {
      return 0;
    }
    if (context.wealth === WealthClass.Wealthy) {
      return wealthLuxuryScore;
    }
    return context.wealth === WealthClass.Poor ? -wealthLuxuryScore : 0;
  },
};

/**
 * The factors every decision uses, in a fixed order.
 */
export const defaultDecisionFactors: readonly DecisionFactor[] = [
  urgencyFactor,
  emergencyFactor,
  wealthLuxuryFactor,
];
