import { ticksPerDay } from "../time/GameTime";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { listNoticePosts } from "./deliveryRouting";
import { countStock } from "./countStock";
import { findSeat } from "./findSeat";
import { runStatus } from "./ownedRuns";
import { resolvePostingBoard } from "./resolveBoard";
import { getStandingService } from "./standingServiceRegistry";
import { standingReasons, standingState } from "./standingReasons";
import { RunStatus } from "./standingTypes";
import type { StandingOrder, StandingOrderScope, StandingOrderState } from "./standingTypes";

/**
 * One reason as the queries show it: kind and params (never text).
 */
export type ReasonView = {
  readonly kind: string;
  readonly params: { readonly [name: string]: JsonValue };
};

/**
 * One owned run (query `standing-order`).
 */
export type RunView = {
  readonly runId: number;
  readonly status: RunStatus;
  readonly boardId: EntityId;
  readonly updateId: number | null;
  readonly productionOrderId: number | null;
};

/**
 * One standing order (query `standing-orders`, spec 026 FR-005): its fields, the derived state,
 * the counted stock, the runs by status and the primary blocked reason.
 */
export type StandingOrderView = {
  readonly orderId: number;
  readonly materialId: string;
  readonly recipeId: string;
  readonly targetQuantity: number;
  readonly restockThreshold: number;
  readonly scope: StandingOrderScope;
  readonly zoneId: EntityId | null;
  readonly priority: number;
  readonly postingBoardId: EntityId | null;
  readonly paused: boolean;
  readonly state: StandingOrderState;
  readonly outputPerRun: number;
  readonly countedStock: number;
  readonly pendingAdd: number;
  readonly open: number;
  readonly claimed: number;
  readonly blocked: ReasonView | null;
};

/**
 * The detail of one order (query `standing-order`): the summary plus every reason, the board its
 * runs go to and each run.
 */
export type StandingOrderDetail = StandingOrderView & {
  readonly reasons: readonly ReasonView[];
  readonly resolvedBoardId: EntityId | null;
  readonly runs: readonly RunView[];
};

/**
 * The Steward's office (query `steward`).
 */
export type StewardView = {
  readonly stewardEntityId: EntityId | null;
  readonly stewardBoardId: EntityId | null;
  readonly seatZoneId: EntityId | null;
  readonly lastReviewTick: number | null;
  /**
   * The tick of the next daily review.
   */
  readonly nextReviewTick: number;
  readonly extraReviewRequested: boolean;
  readonly orders: number;
  readonly noticePosts: readonly EntityId[];
};

function reasonView(reason: { kind: string; params: { [name: string]: JsonValue } }): ReasonView {
  return { kind: reason.kind, params: reason.params };
}

/**
 * Builds the view of one order.
 *
 * @param engine - The engine.
 * @param order - The order.
 * @returns The view with the derived state and the stock counted now.
 */
export function buildOrderView(engine: GameEngine, order: StandingOrder): StandingOrderView {
  const service = getStandingService(engine);
  const reasons = standingReasons(engine, order);
  const counts = { [RunStatus.PendingAdd]: 0, [RunStatus.Open]: 0, [RunStatus.Claimed]: 0 };
  for (const run of service.runsOf(order.orderId)) {
    counts[runStatus(engine, run)] += 1;
  }
  const primary = reasons[0];
  return {
    orderId: order.orderId,
    materialId: order.materialId,
    recipeId: order.recipeId,
    targetQuantity: order.targetQuantity,
    restockThreshold: order.restockThreshold,
    scope: order.scope,
    zoneId: order.zoneId,
    priority: order.priority,
    postingBoardId: order.postingBoardId,
    paused: order.paused,
    state: standingState(order, reasons),
    outputPerRun: order.outputPerRun,
    countedStock: countStock(engine, order),
    pendingAdd: counts[RunStatus.PendingAdd],
    open: counts[RunStatus.Open],
    claimed: counts[RunStatus.Claimed],
    blocked: primary === undefined || order.paused ? null : reasonView(primary),
  };
}

/**
 * The live orders, ascending by id (query `standing-orders`).
 *
 * @param engine - The engine.
 * @returns One view per order that is not deleted.
 */
export function buildOrderViews(engine: GameEngine): StandingOrderView[] {
  return getStandingService(engine)
    .state.orders.filter((order) => !order.deleted)
    .map((order) => buildOrderView(engine, order));
}

/**
 * One order with its reasons and runs (query `standing-order {id}`).
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @returns The detail, or null for an unknown or deleted order.
 */
export function buildOrderDetail(engine: GameEngine, orderId: number): StandingOrderDetail | null {
  const service = getStandingService(engine);
  const order = service.find(orderId);
  if (order === undefined || order.deleted) {
    return null;
  }
  return {
    ...buildOrderView(engine, order),
    reasons: standingReasons(engine, order).map(reasonView),
    resolvedBoardId: resolvePostingBoard(engine, order),
    runs: service.runsOf(orderId).map((run) => ({
      runId: run.runId,
      status: runStatus(engine, run),
      boardId: run.boardId,
      updateId: run.updateId,
      productionOrderId: run.productionOrderId,
    })),
  };
}

/**
 * The Steward's office (query `steward`, spec 026 FR-005).
 *
 * @param engine - The engine.
 * @returns The office, the seat, the review times and the Notice Posts.
 */
export function buildStewardView(engine: GameEngine): StewardView {
  const state = getStandingService(engine).state;
  const tick = engine.time.tickCount;
  const slot = engine.content.constants.stewardReviewTickOfDay;
  const today = tick - (tick % ticksPerDay) + slot;
  return {
    stewardEntityId: state.stewardEntityId,
    stewardBoardId: state.stewardBoardId,
    seatZoneId: findSeat(engine)?.zoneId ?? null,
    lastReviewTick: state.lastReviewTick,
    nextReviewTick: today > tick ? today : today + ticksPerDay,
    extraReviewRequested: state.extraReviewAfterTick !== null,
    orders: state.orders.filter((order) => !order.deleted).length,
    noticePosts: listNoticePosts(engine).map((post) => post.id),
  };
}
