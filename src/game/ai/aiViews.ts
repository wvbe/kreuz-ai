import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { isJsonObject } from "../ecs/jsonData";
import { floorDiv } from "../engine/fixedPoint";
import type { GameEngine } from "../engine/GameEngine";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { TaskStatus } from "../task/taskTypes";
import type { TaskRecord } from "../task/taskTypes";
import { AiTaskType } from "./aiTypes";
import { buildDecisionContext } from "./decision/decisionContext";
import { needPriorityOrder, roleOf } from "./decision/rolePriority";
import { moodComponent } from "./mood/moodComponent";
import { healthComponent } from "./needs/healthComponent";
import { needsComponent } from "./needs/needsComponent";

/**
 * One need in the `needs-of` view.
 */
export type NeedViewRow = {
  readonly needId: string;
  readonly name: string;
  readonly valueMilli: number;
  readonly percent: number;
  readonly critical: boolean;
};

/**
 * Plain view of an entity's needs, mood, health and current action (query `needs-of`).
 */
export type NeedsView = {
  readonly entityId: number;
  readonly needs: readonly NeedViewRow[];
  readonly moodMilli: number;
  readonly riskSuccessPermille: number;
  readonly healthMilli: number;
  readonly role: string;
  readonly priorityOrder: readonly string[];
  readonly coins: number;
  readonly wealth: string;
  /**
   * Short human-readable description of what the entity is doing (`idle` without a task).
   */
  readonly action: string;
};

function describeTask(task: TaskRecord): string {
  const data = isJsonObject(task.data) ? task.data : {};
  if (task.type === AiTaskType.Move) {
    return `move to cell ${String(data["target"] ?? "?")}`;
  }
  if (task.type === AiTaskType.Idle) {
    return "stand around";
  }
  if (task.type === AiTaskType.Satisfy) {
    const plan = isJsonObject(data["plan"]) ? data["plan"] : {};
    const verb =
      plan["kind"] === "sleep" ? "sleep" : `consume ${String(plan["materialId"] ?? "?")}`;
    return `${verb} for ${String(plan["needId"] ?? "?")} (${task.phase})`;
  }
  return `${task.type} (${task.phase})`;
}

/**
 * Describes the current action of an entity: its highest-priority top-level task, or `idle`.
 *
 * @param entity - The entity.
 * @returns A short sentence fragment.
 */
export function describeCurrentAction(entity: Entity): string {
  const queue = getComponent(entity, taskQueueComponent);
  const top = (queue?.tasks ?? [])
    .filter((task) => task.parentId === null && task.status !== TaskStatus.Completed)
    .reduce<TaskRecord | null>(
      (best, task) => (best === null || task.priority > best.priority ? task : best),
      null,
    );
  return top === null ? "idle" : describeTask(top);
}

/**
 * Builds the `needs-of` view of an entity.
 *
 * @param engine - The engine.
 * @param entity - The entity.
 * @returns The view, or null when the entity has no `Needs`.
 */
export function buildNeedsView(engine: GameEngine, entity: Entity): NeedsView | null {
  const needs = getComponent(entity, needsComponent);
  if (needs === undefined) {
    return null;
  }
  const decision = buildDecisionContext(engine.content, entity, engine.time.tickCount);
  return {
    entityId: entity.id,
    needs: needs.values.map((value) => {
      const content = engine.content.needs.require(value.needId);
      return {
        needId: value.needId,
        name: content.name,
        valueMilli: value.valueMilli,
        percent: floorDiv(value.valueMilli, 1000),
        critical: value.valueMilli <= content.criticalThreshold,
      };
    }),
    moodMilli: getComponent(entity, moodComponent)?.valueMilli ?? decision.moodMilli,
    riskSuccessPermille: decision.riskSuccessPermille,
    healthMilli: getComponent(entity, healthComponent)?.valueMilli ?? 0,
    role: roleOf(engine.content, entity),
    priorityOrder: needPriorityOrder(engine.content, entity),
    coins: decision.coins,
    wealth: decision.wealth,
    action: describeCurrentAction(entity),
  };
}
