import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { isRecipeLocked } from "../production/productionQueries";
import { countStock } from "./countStock";
import { findSeat } from "./findSeat";
import { desiredRuns, HysteresisEvent, stepHysteresis } from "./hysteresis";
import { queueRun, withdrawable, withdrawRun } from "./ownedRuns";
import { resolvePostingBoard } from "./resolveBoard";
import { getStandingService } from "./standingServiceRegistry";
import {
  audienceTaskPriority,
  audienceTaskType,
  restockStartedEvent,
  reviewCompletedEvent,
  reviewSkippedEvent,
  ReviewSkipReason,
  standingSatisfiedEvent,
  StandingOrderScope,
} from "./standingTypes";
import type {
  RestockStarted,
  ReviewCompleted,
  ReviewSkipped,
  StandingOrder,
  StandingSatisfied,
} from "./standingTypes";

type Tally = { queued: number; withdrawn: number };

// Takes back unclaimed runs, in withdrawal order, until `keep` runs are left or none can go.
function trimTo(engine: GameEngine, order: StandingOrder, keep: number, tally: Tally): void {
  const service = getStandingService(engine);
  for (const run of withdrawable(engine, order.orderId)) {
    if (service.runsOf(order.orderId).length <= keep) {
      return;
    }
    if (withdrawRun(engine, run)) {
      tally.withdrawn += 1;
    }
  }
}

function zoneMissing(engine: GameEngine, order: StandingOrder): boolean {
  return (
    order.scope === StandingOrderScope.Zone &&
    (order.zoneId === null || engine.store.get(order.zoneId) === undefined)
  );
}

// One order of the review (spec 026 FR-010, FR-019): hysteresis, the wanted number of runs, the
// board, the runs that must go and the runs that must come.
function reviewOrder(engine: GameEngine, order: StandingOrder, tally: Tally): void {
  const service = getStandingService(engine);
  const recipe = engine.content.recipes.find(order.recipeId);
  if (order.paused || zoneMissing(engine, order)) {
    trimTo(engine, order, 0, tally);
    return;
  }
  if (recipe === undefined || isRecipeLocked(engine, recipe)) {
    return;
  }
  const stock = countStock(engine, order);
  const step = stepHysteresis(
    order.restocking,
    stock,
    order.targetQuantity,
    order.restockThreshold,
  );
  order.restocking = step.restocking;
  if (step.event === HysteresisEvent.Started) {
    const payload: RestockStarted = {
      orderId: order.orderId,
      stock,
      target: order.targetQuantity,
    };
    engine.bus.emit(restockStartedEvent, payload);
  } else if (step.event === HysteresisEvent.Satisfied) {
    const payload: StandingSatisfied = { orderId: order.orderId, stock };
    engine.bus.emit(standingSatisfiedEvent, payload);
  }
  const wanted = desiredRuns(
    order.restocking,
    stock,
    order.targetQuantity,
    order.outputPerRun,
    engine.content.constants.maxOpenRunsPerOrder,
  );
  const board = resolvePostingBoard(engine, order);
  if (board !== null) {
    // The board changed: unclaimed runs on another board are withdrawn and posted again here.
    for (const run of withdrawable(engine, order.orderId)) {
      if (run.boardId !== board && withdrawRun(engine, run)) {
        tally.withdrawn += 1;
      }
    }
  }
  const owned = service.runsOf(order.orderId).length;
  if (owned > wanted) {
    trimTo(engine, order, wanted, tally);
  } else if (board !== null) {
    for (let missing = wanted - owned; missing > 0; missing -= 1) {
      if (queueRun(engine, order, board) !== null) {
        tally.queued += 1;
      }
    }
  }
}

function startAudience(engine: GameEngine, stewardId: number): void {
  const steward = engine.store.get(stewardId);
  if (steward === undefined || getComponent(steward, positionComponent) === undefined) {
    return;
  }
  const queue = engine.tasks.getQueue(stewardId);
  if (queue?.tasks.some((task) => task.type === audienceTaskType) === true) {
    return;
  }
  engine.tasks.enqueue(stewardId, {
    type: audienceTaskType,
    data: {},
    priority: audienceTaskPriority,
  });
}

/**
 * The review of the Steward (spec 026 FR-008, FR-010, FR-011, FR-014, FR-015): with a Steward and
 * an active throne room, the Steward gets the audience task and every order is evaluated in
 * priority order (highest first, then lowest id): the hysteresis step with its events, the
 * wanted number of runs, withdrawals of unclaimed runs (pending adds first, then open runs,
 * newest first; claimed runs never) and new runs queued on the resolved board. Paused orders
 * only withdraw. No Steward or no seat of government skips the review and leaves the runs alone.
 * Queues `steward.review.completed` or `steward.review.skipped`. No randomness.
 *
 * @param engine - The engine.
 * @param tick - The current tick.
 * @returns True when the review ran.
 */
export function runStewardReview(engine: GameEngine, tick: number): boolean {
  const service = getStandingService(engine);
  const state = service.state;
  const stewardId = state.stewardEntityId;
  const seat = findSeat(engine);
  if (stewardId === null || seat === null) {
    const payload: ReviewSkipped = {
      tick,
      reason: stewardId === null ? ReviewSkipReason.NoSteward : ReviewSkipReason.NoSeatOfGovernment,
    };
    engine.bus.emit(reviewSkippedEvent, payload);
    return false;
  }
  startAudience(engine, stewardId);
  const tally: Tally = { queued: 0, withdrawn: 0 };
  const ordered = state.orders
    .filter((order) => !order.deleted)
    .sort((left, right) => right.priority - left.priority || left.orderId - right.orderId);
  let evaluated = 0;
  for (const order of ordered) {
    reviewOrder(engine, order, tally);
    if (!order.paused) {
      evaluated += 1;
    }
  }
  state.lastReviewTick = tick;
  const payload: ReviewCompleted = {
    tick,
    ordersEvaluated: evaluated,
    postingsQueued: tally.queued,
    withdrawalsQueued: tally.withdrawn,
  };
  engine.bus.emit(reviewCompletedEvent, payload);
  return true;
}
