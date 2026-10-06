import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getBoard } from "../jobs/jobBoards";
import { abandonUpdate } from "./boardUpdates";
import { availableCriers, deliverTaskOf, listCriers, tripToBoard } from "./crierQueries";
import { getCrierService } from "./crierServiceRegistry";
import {
  CrierStatus,
  boardGoneReason,
  crierDispatchedEvent,
  deliverTaskPriority,
  deliverTaskType,
} from "./crierTypes";
import type { CrierDispatched, PendingBoardUpdate } from "./crierTypes";
import { townCrierComponent } from "./townCrierComponent";

// Groups the waiting updates by the entity a crier walks to (the board, or the Notice Post that
// serves it, spec 026 FR-021); the group of the oldest update comes first.
function groupByDestination(
  engine: GameEngine,
  updates: readonly PendingBoardUpdate[],
): Map<EntityId, number[]> {
  const service = getCrierService(engine);
  const groups = new Map<EntityId, number[]>();
  for (const update of updates) {
    const { destinationId } = service.route(update.boardId);
    groups.set(destinationId, [...(groups.get(destinationId) ?? []), update.updateId]);
  }
  return groups;
}

function nearestCrier(
  engine: GameEngine,
  free: readonly Entity[],
  boardId: EntityId,
): { crier: Entity; cost: number } | null {
  let best: { crier: Entity; cost: number } | null = null;
  for (const crier of free) {
    const trip = tripToBoard(engine, crier, boardId);
    if (trip !== null && (best === null || trip.cost < best.cost)) {
      best = { crier, cost: trip.cost };
    }
  }
  return best;
}

/**
 * Sends Town Criers out with the waiting updates (spec 017 FR-011/012, DECISIONS D-12). The
 * waiting updates are grouped by board (the board with the oldest update first); each group goes
 * to the available crier with the cheapest path to the board (ties: lowest id), who takes all of
 * the board's waiting updates at once and gets a `towncrier.deliver` task at priority 80. A
 * crier that is already walking never takes more: new changes wait for the next free one (finite
 * fleet). A board served by a Notice Post (`CrierService.route`) is delivered by walking to the
 * post, and the updates of every board that post serves go in one trip. Updates for a board that
 * no longer exists are abandoned (`board_gone`); updates nobody can reach or no crier is free for
 * simply wait. Queues `towncrier.dispatched`.
 *
 * @param engine - The engine.
 * @param tick - The current tick.
 */
export function dispatchCriers(engine: GameEngine, tick: number): void {
  const service = getCrierService(engine);
  const waiting = service.updates().filter((update) => update.crierId === null);
  let free = availableCriers(engine);
  const live: PendingBoardUpdate[] = [];
  for (const update of waiting) {
    if (getBoard(engine, update.boardId) === null) {
      abandonUpdate(engine, update.updateId, boardGoneReason);
    } else {
      live.push(update);
    }
  }
  for (const [boardId, updateIds] of groupByDestination(engine, live)) {
    const choice = nearestCrier(engine, free, boardId);
    if (choice === null) {
      continue;
    }
    const data = getComponent(choice.crier, townCrierComponent);
    if (data === undefined) {
      continue;
    }
    data.status = CrierStatus.Traveling;
    data.boardQueue = [boardId];
    data.carrying = updateIds;
    service.assign(updateIds, choice.crier.id, tick, choice.cost);
    engine.tasks.enqueue(choice.crier.id, {
      type: deliverTaskType,
      data: { boardId },
      priority: deliverTaskPriority,
    });
    const payload: CrierDispatched = { crierId: choice.crier.id, boardIds: [boardId] };
    engine.bus.emit(crierDispatchedEvent, payload);
    free = free.filter((crier) => crier.id !== choice.crier.id);
  }
}

/**
 * Keeps the crier fleet consistent with its tasks, every tick. A walking crier whose task was
 * interrupted (it stopped to eat) gets a new delivery task; a crier with nothing left to carry
 * becomes available and loses a stale delivery task (recall); loads that name updates which are
 * gone are dropped. A load for a board that was deleted is abandoned (`board_gone`) at once and
 * its crier is free again (a simplification of 017 US6.4: the crier does not walk to the empty
 * spot first).
 *
 * @param engine - The engine.
 */
export function recoverCriers(engine: GameEngine): void {
  const service = getCrierService(engine);
  for (const update of service.updates()) {
    if (update.crierId !== null && getBoard(engine, update.boardId) === null) {
      abandonUpdate(engine, update.updateId, boardGoneReason);
    }
  }
  for (const crier of listCriers(engine)) {
    const data = getComponent(crier, townCrierComponent);
    if (data === undefined) {
      continue;
    }
    data.carrying = data.carrying.filter(
      (updateId) => service.find(updateId)?.crierId === crier.id,
    );
    const task = deliverTaskOf(engine, crier.id);
    if (data.carrying.length === 0) {
      data.status = CrierStatus.Available;
      data.boardQueue = [];
      if (task !== undefined) {
        engine.tasks.cancel(crier.id, task.id);
      }
    } else if (task === undefined) {
      const boardId = data.boardQueue[0];
      if (boardId !== undefined) {
        engine.tasks.enqueue(crier.id, {
          type: deliverTaskType,
          data: { boardId },
          priority: deliverTaskPriority,
        });
      }
    }
  }
}
