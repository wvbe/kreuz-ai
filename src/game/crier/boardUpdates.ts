import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getBoard, requireBoard } from "../jobs/jobBoards";
import { JobError, JobErrorKind } from "../jobs/JobError";
import { cancelPosting, modifyPosting, postJob, validatePostable } from "../jobs/jobPostings";
import { JobBoardMode } from "../jobs/jobTypes";
import { getCrierService } from "./crierServiceRegistry";
import {
  BoardChangeKind,
  CrierStatus,
  changeRejectedReason,
  updateAbandonedEvent,
  updateAppliedEvent,
  updateQueuedEvent,
} from "./crierTypes";
import type {
  BoardChange,
  DeliveryMethod,
  PendingBoardUpdate,
  UpdateAbandoned,
  UpdateApplied,
  UpdateOrigin,
  UpdateQueued,
} from "./crierTypes";
import { townCrierComponent } from "./townCrierComponent";

/**
 * Reason of an abandon event when the player cancels a pending update.
 */
export const cancelledByPlayerReason = "cancelled_by_player";

/**
 * Queues a change for a user-managed board (spec 017 FR-010, DECISIONS D-12). The board keeps its
 * old state until a Town Crier arrives. The change is checked now so the player hears of a bad
 * posting at once: the board must be user-managed (`BoardNotUserManaged`), an `Add` needs a
 * postable job type and a cell on the map, a `Remove` or `Modify` an active posting of that board
 * (`UnknownPosting`). Queues `jobboard.update.queued`; the dispatch pass of the next tick sends a
 * crier.
 *
 * @param engine - The engine.
 * @param boardId - Target board entity id.
 * @param change - What to do on arrival.
 * @param origin - Who asks.
 * @returns A copy of the new pending update.
 */
export function queueBoardUpdate(
  engine: GameEngine,
  boardId: EntityId,
  change: BoardChange,
  origin: UpdateOrigin,
): PendingBoardUpdate {
  const { data } = requireBoard(engine, boardId);
  if (data.mode !== JobBoardMode.UserManaged) {
    throw new JobError(
      JobErrorKind.BoardNotUserManaged,
      `board ${boardId} is system-managed; only a user-managed board takes player changes`,
    );
  }
  if (change.kind === BoardChangeKind.Add) {
    validatePostable(engine, change.jobTypeId, {
      mapId: change.mapId,
      cellIndex: change.cellIndex,
      entityId: change.entityId,
      materialId: change.materialId,
    });
  } else if (!data.postings.some((posting) => posting.id === change.postingId)) {
    throw new JobError(
      JobErrorKind.UnknownPosting,
      `posting ${change.postingId} is not active on board ${boardId}`,
    );
  }
  const update = getCrierService(engine).add(boardId, [change], origin, engine.time.tickCount);
  const payload: UpdateQueued = { updateId: update.updateId, boardId, origin };
  engine.bus.emit(updateQueuedEvent, payload);
  return update;
}

/**
 * Takes an update off the crier that carries it. A crier left with nothing to deliver becomes
 * available again; its walk is cancelled by the next `recoverCriers` pass (the recall of spec
 * 017 US6.5).
 *
 * @param engine - The engine.
 * @param crierId - The carrying crier.
 * @param updateId - The update to drop from its load.
 */
export function detachFromCrier(engine: GameEngine, crierId: EntityId, updateId: number): void {
  const crier = engine.store.get(crierId);
  const data = crier === undefined ? undefined : getComponent(crier, townCrierComponent);
  if (crier === undefined || data === undefined) {
    return;
  }
  data.carrying = data.carrying.filter((carried) => carried !== updateId);
  if (data.carrying.length > 0) {
    return;
  }
  data.status = CrierStatus.Available;
  data.boardQueue = [];
}

/**
 * Drops an update without applying it and queues `jobboard.update.abandoned`.
 *
 * @param engine - The engine.
 * @param updateId - The update.
 * @param reason - Why it is dropped.
 * @returns True when the update existed.
 */
export function abandonUpdate(engine: GameEngine, updateId: number, reason: string): boolean {
  const update = getCrierService(engine).remove(updateId);
  if (update === null) {
    return false;
  }
  if (update.crierId !== null) {
    detachFromCrier(engine, update.crierId, updateId);
  }
  const payload: UpdateAbandoned = { updateId, boardId: update.boardId, reason };
  engine.bus.emit(updateAbandonedEvent, payload);
  return true;
}

/**
 * Cancels a pending update before it is delivered (spec 017 US6.5): the changes are never
 * applied, a crier that carries only this update is recalled. Throws `JobError` `UnknownUpdate`
 * when it is not pending (it may have been delivered meanwhile).
 *
 * @param engine - The engine.
 * @param updateId - The update.
 */
export function cancelBoardUpdate(engine: GameEngine, updateId: number): void {
  if (!abandonUpdate(engine, updateId, cancelledByPlayerReason)) {
    throw new JobError(JobErrorKind.UnknownUpdate, `update ${updateId} is not pending`);
  }
}

function applyChange(engine: GameEngine, boardId: EntityId, change: BoardChange): void {
  const tick = engine.time.tickCount;
  if (change.kind === BoardChangeKind.Add) {
    postJob(
      engine,
      boardId,
      {
        jobTypeId: change.jobTypeId,
        target: {
          mapId: change.mapId,
          cellIndex: change.cellIndex,
          entityId: change.entityId,
          materialId: change.materialId,
        },
        urgent: change.urgent,
        ...(change.priority === null ? {} : { priority: change.priority }),
        ...(change.wage === null ? {} : { wage: change.wage }),
      },
      tick,
    );
  } else if (change.kind === BoardChangeKind.Remove) {
    cancelPosting(engine, change.postingId, "removed_by_player", tick);
  } else {
    modifyPosting(engine, change.postingId, {
      ...(change.priority === null ? {} : { priority: change.priority }),
      ...(change.wage === null ? {} : { wage: change.wage }),
    });
  }
}

/**
 * Applies an update to its board on a crier's arrival (or by another delivery method): every
 * change in order, then queues `jobboard.update.applied {updateId, boardId, via}`. A change that
 * no longer fits (the posting finished meanwhile, the job type got locked) rejects the update:
 * `jobboard.update.abandoned` with reason `change_rejected`, changes before it stay applied.
 *
 * @param engine - The engine.
 * @param updateId - The update to apply.
 * @param via - How it got there.
 * @returns True when every change was applied.
 */
export function applyBoardUpdate(
  engine: GameEngine,
  updateId: number,
  via: DeliveryMethod,
): boolean {
  const update = getCrierService(engine).find(updateId);
  if (update === null) {
    return false;
  }
  if (getBoard(engine, update.boardId) === null) {
    abandonUpdate(engine, updateId, "board_gone");
    return false;
  }
  try {
    for (const change of update.changes) {
      applyChange(engine, update.boardId, change);
    }
  } catch (failure) {
    if (failure instanceof JobError) {
      abandonUpdate(engine, updateId, changeRejectedReason);
      return false;
    }
    throw failure;
  }
  getCrierService(engine).remove(updateId);
  const payload: UpdateApplied = { updateId, boardId: update.boardId, via };
  engine.bus.emit(updateAppliedEvent, payload);
  return true;
}
