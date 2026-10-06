import type { GameEngine } from "../engine/GameEngine";
import { orderBlockers, explainOrder } from "../production/productionBlockers";
import { capableWorkstations, isRecipeLocked } from "../production/productionQueries";
import { OrderStatus } from "../production/productionTypes";
import type { ProductionOrder } from "../production/productionTypes";
import { makeReason, sortReasons } from "../status/reasons";
import { fromProductionReasons } from "../status/providers/productionReasons";
import { BlockedReasonKind, StatusSubjectKind } from "../status/statusTypes";
import type { Reason } from "../status/statusTypes";
import { getCrierService } from "../crier/crierServiceRegistry";
import { findSeat } from "./findSeat";
import { runStatus } from "./ownedRuns";
import { resolvePostingBoard } from "./resolveBoard";
import { getStandingService } from "./standingServiceRegistry";
import { RunStatus, StandingOrderScope, StandingOrderState } from "./standingTypes";
import type { StandingOrder } from "./standingTypes";

// A stand-in production order, to ask what keeps a run of the recipe from starting.
function probeOrder(order: StandingOrder): ProductionOrder {
  return {
    orderId: 0,
    workstationId: 0,
    recipeId: order.recipeId,
    quantity: 1,
    remaining: 1,
    priority: order.priority,
    status: OrderStatus.Active,
    postingId: null,
    createdTick: 0,
  };
}

// What keeps the runs of an order from making progress: the reasons of its open production orders,
// else of the recipe on the first workstation that could make it.
function productionReasons(engine: GameEngine, order: StandingOrder): Reason[] {
  const service = getStandingService(engine);
  for (const run of service.runsOf(order.orderId)) {
    if (run.productionOrderId !== null && runStatus(engine, run) === RunStatus.Open) {
      const reasons = fromProductionReasons(explainOrder(engine, run.productionOrderId).reasons);
      if (reasons.length > 0) {
        return reasons;
      }
    }
  }
  const recipe = engine.content.recipes.find(order.recipeId);
  const station = capableWorkstations(engine, order.recipeId)[0];
  if (recipe === undefined) {
    return [];
  }
  if (station === undefined) {
    return [
      makeReason(BlockedReasonKind.MissingWorkstation, { workstationTag: recipe.workstationTag }),
    ];
  }
  return fromProductionReasons(orderBlockers(engine, station, probeOrder(order)));
}

// A missing input that another standing order makes is not "without a producer": point at it.
function withStandingProducer(engine: GameEngine, order: StandingOrder, reason: Reason): Reason {
  if (reason.kind !== BlockedReasonKind.MissingInput) {
    return reason;
  }
  const materialId = reason.params["materialId"];
  const maker = getStandingService(engine).state.orders.find(
    (candidate) =>
      candidate.orderId !== order.orderId &&
      !candidate.deleted &&
      !candidate.paused &&
      candidate.materialId === materialId,
  );
  return maker === undefined
    ? reason
    : makeReason(
        reason.kind,
        { ...reason.params, noProducer: false },
        { kind: StatusSubjectKind.StandingOrder, id: maker.orderId },
      );
}

/**
 * Why a standing order does not progress (spec 026 FR-025, spec 025), by the 025 precedence, the
 * first is the primary reason. A paused order reports only `Paused {standingOrderId}`. Otherwise:
 * `NoSeatOfGovernment`, `NoSteward`, `LockedByTier` (the recipe), `ScopeZoneMissing`,
 * `NoReachableJobBoard` (no user-managed board to post on), `AwaitingTownCrier` (a run waits
 * for a crier), and, while the order restocks, what production reports for its runs or for the
 * recipe: `MissingInput`, `MissingWorkstation`, `NoQualifiedWorker`, `MissingTool`, `MissingRoom`,
 * `OutputBlocked`. A missing input that another standing order produces points at that order.
 * Pure: it reads state only.
 *
 * @param engine - The engine.
 * @param order - The order.
 * @returns The reasons, empty when nothing blocks the order.
 */
export function standingReasons(engine: GameEngine, order: StandingOrder): Reason[] {
  if (order.paused) {
    return [makeReason(BlockedReasonKind.Paused, { standingOrderId: order.orderId })];
  }
  const service = getStandingService(engine);
  const reasons: Reason[] = [];
  if (findSeat(engine) === null) {
    reasons.push(makeReason(BlockedReasonKind.NoSeatOfGovernment));
  }
  if (service.state.stewardEntityId === null) {
    reasons.push(makeReason(BlockedReasonKind.NoSteward));
  }
  const recipe = engine.content.recipes.find(order.recipeId);
  if (recipe !== undefined && isRecipeLocked(engine, recipe)) {
    reasons.push(
      makeReason(BlockedReasonKind.LockedByTier, {
        contentKind: "recipe",
        contentId: recipe.id,
        requiredTier: recipe.unlockTier ?? "",
      }),
    );
  }
  if (
    order.scope === StandingOrderScope.Zone &&
    (order.zoneId === null || engine.store.get(order.zoneId) === undefined)
  ) {
    reasons.push(makeReason(BlockedReasonKind.ScopeZoneMissing, { zoneId: order.zoneId }));
  }
  if (resolvePostingBoard(engine, order) === null) {
    reasons.push(makeReason(BlockedReasonKind.NoReachableJobBoard));
  }
  const waiting = service
    .runsOf(order.orderId)
    .find(
      (run) =>
        run.updateId !== null && getCrierService(engine).find(run.updateId)?.crierId === null,
    );
  if (waiting !== undefined) {
    reasons.push(makeReason(BlockedReasonKind.AwaitingTownCrier, { boardId: waiting.boardId }));
  }
  const producing = order.restocking || service.runsOf(order.orderId).length > 0;
  if (producing) {
    reasons.push(
      ...productionReasons(engine, order).map((reason) =>
        withStandingProducer(engine, order, reason),
      ),
    );
  }
  return sortReasons(reasons);
}

/**
 * The derived state of an order (spec 026 FR-001, D-19): `Paused` first, then `Blocked` while a
 * reason other than `Paused` exists, else `Restocking` or `Satisfied` from the saved hysteresis
 * bit.
 *
 * @param order - The order.
 * @param reasons - Its {@link standingReasons}.
 * @returns The state.
 */
export function standingState(
  order: StandingOrder,
  reasons: readonly Reason[],
): StandingOrderState {
  if (order.paused) {
    return StandingOrderState.Paused;
  }
  if (reasons.length > 0) {
    return StandingOrderState.Blocked;
  }
  return order.restocking ? StandingOrderState.Restocking : StandingOrderState.Satisfied;
}
