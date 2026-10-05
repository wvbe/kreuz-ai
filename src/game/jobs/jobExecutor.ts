import { z } from "zod";
import type { GameEngine } from "../engine/GameEngine";
import { isJsonObject } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import { findPosting } from "./jobBoards";
import { completePosting, failPosting, releasePosting } from "./jobPostings";
import { emitSkillWorkCompleted } from "../skills/skillGrowth";
import { doneStep, failStep } from "../task/stepResults";
import { CancelReason, StepKind, TaskStatus } from "../task/taskTypes";
import type {
  CancelToken,
  StepResult,
  TaskContext,
  TaskHandler,
  TaskRecord,
} from "../task/taskTypes";
import type { JobTypeContent } from "../content/schemas/economySchemas";
import { PostingStatus, postingGoneReason, targetInvalidReason } from "./jobTypes";
import type { JobOutput, JobPosting } from "./jobTypes";

/**
 * The claimed posting a job task works on, with its content record.
 */
export type ActiveJob = {
  posting: JobPosting;
  jobType: JobTypeContent;
};

/**
 * How one job type is executed (task 3.1d hook). The framework wraps it as a `TaskHandler` whose
 * task type is the job type id: it checks on every step that the entity still holds the claim,
 * and turns the executor's outcome into the posting lifecycle (see {@link registerJobType}).
 * Executors keep all progress in `context.task.phase` and `context.task.data` like any handler
 * and never close over state.
 */
export type JobExecutor = {
  /**
   * Component names the worker must keep while the task is alive.
   */
  requires?: string[];
  /**
   * First step, run when the task starts.
   */
  start: (context: TaskContext, job: ActiveJob) => StepResult;
  /**
   * Every later step.
   */
  step: (context: TaskContext, record: TaskRecord, job: ActiveJob) => StepResult;
  /**
   * Runs once when `start` or `step` returned done: applies the effect of the job (terrain
   * change, items into the worker's inventory) and returns the outputs for
   * `jobboard.job.completed`, or null when the target is no longer valid (the posting then fails
   * with `target_invalid` instead of completing).
   */
  complete?: (context: TaskContext, job: ActiveJob) => JobOutput[] | null;
  /**
   * Runs when the task is cancelled (a critical need, the player, deletion), before the claim is
   * released: the place to give back what the job holds, such as a stock reservation. It also
   * gets the cancel token. The executor's own failures must clean up before returning `failStep`.
   */
  cancel?: (context: TaskContext, record: TaskRecord, token: CancelToken) => void;
};

const jobDataSchema = z
  .object({ postingId: z.number().int().min(1), claimId: z.number().int().min(1) })
  .passthrough();

/**
 * Data to enqueue the task of a claimed job: `{ type: posting.jobTypeId, data: jobTaskData(posting),
 * priority: jobTaskPriority }`.
 *
 * @param posting - The claimed posting.
 * @returns JSON for `TaskSystem.enqueue`.
 */
export function jobTaskData(posting: JobPosting): JsonValue {
  return { postingId: posting.id, claimId: posting.claimId };
}

function resolveJob(engine: GameEngine, context: TaskContext, data: JsonValue): ActiveJob | null {
  const parsed = jobDataSchema.parse(data);
  const found = findPosting(engine, parsed.postingId);
  if (
    found === null ||
    found.posting.status !== PostingStatus.Claimed ||
    found.posting.claimantId !== context.entityId ||
    found.posting.claimId !== parsed.claimId
  ) {
    return null;
  }
  const jobType = engine.content.jobs.find(found.posting.jobTypeId);
  return jobType === undefined ? null : { posting: found.posting, jobType };
}

function settle(
  engine: GameEngine,
  executor: JobExecutor,
  context: TaskContext,
  job: ActiveJob,
  result: StepResult,
): StepResult {
  if (result.kind === StepKind.Done) {
    const outputs = executor.complete === undefined ? [] : executor.complete(context, job);
    if (outputs === null) {
      failPosting(engine, job.posting.id, targetInvalidReason, context.tick);
      return failStep(targetInvalidReason);
    }
    completePosting(engine, job.posting.id, context.entityId, outputs, context.tick);
    if (job.jobType.skillId !== null) {
      emitSkillWorkCompleted(engine.bus, context.entityId, job.jobType.skillId);
    }
    return doneStep();
  }
  if (result.kind === StepKind.Fail) {
    if (result.reason === targetInvalidReason) {
      failPosting(engine, job.posting.id, targetInvalidReason, context.tick);
    } else {
      releasePosting(engine, job.posting.id, context.entityId, result.reason, context.tick, true);
    }
  }
  return result;
}

/**
 * Registers the executor of one job type with the engine's task handler registry (the task type
 * is the job type id). Postings of a job type without an executor are never offered to workers.
 * The wrapper gives every job the same lifecycle:
 * - each step first checks that the entity still holds the claim (claim id included); when the
 *   posting was cancelled, failed or taken away the task fails with `posting_gone`;
 * - when the executor is done, `complete` applies the effect, then the posting is completed
 *   (wage paid, `jobboard.job.completed` queued) and `skill.work.completed` is emitted once for
 *   the worker with the job type's skill;
 * - a failed step releases the claim with a back-off (the posting is open again,
 *   `jobboard.job.abandoned`), except `target_invalid` which fails the posting for good;
 * - cancelling the task (a critical need, the player, deletion) runs the executor's `cancel` hook,
 *   then releases the claim, with a back-off only for `unreachable`.
 *
 * @param engine - The engine whose posting store and task handlers are used.
 * @param typeId - Job type id from the content pack.
 * @param executor - The type-specific behaviour.
 */
export function registerJobType(engine: GameEngine, typeId: string, executor: JobExecutor): void {
  const handler: TaskHandler = {
    type: typeId,
    ...(executor.requires === undefined ? {} : { requires: executor.requires }),
    start: (context, data) => {
      const job = resolveJob(engine, context, data);
      return job === null
        ? failStep(postingGoneReason)
        : settle(engine, executor, context, job, executor.start(context, job));
    },
    step: (context, record) => {
      const job = resolveJob(engine, context, record.data);
      return job === null
        ? failStep(postingGoneReason)
        : settle(engine, executor, context, job, executor.step(context, record, job));
    },
    cancel: (context, record, token: CancelToken) => {
      executor.cancel?.(context, record, token);
      const parsed = jobDataSchema.safeParse(record.data);
      if (parsed.success) {
        releasePosting(
          engine,
          parsed.data.postingId,
          context.entityId,
          token.reason,
          context.tick,
          token.reason === CancelReason.Unreachable,
        );
      }
    },
  };
  engine.taskHandlers.register(handler);
}

/**
 * Whether a finished child task completed (used by executors that wait for a `move` child).
 *
 * @param record - The parent's task record, just woken from a child wait.
 * @returns True when the wake carries a completed outcome.
 */
export function childCompleted(record: TaskRecord): boolean {
  const data = record.wake?.data;
  return isJsonObject(data) && data["outcome"] === TaskStatus.Completed;
}
