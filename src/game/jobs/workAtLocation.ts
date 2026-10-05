import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { workDuration } from "../skills/workSpeed";
import {
  childWait,
  continueStep,
  doneStep,
  failStep,
  tickWait,
  waitStep,
} from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { childCompleted } from "./jobExecutor";
import type { ActiveJob, JobExecutor } from "./jobExecutor";
import { approachFailedReason } from "./jobTypes";
import type { JobOutput } from "./jobTypes";

enum WorkPhase {
  Approach = "approach",
  Work = "work",
}

/**
 * Options of {@link createWorkAtLocationExecutor}.
 */
export type WorkAtLocationOptions = {
  /**
   * Duration at skill 0 without traits, whole ticks (at least 1); the real duration is
   * `workDuration(content, worker, jobType, baseTicks)` fixed when the work starts.
   */
  baseTicks: number;
  /**
   * Applies the effect when the work time is over and returns the outputs, or null when the
   * target is no longer valid (the posting then fails with `target_invalid`).
   */
  complete: (engine: GameEngine, context: TaskContext, job: ActiveJob) => JobOutput[] | null;
};

function beginWork(
  engine: GameEngine,
  context: TaskContext,
  job: ActiveJob,
  baseTicks: number,
): StepResult {
  const ticks = workDuration(engine.content, context.entity, job.jobType, baseTicks);
  context.task.phase = WorkPhase.Work;
  return waitStep(tickWait(context.tick + ticks));
}

/**
 * Builds the generic "work at a location" job executor (task 3.1d): the worker walks to the
 * posting's target cell with a `move` child (phase `approach`), works there for
 * `workDuration(content, worker, jobType, baseTicks)` ticks as a serialized tick wait (phase
 * `work`, so a save in the middle resumes exactly) and then `complete` applies the effect. A walk
 * that does not succeed fails with `approach_failed`. Most gathering and building jobs are
 * this shape plus their own effect.
 *
 * @param engine - The engine.
 * @param options - Base duration and the completion effect.
 * @returns An executor for {@link registerJobType}.
 */
export function createWorkAtLocationExecutor(
  engine: GameEngine,
  options: WorkAtLocationOptions,
): JobExecutor {
  return {
    requires: ["Position"],
    start: (context, job) => {
      const position = getComponent(context.entity, positionComponent);
      if (
        position?.mapId === job.posting.target.mapId &&
        position.cellIndex === job.posting.target.cellIndex
      ) {
        return beginWork(engine, context, job, options.baseTicks);
      }
      context.task.phase = WorkPhase.Approach;
      const walk = context.spawnChild(
        AiTaskType.Move,
        moveTaskData(job.posting.target.mapId, job.posting.target.cellIndex),
      );
      return waitStep(childWait(walk));
    },
    step: (context, record, job) => {
      if (record.phase === WorkPhase.Approach) {
        return childCompleted(record)
          ? beginWork(engine, context, job, options.baseTicks)
          : failStep(approachFailedReason);
      }
      return record.wake === null ? continueStep() : doneStep();
    },
    complete: (context, job) => options.complete(engine, context, job),
  };
}
