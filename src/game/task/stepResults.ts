import type { JsonValue } from "../engine/EventBus";
import { StepKind, WaitKind } from "./taskTypes";
import type { StepResult, TaskId, WaitCondition } from "./taskTypes";

/**
 * Builds the result "run again next tick".
 *
 * @returns A `Continue` step result.
 */
export function continueStep(): StepResult {
  return { kind: StepKind.Continue };
}

/**
 * Builds the result "block until the condition holds".
 *
 * @param until - Serialized wait condition.
 * @returns A `Wait` step result.
 */
export function waitStep(until: WaitCondition): StepResult {
  return { kind: StepKind.Wait, until };
}

/**
 * Builds the result "the task finished successfully".
 *
 * @returns A `Done` step result.
 */
export function doneStep(): StepResult {
  return { kind: StepKind.Done };
}

/**
 * Builds the result "the task failed".
 *
 * @param reason - Short machine readable reason, e.g. `unreachable`.
 * @returns A `Fail` step result.
 */
export function failStep(reason: string): StepResult {
  return { kind: StepKind.Fail, reason };
}

/**
 * Builds a wait condition on a bus event.
 *
 * @param pattern - Event name or wildcard pattern.
 * @param match - Optional top-level payload field that must equal a value.
 * @returns The wait condition.
 */
export function eventWait(
  pattern: string,
  match?: { key: string; value: JsonValue },
): WaitCondition {
  return {
    kind: WaitKind.Event,
    pattern,
    matchKey: match?.key ?? null,
    matchValue: match?.value ?? null,
  };
}

/**
 * Builds a wait condition on a task of the same entity finishing.
 *
 * @param taskId - The task to wait for (usually a child from `spawnChild`).
 * @returns The wait condition.
 */
export function childWait(taskId: TaskId): WaitCondition {
  return { kind: WaitKind.ChildTask, taskId };
}

/**
 * Builds a wait condition on the tick counter.
 *
 * @param tick - First tick at which the task wakes.
 * @returns The wait condition.
 */
export function tickWait(tick: number): WaitCondition {
  return { kind: WaitKind.UntilTick, tick };
}

/**
 * Builds a wait condition on a registered predicate.
 *
 * @param predicateId - Id registered in the `WaitPredicateRegistry`.
 * @param params - JSON parameters handed to the predicate.
 * @returns The wait condition.
 */
export function predicateWait(predicateId: string, params: JsonValue = null): WaitCondition {
  return { kind: WaitKind.Predicate, predicateId, params };
}
