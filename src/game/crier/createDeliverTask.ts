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

// What the crier carries (a trip has one destination, so the whole load is for it).
function loadOf(engine: GameEngine, crierId: EntityId): number[] {
  const crier = engine.store.get(crierId);
  const data = crier === undefined ? undefined : getComponent(crier, townCrierComponent);
  const service = getCrierService(engine);
  return (data?.carrying ?? []).filter((updateId) => service.find(updateId)?.crierId === crierId);
}

// A destination that is a board delivers by hand, any other one is a Notice Post.
function viaOf(engine: GameEngine, destinationId: EntityId): DeliveryMethod {
  return getBoard(engine, destinationId) === null
    ? DeliveryMethod.NoticePost
    : DeliveryMethod.TownCrier;
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
  const via = viaOf(engine, boardId);
  for (const updateId of loadOf(engine, context.entityId)) {
    applyBoardUpdate(engine, updateId, via);
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
  const service = getCrierService(engine);
  for (const updateId of loadOf(engine, context.entityId)) {
    const target = service.find(updateId)?.boardId;
    if (reason === boardGoneReason && target !== undefined && getBoard(engine, target) !== null) {
      // The Notice Post vanished but the board is there: the updates wait for the next crier
      // (the board is served by hand again), they are not lost.
      service.unassign([updateId]);
    } else {
      abandonUpdate(engine, updateId, reason);
    }
  }
  finishTrip(engine, context.entityId, boardId);
  return failStep(reason);
}

// Whether the place the crier walks to is still there: a board, or the Notice Post.
function destinationExists(engine: GameEngine, destinationId: EntityId): boolean {
  const entity = engine.store.get(destinationId);
  return (
    entity !== undefined &&
    !engine.store.isPendingDelete(destinationId) &&
    getComponent(entity, positionComponent) !== undefined
  );
}

/**
 * Builds the handler of the `towncrier.deliver` task (spec 017 FR-011, DECISIONS D-12): a crier
 * with updates on board walks to the destination's cell (`boardId` of the task data: the board, or
 * the Notice Post that serves it, spec 026 FR-021) with a `move` child (phase `approach`) and
 * applies every update it carries on arrival (`jobboard.update.applied` with `via: TownCrier` or
 * `NoticePost`), then is available again. A Notice Post that vanished hands the updates back to
 * the queue. Travel time is the path cost of the walk. When
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
      const destination = destinationExists(engine, boardId)
        ? engine.store.get(boardId)
        : undefined;
      const boardPosition =
        destination === undefined ? undefined : getComponent(destination, positionComponent);
      if (boardPosition === undefined) {
        return giveUp(engine, context, boardId, boardGoneReason);
      }
      if (loadOf(engine, context.entityId).length === 0) {
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
      if (!destinationExists(engine, boardId)) {
        return giveUp(engine, context, boardId, boardGoneReason);
      }
      if (loadOf(engine, context.entityId).length === 0) {
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
