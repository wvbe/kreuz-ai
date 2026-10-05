import { z } from "zod";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { positionComponent } from "../map/positionComponent";
import { childWait, doneStep, failStep, waitStep } from "../task/stepResults";
import type { StepResult, TaskContext, TaskHandler } from "../task/taskTypes";
import { claimBestPosting } from "./claimJob";
import { getBoard } from "./jobBoards";
import { jobTaskData, childCompleted } from "./jobExecutor";
import { approachFailedReason, jobTaskPriority, visitTaskType } from "./jobTypes";

/**
 * Failure reason when the board was deleted before the worker got there.
 */
export const boardGoneReason = "board_gone";

const visitDataSchema = z.object({ boardId: z.number().int().min(1) }).strict();

enum VisitPhase {
  Approach = "approach",
}

/**
 * Data to enqueue a `jobboard.visit` task.
 *
 * @param boardId - The board to walk to.
 * @returns JSON for `TaskSystem.enqueue`.
 */
export function visitTaskData(boardId: number): JsonValue {
  return { boardId };
}

function claimOnArrival(engine: GameEngine, context: TaskContext, boardId: number): StepResult {
  const posting = claimBestPosting(engine, context.entity, boardId, context.tick);
  if (posting !== null) {
    engine.tasks.enqueue(context.entityId, {
      type: posting.jobTypeId,
      data: jobTaskData(posting),
      priority: jobTaskPriority,
    });
  }
  return doneStep();
}

/**
 * Builds the handler of the `jobboard.visit` task (spec 017 FR-002): a worker has to be at the
 * board to claim. It walks to the board's cell with a `move` child (phase `approach`) and claims
 * the best posting on arrival (`claimBestPosting`), then enqueues the claimed job's own task at
 * job priority and finishes. Arriving to find nothing left is not a failure; the settler simply
 * decides again. Failure reasons: `board_gone`, `approach_failed`.
 *
 * @param engine - The engine.
 * @returns The task handler for type `jobboard.visit`.
 */
export function createVisitTask(engine: GameEngine): TaskHandler {
  return {
    type: visitTaskType,
    requires: ["Position"],
    start: (context, data) => {
      const { boardId } = visitDataSchema.parse(data);
      const board = getBoard(engine, boardId);
      const boardPosition =
        board === null ? undefined : getComponent(board.board, positionComponent);
      if (boardPosition === undefined) {
        return failStep(boardGoneReason);
      }
      const position = getComponent(context.entity, positionComponent);
      if (
        position?.mapId === boardPosition.mapId &&
        position.cellIndex === boardPosition.cellIndex
      ) {
        return claimOnArrival(engine, context, boardId);
      }
      context.task.phase = VisitPhase.Approach;
      const walk = context.spawnChild(
        AiTaskType.Move,
        moveTaskData(boardPosition.mapId, boardPosition.cellIndex),
      );
      return waitStep(childWait(walk));
    },
    step: (context, record) => {
      if (!childCompleted(record)) {
        return failStep(approachFailedReason);
      }
      return claimOnArrival(engine, context, visitDataSchema.parse(record.data).boardId);
    },
    cancel: () => undefined,
  };
}
