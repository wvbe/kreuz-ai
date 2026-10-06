import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { childCompleted } from "../jobs/jobExecutor";
import { positionComponent } from "../map/positionComponent";
import { childWait, doneStep, failStep, tickWait, waitStep } from "../task/stepResults";
import type { StepResult, TaskContext, TaskHandler } from "../task/taskTypes";
import { findSeat } from "./findSeat";
import { audienceTaskType } from "./standingTypes";

enum AudiencePhase {
  Approach = "approach",
  Attend = "attend",
}

/**
 * Failure reason: the Steward cannot walk to the throne room.
 */
export const audienceUnreachableReason = "unreachable";

function attend(engine: GameEngine, context: TaskContext): StepResult {
  context.task.phase = AudiencePhase.Attend;
  return waitStep(tickWait(context.tick + engine.content.constants.stewardAudienceTicks));
}

/**
 * Builds the handler of the task `govern.steward_audience` (spec 026 FR-015, D-19): the Steward
 * walks to the throne room (a `move` child), stays `stewardAudienceTicks` ticks and is done. The
 * task is created by the review at priority 70, so it outranks job work and trips of the Town
 * Crier but never a critical need. Without a seat of government the task ends at once; the review
 * outcome does not depend on the audience. Failure reason: `unreachable`.
 *
 * @param engine - The engine.
 * @returns The task handler for type `govern.steward_audience`.
 */
export function createAudienceTask(engine: GameEngine): TaskHandler {
  return {
    type: audienceTaskType,
    requires: ["Position"],
    start: (context) => {
      const seat = findSeat(engine);
      const here = getComponent(context.entity, positionComponent);
      if (seat === null || here === undefined) {
        return doneStep();
      }
      if (here.mapId === seat.mapId && seat.tiles.includes(here.cellIndex)) {
        return attend(engine, context);
      }
      context.task.phase = AudiencePhase.Approach;
      const walk = context.spawnChild(AiTaskType.Move, moveTaskData(seat.mapId, seat.cellIndex));
      return waitStep(childWait(walk));
    },
    step: (context, record) => {
      if (record.phase === AudiencePhase.Approach) {
        return childCompleted(record)
          ? attend(engine, context)
          : failStep(audienceUnreachableReason);
      }
      return doneStep();
    },
    cancel: () => undefined,
  };
}
