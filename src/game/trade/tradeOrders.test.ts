import { describe, expect, it } from "vitest";
import { findPosting } from "../jobs/jobBoards";
import { debit } from "../inventory/inventoryMoney";
import { grantRefinedCredit, topUpRefinedStash } from "./refinedLedger";
import { createTradeWorld } from "./testTradeWorld";
import type { TradeTestWorld } from "./testTradeWorld";
import {
  OrderWait,
  cancelTradeOrder,
  createTradeOrder,
  isStockRace,
  jobTypeOfDirection,
  orderWait,
  postTradeJobs,
  recordTrip,
  recordTripFailure,
} from "./tradeOrders";
import { getTradeService } from "./tradeServiceRegistry";
import { TradeErrorKind } from "./TradeError";
import { treasuryBalance, treasuryEntity } from "./treasury";
import {
  OrderDirection,
  OrderStatus,
  cancelledByPlayerReason,
  maxOrderFailures,
  orderCancelledEvent,
  orderCompletedEvent,
  orderCreatedEvent,
  tooManyFailuresReason,
  tradeBuyJobId,
  tradeSellJobId,
} from "./tradeTypes";

function setup(): { world: TradeTestWorld; traderId: number } {
  const world = createTradeWorld();
  return { world, traderId: world.trader(0).id };
}

const sell = (world: TradeTestWorld, traderId: number, quantity = 10) =>
  createTradeOrder(world.engine, traderId, OrderDirection.Sell, "iron_ore", quantity, 5);

describe("jobTypeOfDirection", () => {
  it("maps a sale to trade.sell and a purchase to trade.buy", () => {
    expect(jobTypeOfDirection(OrderDirection.Sell)).toBe(tradeSellJobId);
    expect(jobTypeOfDirection(OrderDirection.Buy)).toBe(tradeBuyJobId);
  });
});

describe("createTradeOrder", () => {
  it("creates an open order for goods the trader wants and queues trade.order.created", () => {
    const { world, traderId } = setup();
    const seen = world.record(orderCreatedEvent);
    const order = sell(world, traderId);
    world.engine.bus.processQueue();
    expect(order).toMatchObject({
      orderId: 1,
      direction: OrderDirection.Sell,
      materialId: "iron_ore",
      quantity: 10,
      remaining: 10,
      status: OrderStatus.Open,
      traderPrototypeId: "trader_caravan",
    });
    expect(seen.at(-1)).toMatchObject({ orderId: 1, direction: "Sell", reason: null });
  });

  it("refuses an entity that is no trader, a trader that left, bad quantities and unknown goods", () => {
    const { world, traderId } = setup();
    const settler = world.settler(4);
    expect(() => sell(world, settler.id)).toThrow(/UnknownTrader/);
    expect(() => sell(world, 9999)).toThrow(/UnknownTrader/);
    expect(() => sell(world, traderId, 0)).toThrow(/positive integer/);
    expect(() =>
      createTradeOrder(world.engine, traderId, OrderDirection.Sell, "nope", 1, 0),
    ).toThrow();
    world.engine.store.requestDelete(traderId);
    expect(() => sell(world, traderId)).toThrow(/TraderAbsent/);
  });

  it("refuses to sell what the trader does not buy and to buy what it does not sell", () => {
    const { world, traderId } = setup();
    expect(() =>
      createTradeOrder(world.engine, traderId, OrderDirection.Sell, "nails", 1, 0),
    ).toThrow(new RegExp(TradeErrorKind.NotWanted));
    expect(() =>
      createTradeOrder(world.engine, traderId, OrderDirection.Buy, "bread", 1, 0),
    ).toThrow(new RegExp(TradeErrorKind.NotSold));
    expect(() =>
      createTradeOrder(world.engine, traderId, OrderDirection.Buy, "nails", 61, 0),
    ).toThrow(new RegExp(TradeErrorKind.InsufficientStock));
    expect(
      createTradeOrder(world.engine, traderId, OrderDirection.Buy, "nails", 60, 0).remaining,
    ).toBe(60);
  });

  it("caps a purchase of a refined good at the credit (D-13: exactly the credit, not more)", () => {
    const { world, traderId } = setup();
    const trader = world.engine.store.require(traderId);
    expect(() =>
      createTradeOrder(world.engine, traderId, OrderDirection.Buy, "iron_ingot", 1, 0),
    ).toThrow(new RegExp(TradeErrorKind.RefinedCreditExhausted));
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 10 }]);
    expect(() =>
      createTradeOrder(world.engine, traderId, OrderDirection.Buy, "iron_ingot", 6, 0),
    ).toThrow(new RegExp(TradeErrorKind.RefinedCreditExhausted));
    expect(
      createTradeOrder(world.engine, traderId, OrderDirection.Buy, "iron_ingot", 5, 0).quantity,
    ).toBe(5);
  });
});

describe("recordTrip, recordTripFailure, cancelTradeOrder", () => {
  it("books trips, completes the order at zero and queues trade.order.completed", () => {
    const { world, traderId } = setup();
    const done = world.record(orderCompletedEvent);
    const order = sell(world, traderId);
    recordTrip(world.engine, order.orderId, 6, 14, 20);
    expect(getTradeService(world.engine).findOrder(order.orderId)).toMatchObject({
      remaining: 4,
      coins: 14,
      status: OrderStatus.Open,
    });
    recordTrip(world.engine, order.orderId, 4, 9, 30);
    world.engine.bus.processQueue();
    expect(getTradeService(world.engine).findOrder(order.orderId)).toMatchObject({
      remaining: 0,
      coins: 23,
      status: OrderStatus.Done,
      finishedTick: 30,
    });
    expect(done).toHaveLength(1);
    recordTrip(world.engine, order.orderId, 1, 1, 31);
    recordTrip(world.engine, 77, 1, 1, 31);
  });

  it("cancels an order after three failed trips, but not over a stock race", () => {
    const { world, traderId } = setup();
    const cancelled = world.record(orderCancelledEvent);
    const order = sell(world, traderId);
    expect(isStockRace("insufficient-stock")).toBe(true);
    expect(isStockRace("stock-changed")).toBe(true);
    expect(isStockRace("price-too-high")).toBe(false);
    expect(isStockRace(null)).toBe(false);
    for (let failure = 1; failure < maxOrderFailures; failure += 1) {
      recordTripFailure(world.engine, order.orderId, 10);
    }
    expect(getTradeService(world.engine).findOrder(order.orderId)?.failures).toBe(2);
    recordTrip(world.engine, order.orderId, 1, 2, 11);
    expect(getTradeService(world.engine).findOrder(order.orderId)?.failures).toBe(0);
    for (let failure = 0; failure < maxOrderFailures; failure += 1) {
      recordTripFailure(world.engine, order.orderId, 12);
    }
    world.engine.bus.processQueue();
    expect(getTradeService(world.engine).findOrder(order.orderId)).toMatchObject({
      status: OrderStatus.Cancelled,
      reason: tooManyFailuresReason,
    });
    expect(cancelled).toHaveLength(1);
    recordTripFailure(world.engine, order.orderId, 13);
    recordTripFailure(world.engine, 99, 13);
  });

  it("is cancelled by the player together with its open trade job", () => {
    const { world, traderId } = setup();
    world.give(world.chest(5), "iron_ore", 4);
    const order = sell(world, traderId);
    postTradeJobs(world.engine, 1);
    const posting = getTradeService(world.engine).findOrder(order.orderId)?.postingId ?? 0;
    expect(findPosting(world.engine, posting)).not.toBeNull();
    cancelTradeOrder(world.engine, order.orderId, cancelledByPlayerReason, 2);
    expect(findPosting(world.engine, posting)).toBeNull();
    expect(getTradeService(world.engine).findOrder(order.orderId)).toMatchObject({
      status: OrderStatus.Cancelled,
      reason: cancelledByPlayerReason,
      postingId: null,
    });
    expect(() => cancelTradeOrder(world.engine, order.orderId, "x", 3)).toThrow(/OrderClosed/);
    expect(() => cancelTradeOrder(world.engine, 55, "x", 3)).toThrow(/UnknownOrder/);
  });
});

describe("orderWait", () => {
  it("names what keeps an order from posting a trip", () => {
    const { world, traderId } = setup();
    const trader = world.engine.store.require(traderId);
    const order = sell(world, traderId);
    expect(orderWait(world.engine, order)).toBe(OrderWait.NoStock);
    world.give(world.chest(5), "iron_ore", 1);
    expect(orderWait(world.engine, order)).toBeNull();
    const buy = createTradeOrder(world.engine, traderId, OrderDirection.Buy, "nails", 5, 0);
    expect(orderWait(world.engine, buy)).toBeNull();
    const treasury = treasuryEntity(world.engine);
    if (treasury !== null) {
      debit(
        { materials: world.engine.materials, actor: null },
        treasury,
        treasuryBalance(world.engine),
      );
    }
    expect(orderWait(world.engine, buy)).toBe(OrderWait.NoMoney);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 2 }]);
    const ingots = createTradeOrder(world.engine, traderId, OrderDirection.Buy, "iron_ingot", 1, 0);
    expect(orderWait(world.engine, ingots)).toBe(OrderWait.TraderSoldOut);
    topUpRefinedStash(world.engine, trader);
    expect(orderWait(world.engine, ingots)).toBe(OrderWait.NoMoney);
    world.engine.store.requestDelete(traderId);
    expect(orderWait(world.engine, order)).toBe(OrderWait.NoTrader);
  });
});

describe("postTradeJobs", () => {
  it("posts one trip while the trader is there and goods exist, and not twice", () => {
    const { world, traderId } = setup();
    const order = sell(world, traderId);
    postTradeJobs(world.engine, 1);
    expect(getTradeService(world.engine).findOrder(order.orderId)?.postingId).toBeNull();
    world.give(world.chest(5), "iron_ore", 3);
    postTradeJobs(world.engine, 2);
    const posting = getTradeService(world.engine).findOrder(order.orderId)?.postingId ?? 0;
    const found = findPosting(world.engine, posting);
    expect(found?.posting).toMatchObject({
      jobTypeId: tradeSellJobId,
      target: { entityId: traderId, materialId: "iron_ore" },
    });
    postTradeJobs(world.engine, 3);
    expect(getTradeService(world.engine).findOrder(order.orderId)?.postingId).toBe(posting);
  });

  it("forgets a posting that is gone and posts the next trip", () => {
    const { world, traderId } = setup();
    world.give(world.chest(5), "iron_ore", 3);
    const order = sell(world, traderId);
    postTradeJobs(world.engine, 1);
    const first = getTradeService(world.engine).findOrder(order.orderId)?.postingId ?? 0;
    const found = findPosting(world.engine, first);
    expect(found).not.toBeNull();
    // The posting leaves the board (cancelled by another system): the order posts a new trip.
    const board = world.engine.store.require(world.boardId).components["JobBoard"] as {
      postings: { id: number }[];
    };
    board.postings = board.postings.filter((posting) => posting.id !== first);
    postTradeJobs(world.engine, 2);
    expect(getTradeService(world.engine).findOrder(order.orderId)?.postingId).toBeNull();
    postTradeJobs(world.engine, 3);
    const second = getTradeService(world.engine).findOrder(order.orderId)?.postingId ?? 0;
    expect(second).toBeGreaterThan(first);
  });

  it("posts a purchase trip for a trader that has the goods and a treasury that can pay", () => {
    const { world, traderId } = setup();
    const order = createTradeOrder(world.engine, traderId, OrderDirection.Buy, "nails", 20, 0);
    postTradeJobs(world.engine, 1);
    const posting = getTradeService(world.engine).findOrder(order.orderId)?.postingId ?? 0;
    expect(findPosting(world.engine, posting)?.posting.jobTypeId).toBe(tradeBuyJobId);
  });
});
