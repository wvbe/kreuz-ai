import { aiStateComponent } from "../../behavior/aiStateComponent";
import { getComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { taskQueueComponent } from "../../task/taskQueueComponent";
import { AiTaskPriority } from "../aiTypes";
import { criticalNeedsOf } from "../needs/needAccess";

/**
 * Whether an entity is due for a decision at this tick (spec 013 FR-018/019, SC-005): it has a
 * behavior tree and a task queue, and
 * - no task at all, or
 * - only tasks below {@link AiTaskPriority.Need} (wandering, standing, claimed jobs) while one of
 *   its needs is critical, so a critical need redirects it within the same tick (the new task
 *   outranks and interrupts the other one at slot 6).
 * An entity that already has a task at need priority or above is committed and left alone.
 *
 * @param engine - The engine.
 * @param entity - The candidate entity.
 * @returns True when the behavior tree should run.
 */
export function isDueForDecision(engine: GameEngine, entity: Entity): boolean {
  const aiState = getComponent(entity, aiStateComponent);
  const queue = getComponent(entity, taskQueueComponent);
  if (aiState === undefined || aiState.treeId === null || queue === undefined) {
    return false;
  }
  if (queue.tasks.length === 0) {
    return true;
  }
  if (queue.tasks.some((task) => task.priority >= AiTaskPriority.Need)) {
    return false;
  }
  return criticalNeedsOf(engine.content.needs, entity).length > 0;
}

/**
 * Slot 5 (AI decision, DECISIONS section 2): for every entity in ascending id that is due (see
 * {@link isDueForDecision}) runs one tick of its behavior tree. Leaf handlers enqueue tasks; the
 * task system executes them at slot 6. Decisions only read game state and the named PRNG streams,
 * so equal state gives equal decisions.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the entities that were decided for, ascending.
 */
export function runAiDecisions(engine: GameEngine, tick: number): number[] {
  const decided: number[] = [];
  for (const entity of engine.store.entities()) {
    if (isDueForDecision(engine, entity)) {
      engine.behavior.tick(entity.id, tick);
      decided.push(entity.id);
    }
  }
  return decided;
}
