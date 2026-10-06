import { z } from "zod";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { canStore, getTotal } from "../inventory/inventoryQueries";
import { childCompleted, registerJobType } from "../jobs/jobExecutor";
import type { ActiveJob, JobExecutor } from "../jobs/jobExecutor";
import { approachFailedReason, targetInvalidReason } from "../jobs/jobTypes";
import type { JobOutput } from "../jobs/jobTypes";
import { noCapacityReason } from "../storage/storageTypes";
import { doneStep, failStep } from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { negotiate } from "./tradeOffers";
import { isStockRace, recordTrip, recordTripFailure } from "./tradeOrders";
import {
  handInCoins,
  orderOfJob,
  placeOf,
  postDeliveryHaul,
  traderOfJob,
  walkTo,
} from "./tradeJobSupport";
import { quoteTrade, sellableQuantity } from "./tradeQuotes";
import {
  OrderDirection,
  maxTradeApproaches,
  nothingToTradeReason,
  tradeBuyJobId,
  tradeFailedReason,
  traderGoneReason,
} from "./tradeTypes";
import { payFromTreasury, treasuryBalance } from "./treasury";

const walkPhase = "to-trader";

const buyStateSchema = z
  .object({
    postingId: z.number().int().min(1),
    claimId: z.number().int().min(1),
    purse: z.number().int().min(0).default(0),
    quantity: z.number().int().min(0).default(0),
    approaches: z.number().int().min(0).default(0),
    bought: z.number().int().min(0).default(0),
  })
  .strict();

type BuyState = z.infer<typeof buyStateSchema>;

function readState(data: JsonValue): BuyState {
  return buyStateSchema.parse(data);
}

function writeState(context: TaskContext, state: BuyState): void {
  context.task.data = { ...state };
}

function returnPurse(engine: GameEngine, context: TaskContext, state: BuyState): void {
  if (state.purse > 0) {
    handInCoins(engine, context.entity, state.purse);
    state.purse = 0;
    writeState(context, state);
  }
}

function giveUp(
  engine: GameEngine,
  context: TaskContext,
  state: BuyState,
  reason: string,
): StepResult {
  returnPurse(engine, context, state);
  return failStep(reason);
}

function buy(
  engine: GameEngine,
  context: TaskContext,
  state: BuyState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const order = orderOfJob(engine, job);
  const trader = traderOfJob(engine, job);
  if (order === null || trader === null) {
    return giveUp(engine, context, state, traderGoneReason);
  }
  const result = negotiate(
    engine,
    {
      buyerId: context.entityId,
      sellerId: trader.id,
      requested: [{ materialId, quantity: state.quantity }],
      offered: [],
      coins: quoteTrade(engine, trader, OrderDirection.Buy, materialId, state.quantity).coins ?? 0,
    },
    state.purse,
    context.tick,
  );
  if (!result.completed) {
    if (!isStockRace(result.reason)) {
      recordTripFailure(engine, order.orderId, context.tick);
    }
    return giveUp(engine, context, state, tradeFailedReason);
  }
  state.purse -= result.coins;
  state.bought = state.quantity;
  returnPurse(engine, context, state);
  writeState(context, state);
  recordTrip(engine, order.orderId, state.quantity, result.coins, context.tick);
  return doneStep();
}

function approachTrader(
  engine: GameEngine,
  context: TaskContext,
  state: BuyState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const trader = traderOfJob(engine, job);
  const place = trader === null ? null : placeOf(trader);
  const here = placeOf(context.entity);
  if (trader === null || place === null || here === null || place.mapId !== here.mapId) {
    return giveUp(engine, context, state, traderGoneReason);
  }
  if (place.cellIndex !== here.cellIndex) {
    state.approaches += 1;
    if (state.approaches > maxTradeApproaches) {
      return giveUp(engine, context, state, approachFailedReason);
    }
    writeState(context, state);
    return walkTo(context, walkPhase, place.mapId, place.cellIndex);
  }
  return buy(engine, context, state, job, materialId);
}

function begin(engine: GameEngine, context: TaskContext, job: ActiveJob): StepResult {
  const order = orderOfJob(engine, job);
  const materialId = job.posting.target.materialId;
  const trader = traderOfJob(engine, job);
  if (order === null || materialId === null) {
    return failStep(targetInvalidReason);
  }
  if (trader === null) {
    return failStep(traderGoneReason);
  }
  const state = readState(context.task.data);
  const room = canStore(engine.materials, context.entity, materialId, order.remaining).maxFittable;
  let quantity = Math.min(order.remaining, sellableQuantity(engine, trader, materialId), room);
  if (quantity < 1) {
    return failStep(room < 1 ? noCapacityReason : nothingToTradeReason);
  }
  let coins = quoteTrade(engine, trader, OrderDirection.Buy, materialId, quantity).coins;
  while (quantity > 1 && (coins === null || coins > treasuryBalance(engine))) {
    quantity -= 1;
    coins = quoteTrade(engine, trader, OrderDirection.Buy, materialId, quantity).coins;
  }
  if (coins === null || coins > treasuryBalance(engine)) {
    return failStep(nothingToTradeReason);
  }
  if (coins > 0 && !payFromTreasury(engine, context.entityId, coins)) {
    return failStep(nothingToTradeReason);
  }
  state.purse = coins;
  state.quantity = quantity;
  writeState(context, state);
  return approachTrader(engine, context, state, job, materialId);
}

/**
 * Builds the executor of `trade.buy` (plan 4.1): one trip of an order that buys goods from a
 * trader. The settler takes the price of as many units as the order, the trader's stock (and for a
 * refined good the credit, D-13), its own inventory and the treasury allow, out of the treasury,
 * walks to the trader (phase `to-trader`) and negotiates; the trader asks its price (multiplier,
 * agreement discount, scarcity premium, margin) and counters when the price moved (the settler
 * pays up to the coins it carries). A completed purchase draws the refined credit down, the
 * leftover coins go back to the treasury, the goods are in the settler's inventory and a
 * `haul.deliver` job takes them to storage. A failed or cancelled trip gives all coins back.
 * Failure reasons: `target_invalid`, `trader_gone`, `nothing_to_trade`, `no_capacity`,
 * `approach_failed`, `trade_failed` (counted on the order).
 *
 * @param engine - The engine.
 * @returns An executor for `registerJobType`.
 */
export function createBuyExecutor(engine: GameEngine): JobExecutor {
  return {
    requires: ["Position", "Inventory"],
    start: (context, job) => begin(engine, context, job),
    step: (context, record, job) => {
      const materialId = job.posting.target.materialId;
      const state = readState(record.data);
      if (materialId === null || orderOfJob(engine, job) === null) {
        return giveUp(engine, context, state, targetInvalidReason);
      }
      if (!childCompleted(record)) {
        return giveUp(engine, context, state, approachFailedReason);
      }
      return approachTrader(engine, context, state, job, materialId);
    },
    complete: (context, job): JobOutput[] => {
      const materialId = job.posting.target.materialId;
      if (materialId !== null && getTotal(context.entity, materialId) > 0) {
        postDeliveryHaul(engine, context.entity, materialId, context.tick);
      }
      return [];
    },
    cancel: (context, record) => {
      returnPurse(engine, context, readState(record.data));
    },
  };
}

/**
 * Registers the executor of `trade.buy` with the engine's task handlers (see
 * {@link createBuyExecutor}).
 *
 * @param engine - The engine.
 */
export function registerBuyJob(engine: GameEngine): void {
  registerJobType(engine, tradeBuyJobId, createBuyExecutor(engine));
}
