import { z } from "zod";
import { continueStep, doneStep, tickWait, waitStep } from "../../task/stepResults";
import type { TaskHandler } from "../../task/taskTypes";
import { AiTaskType } from "../aiTypes";
import type { JsonValue } from "../../engine/EventBus";

const idleDataSchema = z.object({ ticks: z.number().int().min(1) }).strict();

/**
 * Data to enqueue an `ai.idle` task: stand still for a number of ticks.
 *
 * @param ticks - How long to stand (at least 1).
 * @returns JSON for `TaskSystem.enqueue`.
 */
export function idleTaskData(ticks: number): JsonValue {
  return { ticks };
}

/**
 * Builds the handler of the `ai.idle` task: waits until `tick + ticks` (a serialized
 * `UntilTick` wait, so a save in the middle resumes) and finishes.
 *
 * @returns The task handler for type `ai.idle`.
 */
export function createIdleTask(): TaskHandler {
  return {
    type: AiTaskType.Idle,
    start: (context, data) => {
      const { ticks } = idleDataSchema.parse(data);
      context.task.phase = "stand";
      return waitStep(tickWait(context.tick + ticks));
    },
    step: (context) => (context.task.wake === null ? continueStep() : doneStep()),
    cancel: () => undefined,
  };
}
