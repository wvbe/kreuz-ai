import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { debit } from "../inventory/inventoryMoney";
import { getStorageService } from "../storage/storageServiceRegistry";
import { grantRefinedCredit, refinedCreditMilli, topUpRefinedStash } from "./refinedLedger";
import { createTradeWorld } from "./testTradeWorld";
import type { TradeTestWorld } from "./testTradeWorld";
import { createBuyExecutor, registerBuyJob } from "./tradeBuyJob";
import { cancelTradeOrder, createTradeOrder } from "./tradeOrders";
import { getTradeService } from "./tradeServiceRegistry";
import { treasuryBalance, treasuryEntity } from "./treasury";
import {
  OrderDirection,
  OrderStatus,
  cancelledByPlayerReason,
  tradeBuyJobId,
  traderPrototypeId,
} from "./tradeTypes";

function setup(traderCell = 0): {
  world: TradeTestWorld;
  traderId: number;
  chestId: number;
  workerId: number;
} {
  const world = createTradeWorld();
  const trader = world.trader(traderCell);
  const chest = world.chest(34);
  const worker = world.spawn("peasant", 36);
  return { world, traderId: trader.id, chestId: chest.id, workerId: worker.id };
}

function buy(world: TradeTestWorld, traderId: number, materialId: string, quantity: number) {
  return createTradeOrder(
    world.engine,
    traderId,
    OrderDirection.Buy,
    materialId,
    quantity,
    world.engine.time.tickCount,
  );
}

function drain(world: TradeTestWorld, keep: number): void {
  const treasury = treasuryEntity(world.engine);
  if (treasury !== null) {
    debit(
      { materials: world.engine.materials, actor: null },
      treasury,
      treasuryBalance(world.engine) - keep,
    );
  }
}

describe("trade.buy job", () => {
  // @covers 003:FR-011
  it("a settler buys goods with coins from the treasury and the goods are hauled into storage", () => {
    const { world, traderId, chestId } = setup();
    const start = world.treasury();
    const placed = buy(world, traderId, "nails", 10);
    world.run(500);
    const finished = getTradeService(world.engine).findOrder(placed.orderId);
    expect(finished).toMatchObject({ status: OrderStatus.Done, remaining: 0, coins: 3 });
    expect(world.treasury()).toBe(start - 3 - 1);
    expect(getTotal(world.engine.store.require(traderId), "nails")).toBe(50);
    expect(getTotal(world.engine.store.require(chestId), "nails")).toBe(10);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
  });

  it("buys exactly the refined credit and draws it down (D-13)", () => {
    const { world, traderId, chestId } = setup();
    const trader = world.engine.store.require(traderId);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 10 }]);
    topUpRefinedStash(world.engine, trader);
    expect(getTotal(trader, "iron_ingot")).toBe(5);
    const placed = buy(world, traderId, "iron_ingot", 3);
    world.run(500);
    expect(getTradeService(world.engine).findOrder(placed.orderId)?.status).toBe(OrderStatus.Done);
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(2000);
    expect(getTotal(trader, "iron_ingot")).toBe(2);
    expect(getTotal(world.engine.store.require(chestId), "iron_ingot")).toBe(3);
  });

  it("buys what the treasury can pay and waits with the rest", () => {
    const { world, traderId } = setup();
    drain(world, 12);
    const placed = buy(world, traderId, "iron_hammer", 2);
    world.run(400);
    const open = getTradeService(world.engine).findOrder(placed.orderId);
    expect(open).toMatchObject({ status: OrderStatus.Open, remaining: 1, coins: 9 });
    expect(world.treasury()).toBeLessThan(9);
  });

  it("gives the coins back when the order is cancelled on the way", () => {
    const { world, traderId, workerId } = setup(77);
    const start = world.treasury();
    const placed = buy(world, traderId, "nails", 10);
    for (let tick = 0; tick < 400 && world.coins(workerId) < 3; tick += 1) {
      world.run(1);
    }
    expect(world.coins(workerId)).toBe(3);
    expect(world.treasury()).toBeLessThan(start);
    cancelTradeOrder(
      world.engine,
      placed.orderId,
      cancelledByPlayerReason,
      world.engine.time.tickCount,
    );
    world.run(200);
    expect(world.coins(workerId)).toBe(0);
    expect(world.treasury()).toBe(start);
    expect(getTradeService(world.engine).findOrder(placed.orderId)?.status).toBe(
      OrderStatus.Cancelled,
    );
  });

  it("gives the coins back when the trader leaves before the settler arrives", () => {
    const { world, traderId, workerId } = setup(77);
    const start = world.treasury();
    const placed = buy(world, traderId, "nails", 10);
    for (let tick = 0; tick < 400 && world.coins(workerId) < 3; tick += 1) {
      world.run(1);
    }
    expect(world.coins(workerId)).toBe(3);
    world.engine.store.requestDelete(traderId);
    world.run(300);
    expect(world.coins(workerId)).toBe(0);
    expect(world.treasury()).toBe(start);
    expect(getTradeService(world.engine).findOrder(placed.orderId)).toMatchObject({
      status: OrderStatus.Open,
      remaining: 10,
      failures: 0,
    });
  });
});

describe("createBuyExecutor and registerBuyJob", () => {
  it("needs a position and an inventory and is registered for trade.buy", () => {
    const world = createTradeWorld();
    expect(createBuyExecutor(world.engine).requires).toEqual(["Position", "Inventory"]);
    expect(world.engine.taskHandlers.has(tradeBuyJobId)).toBe(true);
    expect(() => registerBuyJob(world.engine)).toThrow();
  });
});
