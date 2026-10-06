import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { activePostingsOfType, findPosting } from "../jobs/jobBoards";
import { cancelPosting, postJob } from "../jobs/jobPostings";
import { PostingStatus } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { stockOf } from "../storage/storageQueries";
import { nearestRunningBoard } from "../storage/haulPoster";
import { refinedAllowance } from "./refinedLedger";
import { quoteTrade, sellableQuantity } from "./tradeQuotes";
import { getTradeService } from "./tradeServiceRegistry";
import { TradeError, TradeErrorKind } from "./TradeError";
import { treasuryBalance } from "./treasury";
import {
  ExecutionFailure,
  OrderDirection,
  RejectReason,
  OrderStatus,
  maxOrderFailures,
  orderCancelledEvent,
  orderCompletedEvent,
  orderCreatedEvent,
  tooManyFailuresReason,
  tradeBuyJobId,
  tradeSellJobId,
} from "./tradeTypes";
import type { OrderEvent, TradeOrder } from "./tradeTypes";
import { traderComponent } from "./traderComponent";
import { presentTrader } from "./traderVisits";

function describe(order: TradeOrder, reason: string | null): OrderEvent {
  return {
    orderId: order.orderId,
    traderPrototypeId: order.traderPrototypeId,
    direction: order.direction,
    materialId: order.materialId,
    quantity: order.quantity,
    reason,
  };
}

/**
 * The job type that works orders of a direction.
 *
 * @param direction - Sell or Buy.
 * @returns The job type id.
 */
export function jobTypeOfDirection(direction: OrderDirection): string {
  return direction === OrderDirection.Sell ? tradeSellJobId : tradeBuyJobId;
}

/**
 * Creates a trade order (the commands `TradeSell` and `TradeBuy`, plan 4.1): the settlement wants
 * to sell or buy a quantity of one material with a kind of trader. The trader must be at the
 * market now; a sale needs a trader that wants the material, a purchase one that sells it, and a
 * purchase of a refined good may not exceed the refined credit (`RefinedCreditExhausted`, D-13).
 * Settlers then carry the goods in trips while the trader is there; the order outlives the visit.
 *
 * @param engine - The engine.
 * @param traderId - A trader entity that is at the market.
 * @param direction - From the settlement's side.
 * @param materialId - The material.
 * @param quantity - Total units, at least 1.
 * @param tick - The current tick.
 * @returns A copy of the new order.
 */
export function createTradeOrder(
  engine: GameEngine,
  traderId: number,
  direction: OrderDirection,
  materialId: string,
  quantity: number,
  tick: number,
): TradeOrder {
  const trader = engine.store.get(traderId);
  const data = trader === undefined ? undefined : getComponent(trader, traderComponent);
  if (trader === undefined || data === undefined) {
    throw new TradeError(TradeErrorKind.UnknownTrader, `entity ${traderId} is not a trader`);
  }
  if (presentTrader(engine, trader.prototype)?.id !== trader.id) {
    throw new TradeError(TradeErrorKind.TraderAbsent, `trader ${traderId} is not at the market`);
  }
  engine.materials.require(materialId);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new TradeError(TradeErrorKind.InvalidItems, "quantity must be a positive integer");
  }
  if (direction === OrderDirection.Sell && !data.buys.includes(materialId)) {
    throw new TradeError(TradeErrorKind.NotWanted, `trader ${traderId} does not buy ${materialId}`);
  }
  if (direction === OrderDirection.Buy) {
    const allowance = refinedAllowance(engine, trader, materialId);
    if (allowance !== null && quantity > allowance) {
      throw new TradeError(
        TradeErrorKind.RefinedCreditExhausted,
        `the refined credit for ${materialId} covers ${allowance}, ${quantity} asked`,
      );
    }
    if (allowance === null && quantity > sellableQuantity(engine, trader, materialId)) {
      throw new TradeError(
        sellableQuantity(engine, trader, materialId) < 1
          ? TradeErrorKind.NotSold
          : TradeErrorKind.InsufficientStock,
        `trader ${traderId} has ${sellableQuantity(engine, trader, materialId)} ${materialId}, ${quantity} asked`,
      );
    }
  }
  const order = getTradeService(engine).addOrder({
    traderPrototypeId: trader.prototype,
    direction,
    materialId,
    quantity,
    tick,
  });
  engine.bus.emit(orderCreatedEvent, describe(order, null));
  return order;
}

function finish(
  engine: GameEngine,
  order: TradeOrder,
  status: OrderStatus,
  reason: string | null,
  tick: number,
  endJob: boolean,
): void {
  const found = order.postingId === null ? null : findPosting(engine, order.postingId);
  if (endJob && found !== null && found.posting.status === PostingStatus.Open) {
    // A claimed trip is left to its settler: its next step sees that the order is closed, gives
    // back what it holds and fails (the poster pass then cancels the released posting).
    cancelPosting(engine, found.posting.id, "order_closed", tick);
  }
  const closed: TradeOrder = {
    ...order,
    status,
    postingId: null,
    finishedTick: tick,
    reason,
  };
  getTradeService(engine).putOrder(closed);
  engine.bus.emit(
    status === OrderStatus.Done ? orderCompletedEvent : orderCancelledEvent,
    describe(closed, reason),
  );
}

/**
 * Cancels an open order and its open trade job (`CancelTradeOrder`). Goods a settler already
 * carries stay with it and are hauled home by the haul poster; coins it carries go back to the
 * treasury when the job is cancelled.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @param reason - Why (`cancelled_by_player`, `too_many_failures`).
 * @param tick - The current tick.
 */
export function cancelTradeOrder(
  engine: GameEngine,
  orderId: number,
  reason: string,
  tick: number,
): void {
  const order = getTradeService(engine).findOrder(orderId);
  if (order === null) {
    throw new TradeError(TradeErrorKind.UnknownOrder, `order ${orderId} does not exist`);
  }
  if (order.status !== OrderStatus.Open) {
    throw new TradeError(TradeErrorKind.OrderClosed, `order ${orderId} is already ${order.status}`);
  }
  finish(engine, order, OrderStatus.Cancelled, reason, tick, true);
}

/**
 * Books the result of one trip (called by the trade jobs): `quantity` units moved for `coins`
 * coins. A fulfilled order is closed (`trade.order.completed`); a successful trip resets the
 * failure count.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @param quantity - Units traded on the trip.
 * @param coins - Coins earned (sell) or spent (buy) on the trip.
 * @param tick - The current tick.
 */
export function recordTrip(
  engine: GameEngine,
  orderId: number,
  quantity: number,
  coins: number,
  tick: number,
): void {
  const order = getTradeService(engine).findOrder(orderId);
  if (order === null || order.status !== OrderStatus.Open) {
    return;
  }
  const next: TradeOrder = {
    ...order,
    remaining: Math.max(0, order.remaining - quantity),
    coins: order.coins + coins,
    failures: 0,
  };
  if (next.remaining === 0) {
    finish(engine, next, OrderStatus.Done, null, tick, false);
  } else {
    getTradeService(engine).putOrder(next);
  }
}

/**
 * Whether a refusal only means the goods moved meanwhile (somebody else took them, a hauler
 * reserved them): the trip is simply tried again and does not count as a failure of the order.
 *
 * @param reason - The reason of a failed negotiation.
 * @returns True for `insufficient-stock` and `stock-changed`.
 */
export function isStockRace(reason: string | null): boolean {
  return reason === RejectReason.InsufficientStock || reason === ExecutionFailure.StockChanged;
}

/**
 * Books a failed trip (the trade was refused or failed): after `maxOrderFailures` in a row the
 * order is cancelled with `too_many_failures`.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @param tick - The current tick.
 */
export function recordTripFailure(engine: GameEngine, orderId: number, tick: number): void {
  const order = getTradeService(engine).findOrder(orderId);
  if (order === null || order.status !== OrderStatus.Open) {
    return;
  }
  const next: TradeOrder = { ...order, failures: order.failures + 1 };
  if (next.failures >= maxOrderFailures) {
    finish(engine, next, OrderStatus.Cancelled, tooManyFailuresReason, tick, false);
  } else {
    getTradeService(engine).putOrder(next);
  }
}

/**
 * Why an open order has no trade job right now, or null when one may be posted. The enum value is
 * shown by the `trade-orders` query.
 */
export enum OrderWait {
  NoTrader = "NoTrader",
  NoStock = "NoStock",
  NoMoney = "NoMoney",
  TraderSoldOut = "TraderSoldOut",
  NoBoard = "NoBoard",
}

/**
 * What stops an open order from posting its next trip, or null when nothing does.
 *
 * @param engine - The engine.
 * @param order - The order.
 * @returns The reason, or null.
 */
export function orderWait(engine: GameEngine, order: TradeOrder): OrderWait | null {
  const trader = presentTrader(engine, order.traderPrototypeId);
  if (trader === null) {
    return OrderWait.NoTrader;
  }
  if (order.direction === OrderDirection.Sell) {
    return stockOf(engine, order.materialId).available < 1 ? OrderWait.NoStock : null;
  }
  if (sellableQuantity(engine, trader, order.materialId) < 1) {
    return OrderWait.TraderSoldOut;
  }
  const unit = quoteTrade(engine, trader, OrderDirection.Buy, order.materialId, 1).coins;
  return unit === null || treasuryBalance(engine) < unit ? OrderWait.NoMoney : null;
}

function postTrip(
  engine: GameEngine,
  order: TradeOrder,
  trader: Entity,
  tick: number,
): number | null {
  const place = getComponent(trader, positionComponent);
  const boardId = nearestRunningBoard(engine, trader);
  if (place === undefined || boardId === null) {
    return null;
  }
  return postJob(
    engine,
    boardId,
    {
      jobTypeId: jobTypeOfDirection(order.direction),
      target: {
        mapId: place.mapId,
        cellIndex: place.cellIndex,
        entityId: trader.id,
        materialId: order.materialId,
      },
    },
    tick,
  ).id;
}

/**
 * The order pass (slot 10): an open trade job whose order is closed or gone is cancelled, an open
 * order whose trade job is gone loses the link; an order
 * without a job posts one trip while its trader is at the market, the settlement has the goods
 * (sell) or the trader has them and the treasury the coins (buy). System postings go to the
 * nearest running board at once (D-08).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 */
export function postTradeJobs(engine: GameEngine, tick: number): void {
  const service = getTradeService(engine);
  for (const jobTypeId of [tradeSellJobId, tradeBuyJobId]) {
    for (const posting of activePostingsOfType(engine, jobTypeId)) {
      if (posting.status === PostingStatus.Open && service.orderOfPosting(posting.id) === null) {
        cancelPosting(engine, posting.id, "order_closed", tick);
      }
    }
  }
  for (const order of service.orders()) {
    if (order.status !== OrderStatus.Open) {
      continue;
    }
    if (order.postingId !== null && findPosting(engine, order.postingId) === null) {
      service.putOrder({ ...order, postingId: null });
      continue;
    }
    const trader = presentTrader(engine, order.traderPrototypeId);
    if (order.postingId !== null || trader === null || orderWait(engine, order) !== null) {
      continue;
    }
    const postingId = postTrip(engine, order, trader, tick);
    if (postingId !== null) {
      service.putOrder({ ...order, postingId });
    }
  }
}
