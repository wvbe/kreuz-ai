import { z } from "zod";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getBoard } from "../jobs/jobBoards";
import { childCompleted } from "../jobs/jobExecutor";
import { positionComponent } from "../map/positionComponent";
import { childWait, doneStep, failStep, waitStep } from "../task/stepResults";
import type { StepResult, TaskContext, TaskHandler, TaskRecord } from "../task/taskTypes";
import { abandonUpdate, applyBoardUpdate } from "./boardUpdates";
import { getCrierService } from "./crierServiceRegistry";
import {
  CrierStatus,
  DeliveryMethod,
  boardGoneReason,
  boardUnreachableReason,
  deliverTaskType,
} from "./crierTypes";
import { townCrierComponent } from "./townCrierComponent";

const deliverDataSchema = z.object({ boardId: z.number().int().min(1) }).strict();

enum DeliverPhase {
  Approach = "approach",
}

function loadOf(engine: GameEngine, crierId: EntityId, boardId: EntityId): number[] {
  const crier = engine.store.get(crierId);
  const data = crier === undefined ? undefined : getComponent(crier, townCrierComponent);
  const service = getCrierService(engine);
  return (data?.carrying ?? []).filter((updateId) => service.find(updateId)?.boardId === boardId);
}

function finishTrip(engine: GameEngine, crierId: EntityId, boardId: EntityId): void {
  const crier = engine.store.get(crierId);
  const data = crier === undefined ? undefined : getComponent(crier, townCrierComponent);
  if (data === undefined) {
    return;
  }
  data.boardQueue = data.boardQueue.filter((queued) => queued !== boardId);
  if (data.boardQueue.length === 0) {
    data.status = CrierStatus.Available;
    data.carrying = [];
  }
}

function deliverOnArrival(engine: GameEngine, context: TaskContext, boardId: EntityId): StepResult {
  for (const updateId of loadOf(engine, context.entityId, boardId)) {
    applyBoardUpdate(engine, updateId, DeliveryMethod.TownCrier);
  }
  finishTrip(engine, context.entityId, boardId);
  return doneStep();
}

function giveUp(
  engine: GameEngine,
  context: TaskContext,
  boardId: EntityId,
  reason: string,
): StepResult {
  for (const updateId of loadOf(engine, context.entityId, boardId)) {
    abandonUpdate(engine, updateId, reason);
  }
  finishTrip(engine, context.entityId, boardId);
  return failStep(reason);
}

/**
 * Builds the handler of the `towncrier.deliver` task (spec 017 FR-011, DECISIONS D-12): a crier
 * with updates on board walks to the board's cell with a `move` child (phase `approach`) and
 * applies every update it carries for that board on arrival (`jobboard.update.applied` with
 * `via: TownCrier`), then is available again. Travel time is the path cost of the walk. When
 * the board is gone (on the way or on arrival) the updates are abandoned (`board_gone`); when the
 * walk fails they are abandoned too (`board_unreachable`). A crier that is interrupted keeps its
 * load; `recoverCriers` gives it a new task. Failure reasons: `board_gone`, `board_unreachable`.
 *
 * @param engine - The engine.
 * @returns The task handler for type `towncrier.deliver`.
 */
export function createDeliverTask(engine: GameEngine): TaskHandler {
  return {
    type: deliverTaskType,
    requires: ["Position"],
    start: (context, data) => {
      const { boardId } = deliverDataSchema.parse(data);
      const board = getBoard(engine, boardId);
      const boardPosition =
        board === null ? undefined : getComponent(board.board, positionComponent);
      if (boardPosition === undefined) {
        return giveUp(engine, context, boardId, boardGoneReason);
      }
      if (loadOf(engine, context.entityId, boardId).length === 0) {
        return doneStep();
      }
      const position = getComponent(context.entity, positionComponent);
      if (
        position?.mapId === boardPosition.mapId &&
        position.cellIndex === boardPosition.cellIndex
      ) {
        return deliverOnArrival(engine, context, boardId);
      }
      context.task.phase = DeliverPhase.Approach;
      const walk = context.spawnChild(
        AiTaskType.Move,
        moveTaskData(boardPosition.mapId, boardPosition.cellIndex),
      );
      return waitStep(childWait(walk));
    },
    step: (context, record: TaskRecord) => {
      const { boardId } = deliverDataSchema.parse(record.data);
      if (getBoard(engine, boardId) === null) {
        return giveUp(engine, context, boardId, boardGoneReason);
      }
      if (loadOf(engine, context.entityId, boardId).length === 0) {
        return doneStep();
      }
      if (!childCompleted(record)) {
        return giveUp(engine, context, boardId, boardUnreachableReason);
      }
      return deliverOnArrival(engine, context, boardId);
    },
    cancel: () => undefined,
  };
}
