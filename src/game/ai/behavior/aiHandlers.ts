import { NodeStatus } from "../../behavior/behaviorTypes";
import type { BehaviorContext } from "../../behavior/behaviorTypes";
import { getComponent } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { taskQueueComponent } from "../../task/taskQueueComponent";
import { AiStream, AiTaskPriority, AiTaskType } from "../aiTypes";
import { chooseCriticalNeed } from "../decision/chooseCriticalNeed";
import { NeedPlanKind } from "../decision/needPlanTypes";
import { moveTaskData } from "../movement/moveTask";
import { criticalNeedsOf, getNeedValue } from "../needs/needAccess";
import { idleTaskData } from "../tasks/idleTask";
import { satisfyTaskData } from "../tasks/satisfyTask";
import { pickWanderCell } from "./pickWanderCell";

/**
 * Id of the condition that is true while some need is at or below its critical threshold.
 */
export const anyNeedBelowCriticalId = "any_need_below_critical";

/**
 * Id of the action that picks the most important satisfiable critical need and enqueues the task
 * that satisfies it.
 */
export const satisfyCriticalNeedId = "satisfy_critical_need";

/**
 * Id of the action that makes an idle entity stand around or walk somewhere nearby.
 */
export const idleWanderId = "idle_wander";

/**
 * The condition `any_need_below_critical`: success while at least one need of the entity is
 * critical (at or below the authored threshold).
 *
 * @param engine - The engine.
 * @param context - Behavior context of the evaluated node.
 * @returns Success or failure.
 */
export function anyNeedBelowCritical(engine: GameEngine, context: BehaviorContext): NodeStatus {
  return criticalNeedsOf(engine.content.needs, context.entity).length > 0
    ? NodeStatus.Success
    : NodeStatus.Failure;
}

/**
 * The action `satisfy_critical_need` (spec 013 FR-003/012/014): every critical need that has a
 * plan (inventory first, then registered sources, beds, the ground) becomes a candidate scored
 * `base + sum(factors)` from the entity's role-derived priority order; the best one (ties:
 * lowest need id) is enqueued as an `ai.satisfy` task at priority `Need`, or `Collapse` when
 * the need is exactly zero and the plan is sleep. Fails when no critical need can be satisfied
 * now, so the tree falls through to idle behavior.
 *
 * @param engine - The engine.
 * @param context - Behavior context of the evaluated node.
 * @returns Success when a task was enqueued, failure otherwise.
 */
export function satisfyCriticalNeed(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const chosen = chooseCriticalNeed(engine, context.entity, context.tick);
  if (chosen === null) {
    return NodeStatus.Failure;
  }
  const collapsed =
    chosen.plan.kind === NeedPlanKind.Sleep &&
    getNeedValue(context.entity, chosen.plan.needId) === 0;
  engine.tasks.enqueue(context.entityId, {
    type: AiTaskType.Satisfy,
    data: satisfyTaskData(chosen.plan),
    priority: collapsed ? AiTaskPriority.Collapse : AiTaskPriority.Need,
  });
  return NodeStatus.Success;
}

/**
 * The action `idle_wander`: when the entity has no task at all it either stands still for a while
 * (`idleStandChance`, duration from the `ai.decide` stream) or walks to a cell picked by
 * {@link pickWanderCell} (`ai.wander`); both are enqueued at priority `Idle` so any need
 * interrupts them. It does nothing while the entity already has a task.
 *
 * @param engine - The engine.
 * @param context - Behavior context of the evaluated node.
 * @returns Success.
 */
export function idleWander(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const queue = getComponent(context.entity, taskQueueComponent);
  if (queue === undefined || queue.tasks.length > 0) {
    return NodeStatus.Success;
  }
  const constants = engine.content.constants;
  const decide = engine.prng.stream(AiStream.Decide);
  const stand = decide.chancePermille(constants.idleStandChance);
  const ticks = decide.nextInt(constants.idleStandMinTicks, constants.idleStandMaxTicks);
  const target = stand ? null : pickWanderCell(engine, context.entity);
  if (target === null) {
    engine.tasks.enqueue(context.entityId, {
      type: AiTaskType.Idle,
      data: idleTaskData(ticks),
      priority: AiTaskPriority.Idle,
    });
  } else {
    engine.tasks.enqueue(context.entityId, {
      type: AiTaskType.Move,
      data: moveTaskData(target.mapId, target.cellIndex),
      priority: AiTaskPriority.Idle,
    });
  }
  return NodeStatus.Success;
}

/**
 * Registers the condition and the actions the v0 behavior trees (`basic_needs`, `idle_wander`)
 * name, with the engine's behavior handler registry.
 *
 * @param engine - The engine; call before the first `newGame` / `loadGame`.
 */
export function registerAiHandlers(engine: GameEngine): void {
  engine.behaviorHandlers.registerCondition(anyNeedBelowCriticalId, (context) =>
    anyNeedBelowCritical(engine, context),
  );
  engine.behaviorHandlers.registerAction(satisfyCriticalNeedId, (context) =>
    satisfyCriticalNeed(engine, context),
  );
  engine.behaviorHandlers.registerAction(idleWanderId, (context) => idleWander(engine, context));
}
