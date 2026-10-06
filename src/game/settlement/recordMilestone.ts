import type { MilestoneKind } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { settlementProgressOf } from "./settlementProgressOf";
import { milestoneReachedEvent } from "./settlementTypes";
import type { MilestoneReached } from "./settlementTypes";

/**
 * Records a milestone the first time it happens (spec 027 FR-020): appends a `MilestoneRecord`
 * with the tick and the subject ids and queues `settlement.milestone.reached`. A milestone that
 * is already recorded does nothing, so it fires once per game however often its trigger repeats.
 *
 * @param engine - The engine.
 * @param milestone - The milestone.
 * @param subjectIds - Entities the milestone is about (a zone, a dwelling, a guild, a citizen).
 * @returns True when it was newly recorded; false when it was known or there is no game.
 */
export function recordMilestone(
  engine: GameEngine,
  milestone: MilestoneKind,
  subjectIds: readonly EntityId[],
): boolean {
  const progress = settlementProgressOf(engine);
  if (progress === null || progress.milestones.some((record) => record.milestone === milestone)) {
    return false;
  }
  const tick = engine.time.tickCount;
  progress.milestones.push({ milestone, tick, subjectIds: [...subjectIds] });
  const payload: MilestoneReached = { milestone, tick, subjectIds: [...subjectIds] };
  engine.bus.emit(milestoneReachedEvent, payload);
  return true;
}
