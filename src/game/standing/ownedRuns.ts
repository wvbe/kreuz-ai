import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { abandonUpdate, queueBoardUpdate } from "../crier/boardUpdates";
import { getCrierService } from "../crier/crierServiceRegistry";
import { BoardChangeKind, UpdateOrigin } from "../crier/crierTypes";
import { JobError } from "../jobs/JobError";
import { findPosting } from "../jobs/jobBoards";
import { PostingStatus } from "../jobs/jobTypes";
import { cancelProductionOrder, createProductionOrder } from "../production/productionOrders";
import { ProductionError } from "../production/ProductionError";
import { findOrder } from "../production/productionQueries";
import { OrderStatus } from "../production/productionTypes";
import { getStandingService } from "./standingServiceRegistry";
import { RunStatus } from "./standingTypes";
import type { OwnedRun, StandingOrder } from "./standingTypes";

/**
 * Reason of the abandon event of a run that the Steward took back before it was delivered.
 */
export const runWithdrawnReason = "withdrawn_by_steward";

/**
 * Where a run is (spec 026 FR-009): `PendingAdd` while its update is on a crier's load or in the
 * queue, `Claimed` once a crafter holds the job or the craft runs, `Open` in between.
 *
 * @param engine - The engine.
 * @param run - The run.
 * @returns The status.
 */
export function runStatus(engine: GameEngine, run: OwnedRun): RunStatus {
  if (run.productionOrderId === null) {
    return RunStatus.PendingAdd;
  }
  const found = findOrder(engine, run.productionOrderId);
  if (found === null) {
    return RunStatus.Open;
  }
  if (found.data.craft?.orderId === found.order.orderId) {
    return RunStatus.Claimed;
  }
  const posting =
    found.order.postingId === null ? null : findPosting(engine, found.order.postingId);
  return posting?.posting.status === PostingStatus.Claimed ? RunStatus.Claimed : RunStatus.Open;
}

// A run has ended when its production order is finished (a cancelled order whose craft still runs
// has not) or is gone, or when its update vanished before it was delivered.
function hasEnded(engine: GameEngine, run: OwnedRun): boolean {
  if (run.productionOrderId === null) {
    return run.updateId === null || getCrierService(engine).find(run.updateId) === null;
  }
  const found = findOrder(engine, run.productionOrderId);
  if (found === null) {
    return true;
  }
  const finished =
    found.order.status === OrderStatus.Completed || found.order.status === OrderStatus.Cancelled;
  return finished && found.data.craft?.orderId !== found.order.orderId;
}

/**
 * Drops the runs that are over (spec 026 FR-009): completed, cancelled from outside, lost with
 * their board or crier, or abandoned before delivery.
 *
 * @param engine - The engine.
 * @returns How many runs were dropped.
 */
export function pruneRuns(engine: GameEngine): number {
  const state = getStandingService(engine).state;
  const before = state.runs.length;
  state.runs = state.runs.filter((run) => !hasEnded(engine, run));
  return before - state.runs.length;
}

/**
 * Takes a run back if no crafter has it (spec 026 FR-010, FR-018): a pending add is removed from
 * the crier's load or queue (both vanish, nothing is applied), an open one cancels its production
 * order. A claimed run is never withdrawn.
 *
 * @param engine - The engine.
 * @param run - The run.
 * @returns True when the run was withdrawn (and removed).
 */
export function withdrawRun(engine: GameEngine, run: OwnedRun): boolean {
  const status = runStatus(engine, run);
  if (status === RunStatus.Claimed) {
    return false;
  }
  if (status === RunStatus.PendingAdd) {
    if (run.updateId !== null) {
      abandonUpdate(engine, run.updateId, runWithdrawnReason);
    }
  } else if (run.productionOrderId !== null) {
    cancelProductionOrder(engine, run.productionOrderId);
  }
  const state = getStandingService(engine).state;
  state.runs = state.runs.filter((candidate) => candidate.runId !== run.runId);
  return true;
}

/**
 * The runs of an order that can still be taken back, in withdrawal order (spec 026 FR-010):
 * pending adds first, then open runs, newest (highest run id) first within each.
 *
 * @param engine - The engine.
 * @param orderId - The order.
 * @returns Unclaimed runs.
 */
export function withdrawable(engine: GameEngine, orderId: number): OwnedRun[] {
  const runs = getStandingService(engine)
    .runsOf(orderId)
    .map((run) => ({ run, status: runStatus(engine, run) }))
    .filter((entry) => entry.status !== RunStatus.Claimed);
  const rank = (status: RunStatus): number => (status === RunStatus.PendingAdd ? 0 : 1);
  return runs
    .sort(
      (left, right) => rank(left.status) - rank(right.status) || right.run.runId - left.run.runId,
    )
    .map((entry) => entry.run);
}

/**
 * Queues one new run for an order on a user-managed board: a Steward-origin pending update that a
 * crier (or a Notice Post, or the Bell Tower) delivers (spec 026 FR-018). The run exists at once
 * as `PendingAdd`.
 *
 * @param engine - The engine.
 * @param order - The order.
 * @param boardId - The user-managed board.
 * @returns The new run, or null when the board refused the update.
 */
export function queueRun(
  engine: GameEngine,
  order: StandingOrder,
  boardId: EntityId,
): OwnedRun | null {
  const state = getStandingService(engine).state;
  const run: OwnedRun = {
    runId: state.nextRunId,
    orderId: order.orderId,
    boardId,
    updateId: null,
    productionOrderId: null,
  };
  state.nextRunId += 1;
  state.runs.push(run);
  try {
    run.updateId = queueBoardUpdate(
      engine,
      boardId,
      { kind: BoardChangeKind.Run, runId: run.runId },
      UpdateOrigin.Steward,
    ).updateId;
  } catch (failure) {
    if (failure instanceof JobError) {
      state.runs = state.runs.filter((candidate) => candidate.runId !== run.runId);
      return null;
    }
    throw failure;
  }
  return run;
}

/**
 * What a delivered run does (installed with `CrierService.setRunApplier`): the run becomes a
 * production order of one craft at the workstation `createProductionOrder` picks, with the order's
 * priority (spec 026 FR-012). When no order can be made (no workstation, the recipe got locked)
 * the run is dropped and the delivery is refused.
 *
 * @param engine - The engine.
 * @param runId - The run named by the delivered change.
 * @returns True when the production order was created.
 */
export function applyRun(engine: GameEngine, runId: number): boolean {
  const service = getStandingService(engine);
  const run = service.state.runs.find((candidate) => candidate.runId === runId);
  const order = run === undefined ? undefined : service.find(run.orderId);
  if (run === undefined || order === undefined) {
    return false;
  }
  try {
    const created = createProductionOrder(engine, {
      recipeId: order.recipeId,
      quantity: 1,
      priority: order.priority,
    });
    run.productionOrderId = created.orderId;
    run.updateId = null;
    return true;
  } catch (failure) {
    if (failure instanceof ProductionError) {
      service.state.runs = service.state.runs.filter((candidate) => candidate.runId !== runId);
      return false;
    }
    throw failure;
  }
}
