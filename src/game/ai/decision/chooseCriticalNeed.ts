import type { Entity } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { getAiService } from "../aiServiceRegistry";
import { criticalNeedsOf } from "../needs/needAccess";
import { chooseAction } from "./chooseAction";
import type { ActionCandidate } from "./chooseAction";
import { buildDecisionContext } from "./decisionContext";
import { needBaseScore } from "./decisionFactors";
import { planNeed } from "./planNeed";
import type { NeedPlan } from "./needPlanTypes";

/**
 * A critical need that has a plan, scored like every utility candidate.
 */
export type PlannedNeedCandidate = ActionCandidate & { plan: NeedPlan };

/**
 * Chooses which critical need an entity serves next (spec 013 FR-003/012/014): every critical
 * need that has a plan (inventory first, then registered sources, beds, the ground) is a
 * candidate scored `base + sum(factors)`; the best wins, ties go to the lowest need id. The
 * `satisfy_critical_need` action and the wake check of a sleeper (DECISIONS D-180) share this
 * choice, so a settler is woken only for a need that the decision itself would serve first.
 *
 * @param engine - The engine.
 * @param entity - The entity with the needs; it needs a `Position`.
 * @param tick - The current tick.
 * @returns The chosen candidate, or null when no critical need can be satisfied now.
 */
export function chooseCriticalNeed(
  engine: GameEngine,
  entity: Entity,
  tick: number,
): PlannedNeedCandidate | null {
  const decision = buildDecisionContext(engine.content, entity, tick);
  const candidates: PlannedNeedCandidate[] = [];
  for (const need of criticalNeedsOf(engine.content.needs, entity)) {
    const plan = planNeed(engine, entity, need);
    if (plan !== null) {
      candidates.push({
        id: need.id,
        needId: need.id,
        base: needBaseScore(decision, need.id),
        plan,
      });
    }
  }
  return chooseAction(candidates, getAiService(engine).decisionFactors(), decision);
}
