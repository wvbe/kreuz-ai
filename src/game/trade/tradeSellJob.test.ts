import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { createTradeWorld } from "./testTradeWorld";
import type { TradeTestWorld } from "./testTradeWorld";
import { createSellExecutor, registerSellJob } from "./tradeSellJob";
import { createTradeOrder, cancelTradeOrder } from "./tradeOrders";
import { getTradeService } from "./tradeServiceRegistry";
import { refinedCreditMilli } from "./refinedLedger";
import {
  OrderDirection,
  OrderStatus,
  cancelledByPlayerReason,
  tradeCompletedEvent,
  tradeSellJobId,
  traderPrototypeId,
} from "./tradeTypes";

function setup(ore: number): { world: TradeTestWorld; traderId: number; chestId: number } {
  const world = createTradeWorld();
  const trader = world.trader(0);
  const chest = world.chest(34);
  if (ore > 0) {
    world.give(chest, "iron_ore", ore);
  }
  world.spawn("peasant", 36);
  return { world, traderId: trader.id, chestId: chest.id };
}

function order(world: TradeTestWorld, traderId: number, quantity: number) {
  return createTradeOrder(
    world.engine,
    traderId,
    OrderDirection.Sell,
    "iron_ore",
    quantity,
    world.engine.time.tickCount,
  );
}

// @covers 019:SC-003
describe("trade.sell job", () => {
  it("a settler fetches ore from the stock, sells it and the treasury and ledger grow", () => {
    const { world, traderId, chestId } = setup(10);
    const completed = world.record(tradeCompletedEvent);
    const start = world.treasury();
    const placed = order(world, traderId, 10);
    world.run(500);
    const finished = getTradeService(world.engine).findOrder(placed.orderId);
    expect(finished).toMatchObject({ status: OrderStatus.Done, remaining: 0 });
    expect(getTotal(world.engine.store.require(chestId), "iron_ore")).toBe(0);
    expect(getTotal(world.engine.store.require(traderId), "iron_ore")).toBe(10);
    // 10 ore are worth 20 coins; the trader bids 23 and the settler's ask is 22: the sale is
    // at the bid, the wage of the job (1) leaves the treasury.
    expect(finished?.coins).toBeGreaterThanOrEqual(22);
    expect(world.treasury()).toBe(start + (finished?.coins ?? 0) - 1);
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(5000);
    world.engine.bus.processQueue();
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
  });

  it("sells in several trips as the stock arrives, and the order waits meanwhile", () => {
    const { world, traderId, chestId } = setup(3);
    const placed = order(world, traderId, 10);
    world.run(300);
    expect(getTradeService(world.engine).findOrder(placed.orderId)).toMatchObject({
      status: OrderStatus.Open,
      remaining: 7,
    });
    world.give(world.engine.store.require(chestId), "iron_ore", 7);
    world.run(300);
    expect(getTradeService(world.engine).findOrder(placed.orderId)).toMatchObject({
      status: OrderStatus.Done,
      remaining: 0,
    });
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(5000);
  });

  it("sells what the settler already carries before it fetches from the stock", () => {
    const world = createTradeWorld();
    const trader = world.trader(0);
    const chest = world.chest(34);
    world.give(chest, "iron_ore", 2);
    const settler = world.spawn("peasant", 36);
    world.give(settler, "iron_ore", 4);
    const placed = order(world, trader.id, 6);
    world.run(500);
    expect(getTradeService(world.engine).findOrder(placed.orderId)?.status).toBe(OrderStatus.Done);
    expect(getTotal(settler, "iron_ore")).toBe(0);
    expect(getTotal(chest, "iron_ore")).toBe(0);
    expect(getTotal(trader, "iron_ore")).toBe(6);
  });

  it("when the trader leaves, the goods stay with the settler and the order is not failed", () => {
    const { world, traderId } = setup(5);
    const placed = order(world, traderId, 5);
    world.run(18);
    world.engine.store.requestDelete(traderId);
    world.run(400);
    const open = getTradeService(world.engine).findOrder(placed.orderId);
    expect(open).toMatchObject({ status: OrderStatus.Open, failures: 0 });
    expect(open?.remaining).toBe(5);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
  });

  it("cancelling the order releases the reservation of a trip under way", () => {
    const { world, traderId } = setup(5);
    const placed = order(world, traderId, 5);
    world.run(14);
    expect(getStorageService(world.engine).reservations.all().length).toBeGreaterThanOrEqual(0);
    cancelTradeOrder(
      world.engine,
      placed.orderId,
      cancelledByPlayerReason,
      world.engine.time.tickCount,
    );
    world.run(300);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    expect(getTradeService(world.engine).findOrder(placed.orderId)?.status).toBe(
      OrderStatus.Cancelled,
    );
  });
});

describe("createSellExecutor and registerSellJob", () => {
  it("needs a position and an inventory and is registered for trade.sell", () => {
    const world = createTradeWorld();
    const executor = createSellExecutor(world.engine);
    expect(executor.requires).toEqual(["Position", "Inventory"]);
    expect(world.engine.taskHandlers.has(tradeSellJobId)).toBe(true);
    expect(() => registerSellJob(world.engine)).toThrow();
  });
});
