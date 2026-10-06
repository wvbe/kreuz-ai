import { z } from "zod";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { getTotal, canStore } from "../inventory/inventoryQueries";
import { childCompleted, registerJobType } from "../jobs/jobExecutor";
import type { ActiveJob, JobExecutor } from "../jobs/jobExecutor";
import { approachFailedReason, targetInvalidReason } from "../jobs/jobTypes";
import type { JobOutput } from "../jobs/jobTypes";
import { findSources } from "../storage/storageQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind, noCapacityReason, sourceGoneReason } from "../storage/storageTypes";
import { doneStep, failStep } from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { negotiate } from "./tradeOffers";
import { isStockRace, recordTrip, recordTripFailure } from "./tradeOrders";
import { handInCoins, orderOfJob, placeOf, traderOfJob, walkTo } from "./tradeJobSupport";
import { traderBidCoins, traderCeilingCoins, valueOfItemsMilli } from "./tradePricing";
import {
  maxTradeApproaches,
  nothingToTradeReason,
  tradeFailedReason,
  tradeSellJobId,
  traderGoneReason,
} from "./tradeTypes";
import { traderComponent } from "./traderComponent";

enum SellPhase {
  ToSource = "to-source",
  ToTrader = "to-trader",
}

const sellStateSchema = z
  .object({
    postingId: z.number().int().min(1),
    claimId: z.number().int().min(1),
    reservationId: z.number().int().min(1).nullable().default(null),
    carried: z.number().int().min(0).default(0),
    approaches: z.number().int().min(0).default(0),
  })
  .strict();

type SellState = z.infer<typeof sellStateSchema>;

function readState(data: JsonValue): SellState {
  return sellStateSchema.parse(data);
}

function writeState(context: TaskContext, state: SellState): void {
  context.task.data = { ...state };
}

function abort(engine: GameEngine, state: SellState, reason: string): StepResult {
  if (state.reservationId !== null) {
    getStorageService(engine).reservations.release(state.reservationId);
  }
  return failStep(reason);
}

function sell(
  engine: GameEngine,
  context: TaskContext,
  state: SellState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const order = orderOfJob(engine, job);
  const trader = traderOfJob(engine, job);
  const data = trader === null ? undefined : getComponent(trader, traderComponent);
  const quantity = Math.min(state.carried, getTotal(context.entity, materialId));
  if (order === null || trader === null || data === undefined) {
    return failStep(traderGoneReason);
  }
  const value = valueOfItemsMilli(engine.materials, [{ materialId, quantity }]);
  if (quantity < 1 || value === null) {
    return failStep(nothingToTradeReason);
  }
  const result = negotiate(
    engine,
    {
      buyerId: trader.id,
      sellerId: context.entityId,
      requested: [{ materialId, quantity }],
      offered: [],
      coins: traderBidCoins(value, data.buyOfferPermille),
    },
    traderCeilingCoins(value, data.buyCeilingPermille),
    context.tick,
  );
  if (!result.completed) {
    if (!isStockRace(result.reason)) {
      recordTripFailure(engine, order.orderId, context.tick);
    }
    return failStep(tradeFailedReason);
  }
  handInCoins(engine, context.entity, result.coins);
  state.carried = 0;
  writeState(context, state);
  recordTrip(engine, order.orderId, quantity, result.coins, context.tick);
  return doneStep();
}

function approachTrader(
  engine: GameEngine,
  context: TaskContext,
  state: SellState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const trader = traderOfJob(engine, job);
  const place = trader === null ? null : placeOf(trader);
  const here = placeOf(context.entity);
  if (trader === null || place === null || here === null || place.mapId !== here.mapId) {
    return failStep(traderGoneReason);
  }
  if (place.cellIndex !== here.cellIndex) {
    state.approaches += 1;
    if (state.approaches > maxTradeApproaches) {
      return failStep(approachFailedReason);
    }
    writeState(context, state);
    return walkTo(context, SellPhase.ToTrader, place.mapId, place.cellIndex);
  }
  return sell(engine, context, state, job, materialId);
}

function approachSource(
  engine: GameEngine,
  context: TaskContext,
  state: SellState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const reservation =
    state.reservationId === null
      ? null
      : getStorageService(engine).reservations.get(state.reservationId);
  const owner = reservation === null ? undefined : engine.store.get(reservation.inventoryOwnerId);
  const place = owner === undefined ? null : placeOf(owner);
  const here = placeOf(context.entity);
  if (reservation === null || place === null || here === null || place.mapId !== here.mapId) {
    return abort(engine, state, sourceGoneReason);
  }
  if (place.cellIndex !== here.cellIndex) {
    state.approaches += 1;
    if (state.approaches > maxTradeApproaches) {
      return abort(engine, state, approachFailedReason);
    }
    writeState(context, state);
    return walkTo(context, SellPhase.ToSource, place.mapId, place.cellIndex);
  }
  try {
    const moved = getStorageService(engine).reservations.commit(reservation.id, context.entity);
    state.reservationId = null;
    state.carried = moved.quantity;
  } catch {
    return abort(engine, state, sourceGoneReason);
  }
  state.approaches = 0;
  writeState(context, state);
  return approachTrader(engine, context, state, job, materialId);
}

function begin(engine: GameEngine, context: TaskContext, job: ActiveJob): StepResult {
  const order = orderOfJob(engine, job);
  const materialId = job.posting.target.materialId;
  if (order === null || materialId === null) {
    return failStep(targetInvalidReason);
  }
  if (traderOfJob(engine, job) === null) {
    return failStep(traderGoneReason);
  }
  getStorageService(engine).reservations.releaseHolder(context.entityId, ReservationKind.Payment);
  const state = readState(context.task.data);
  const own = Math.min(
    getStorageService(engine).reservations.availableTo(context.entityId, materialId, null),
    order.remaining,
  );
  if (own >= 1) {
    // Goods the settler already carries (fresh from the mine) go straight to the trader.
    state.carried = own;
    writeState(context, state);
    return approachTrader(engine, context, state, job, materialId);
  }
  const source = findSources(engine, context.entity, materialId, order.remaining)[0];
  if (source === undefined) {
    return failStep(nothingToTradeReason);
  }
  const quantity = Math.min(
    source.quantity,
    order.remaining,
    canStore(engine.materials, context.entity, materialId, source.quantity).maxFittable,
  );
  if (quantity < 1) {
    return failStep(noCapacityReason);
  }
  state.reservationId = getStorageService(engine).reservations.reserve({
    kind: ReservationKind.Payment,
    holderId: context.entityId,
    inventoryOwnerId: source.entityId,
    materialId,
    quantity,
  }).id;
  return approachSource(engine, context, state, job, materialId);
}

/**
 * Builds the executor of `trade.sell` (plan 4.1): one trip of an order that sells goods to a
 * trader. The settler:
 * 1. takes what it already carries of the material, or else reserves up to the order's remaining
 *    quantity of the nearest stock (a `Payment` reservation,
 *    as far as it can carry), walks there and moves the goods into its inventory (phase
 *    `to-source`);
 * 2. walks to the trader at the market (phase `to-trader`) and negotiates: the trader bids a
 *    share of the goods' value, counters up to its ceiling (D-12); a completed sale credits the
 *    refined-credit ledger at once (D-13);
 * 3. hands the coins in at the treasury and books the trip on the order.
 *
 * Interrupt safety: the goods are in the stock, under a reservation or in the settler's
 * inventory (and then haulable again); a failed trade leaves them with the settler. Failure
 * reasons: `target_invalid`, `trader_gone`, `nothing_to_trade`, `no_capacity`, `source_gone`,
 * `approach_failed`, `trade_failed` (counted on the order). Progress is in the task record.
 *
 * @param engine - The engine.
 * @returns An executor for `registerJobType`.
 */
export function createSellExecutor(engine: GameEngine): JobExecutor {
  return {
    requires: ["Position", "Inventory"],
    start: (context, job) => begin(engine, context, job),
    step: (context, record, job) => {
      const materialId = job.posting.target.materialId;
      const state = readState(record.data);
      if (materialId === null || orderOfJob(engine, job) === null) {
        return abort(engine, state, targetInvalidReason);
      }
      if (!childCompleted(record)) {
        return abort(engine, state, approachFailedReason);
      }
      return record.phase === SellPhase.ToSource
        ? approachSource(engine, context, state, job, materialId)
        : approachTrader(engine, context, state, job, materialId);
    },
    complete: (): JobOutput[] => [],
    cancel: (_context, record) => {
      const state = readState(record.data);
      if (state.reservationId !== null) {
        getStorageService(engine).reservations.release(state.reservationId);
      }
    },
  };
}

/**
 * Registers the executor of `trade.sell` with the engine's task handlers (see
 * {@link createSellExecutor}).
 *
 * @param engine - The engine.
 */
export function registerSellJob(engine: GameEngine): void {
  registerJobType(engine, tradeSellJobId, createSellExecutor(engine));
}
