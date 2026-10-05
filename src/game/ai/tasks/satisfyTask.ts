import { z } from "zod";
import { getComponent } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { isJsonObject } from "../../ecs/jsonData";
import type { JsonValue } from "../../engine/EventBus";
import { positionComponent } from "../../map/positionComponent";
import { childWait, continueStep, doneStep, failStep, waitStep } from "../../task/stepResults";
import { TaskStatus } from "../../task/taskTypes";
import type { StepResult, TaskContext, TaskHandler } from "../../task/taskTypes";
import { AiTaskType } from "../aiTypes";
import { moveTaskData } from "../movement/moveTask";
import { addMoodInfluenceTo } from "../mood/runMood";
import { consumeNeedItem } from "../needs/consumeNeedItem";
import { adjustNeed, getNeedValue } from "../needs/needAccess";
import { satisfactionAmountMilli } from "../needs/needMath";
import { NeedPlanKind } from "../decision/needPlanTypes";
import type { NeedPlan } from "../decision/needPlanTypes";

/**
 * Failure reason when the item to consume is no longer where the plan expected it.
 */
export const sourceGoneReason = "source_gone";

/**
 * Failure reason when the walk to the source did not succeed.
 */
export const approachFailedReason = "approach_failed";

/**
 * Mood penalty after sleeping on the ground, milli-percent.
 */
export const groundSleepMoodMilli = -4000;

/**
 * How long (ticks) the stiff back lasts.
 */
export const groundSleepMoodTicks = 144;

const planSchema = z
  .object({
    kind: z.nativeEnum(NeedPlanKind),
    needId: z.string().min(1),
    sourceId: z.number().int().min(1).nullable(),
    materialId: z.string().min(1).nullable(),
    mapId: z.number().int().min(1),
    cellIndex: z.number().int().min(0),
    amountMilli: z.number().int().min(0),
  })
  .strict();

const satisfyDataSchema = z.object({ plan: planSchema }).strict();

enum SatisfyPhase {
  Approach = "approach",
  Act = "act",
  Sleep = "sleep",
}

/**
 * Data to enqueue an `ai.satisfy` task.
 *
 * @param plan - The plan chosen by the decision.
 * @returns JSON for `TaskSystem.enqueue`.
 */
export function satisfyTaskData(plan: NeedPlan): JsonValue {
  return { plan: { ...plan } };
}

function consume(engine: GameEngine, context: TaskContext, plan: NeedPlan): StepResult {
  const holder = plan.sourceId === null ? undefined : context.store.get(plan.sourceId);
  if (
    holder === undefined ||
    plan.materialId === null ||
    !consumeNeedItem(
      engine,
      context.entity,
      holder,
      plan.needId,
      plan.materialId,
      plan.amountMilli,
      context.tick,
    )
  ) {
    return failStep(sourceGoneReason);
  }
  return doneStep();
}

function sleep(engine: GameEngine, context: TaskContext, plan: NeedPlan): StepResult {
  context.task.phase = SatisfyPhase.Sleep;
  adjustNeed(
    context.entity,
    plan.needId,
    satisfactionAmountMilli(engine.content, context.entity, plan.needId, plan.amountMilli),
  );
  const level = getNeedValue(context.entity, plan.needId) ?? 0;
  if (level < engine.content.constants.sleepWakeThreshold) {
    return continueStep();
  }
  if (plan.sourceId === null) {
    addMoodInfluenceTo(
      context.entity,
      "slept_on_ground",
      groundSleepMoodMilli,
      context.tick + groundSleepMoodTicks,
      context.tick,
    );
  }
  return doneStep();
}

function act(engine: GameEngine, context: TaskContext, plan: NeedPlan): StepResult {
  context.task.phase = SatisfyPhase.Act;
  return plan.kind === NeedPlanKind.Consume
    ? consume(engine, context, plan)
    : sleep(engine, context, plan);
}

function approach(engine: GameEngine, context: TaskContext, plan: NeedPlan): StepResult {
  const position = getComponent(context.entity, positionComponent);
  if (position?.mapId === plan.mapId && position.cellIndex === plan.cellIndex) {
    return act(engine, context, plan);
  }
  context.task.phase = SatisfyPhase.Approach;
  const walk = context.spawnChild(AiTaskType.Move, moveTaskData(plan.mapId, plan.cellIndex));
  return waitStep(childWait(walk));
}

/**
 * Builds the handler of the `ai.satisfy` task (spec 013 FR-002): carries out a {@link NeedPlan}.
 * It first walks to the plan's cell with a `move` child task (phase `approach`), then acts. A
 * `Consume` plan takes one item out of the source's inventory and satisfies the need at once
 * (`need.item.consumed`); a `Sleep` plan raises the need every tick (`amountMilli` combined with
 * trait bonuses) until it reaches `sleepWakeThreshold`, sleeping on the ground adds a short mood
 * penalty. Failure reasons: `approach_failed`, `source_gone`.
 *
 * @param engine - The engine.
 * @returns The task handler for type `ai.satisfy`.
 */
export function createSatisfyTask(engine: GameEngine): TaskHandler {
  return {
    type: AiTaskType.Satisfy,
    requires: ["Needs", "Position"],
    start: (context, data) => approach(engine, context, satisfyDataSchema.parse(data).plan),
    step: (context, record) => {
      const plan = satisfyDataSchema.parse(record.data).plan;
      const wake = record.wake;
      const outcome = wake !== null && isJsonObject(wake.data) ? wake.data["outcome"] : null;
      if (record.phase === SatisfyPhase.Approach && outcome !== TaskStatus.Completed) {
        return failStep(approachFailedReason);
      }
      return act(engine, context, plan);
    },
    cancel: () => undefined,
  };
}
