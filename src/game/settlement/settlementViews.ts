import { MilestoneKind } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { evaluateTier } from "./evaluateTier";
import { settlementProgressOf } from "./settlementProgressOf";
import type { SettlementProgressView } from "./settlementTypes";

/**
 * One row of the query `milestones`: every milestone kind, reached or not.
 */
export type MilestoneView = {
  milestone: MilestoneKind;
  reached: boolean;
  tick: number | null;
  subjectIds: EntityId[];
};

/**
 * The view behind the query `settlement-progress` (spec 027 FR-006): the tier and its settlement
 * noun, when each tier was reached, the checklist of the next tier's requirements (computed now,
 * never stored), the milestones and the evaluation counters.
 *
 * @param engine - The engine.
 * @returns The view, or null when there is no game.
 */
export function buildSettlementProgressView(engine: GameEngine): SettlementProgressView | null {
  const progress = settlementProgressOf(engine);
  if (progress === null) {
    return null;
  }
  const evaluation = evaluateTier(engine);
  return {
    tier: progress.tier,
    settlementNoun: engine.content.settlementTiers.require(progress.tier).settlementNoun,
    tierReachedAtTick: { ...progress.tierReachedAtTick },
    nextTier: evaluation.nextTier,
    nextSettlementNoun:
      evaluation.nextTier === null
        ? null
        : engine.content.settlementTiers.require(evaluation.nextTier).settlementNoun,
    requirements: evaluation.requirements,
    milestones: progress.milestones.map((record) => ({
      ...record,
      subjectIds: [...record.subjectIds],
    })),
    evaluations: progress.evaluations,
    lastEvaluationTick: progress.lastEvaluationTick,
  };
}

/**
 * The view behind the query `milestones`: all seven milestone kinds in enum order with the tick
 * and subjects of the ones reached.
 *
 * @param engine - The engine.
 * @returns The rows; every milestone unreached when there is no game.
 */
export function buildMilestoneViews(engine: GameEngine): MilestoneView[] {
  const records = settlementProgressOf(engine)?.milestones ?? [];
  return Object.values(MilestoneKind).map((milestone) => {
    const record = records.find((entry) => entry.milestone === milestone);
    return {
      milestone,
      reached: record !== undefined,
      tick: record?.tick ?? null,
      subjectIds: record === undefined ? [] : [...record.subjectIds],
    };
  });
}
