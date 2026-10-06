import { ticksPerDay } from "../time/GameTime";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { getCrierService } from "../crier/crierServiceRegistry";
import { listNoticePosts, servingBell, servingPost } from "./deliveryRouting";
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
 * How a pending board update can reach its board besides a Town Crier walking to it (query
 * `pending-routes`, spec 024 FR-032): the Notice Post that serves the board, and the Bell Tower
 * whose next ring applies the update at once.
 */
export type PendingRouteView = {
  readonly updateId: number;
  readonly boardId: EntityId;
  /**
   * The Notice Post a crier carries it to instead of the board, or null.
   */
  readonly noticePostId: EntityId | null;
  /**
   * The Bell Tower zone whose ring reaches the board, or null.
   */
  readonly bellTowerZoneId: EntityId | null;
  /**
   * The tick of that tower's next ring, or null without a tower.
   */
  readonly nextBellRingTick: number | null;
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

/**
 * Builds the `pending-routes` view: for every pending board update the Notice Post that serves
 * its board and the Bell Tower that reaches it, with the tick of the next ring.
 *
 * @param engine - The engine.
 * @returns One row per pending update, in the order of the crier's list.
 */
export function buildPendingRoutes(engine: GameEngine): PendingRouteView[] {
  const tick = engine.time.tickCount;
  const dayStart = tick - (tick % ticksPerDay);
  const rings = [...engine.content.constants.bellRingTicksOfDay].sort(
    (first, second) => first - second,
  );
  const firstToday = rings.find((slot) => dayStart + slot > tick);
  const nextRing =
    firstToday !== undefined
      ? dayStart + firstToday
      : rings[0] === undefined
        ? null
        : dayStart + ticksPerDay + rings[0];
  return getCrierService(engine)
    .updates()
    .map((update) => {
      const tower = servingBell(engine, update.boardId);
      return {
        updateId: update.updateId,
        boardId: update.boardId,
        noticePostId: servingPost(engine, update.boardId),
        bellTowerZoneId: tower === null ? null : tower.zoneId,
        nextBellRingTick: tower === null ? null : nextRing,
      };
    });
}
