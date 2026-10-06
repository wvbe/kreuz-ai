import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { merchantComponent } from "./merchantComponent";
import { registerTrade } from "./registerTrade";
import { createTradeWorld } from "./testTradeWorld";
import type { TradeTestWorld } from "./testTradeWorld";
import { getTradeService } from "./tradeServiceRegistry";
import { OfferStatus, OrderStatus, traderLeftEvent } from "./tradeTypes";
import { getTotal } from "../inventory/inventoryQueries";
import { getJobService } from "../jobs/jobServiceRegistry";
import { payWageFromTreasury } from "./treasury";

function setup(): { world: TradeTestWorld; traderId: number; settlerId: number } {
  const world = createTradeWorld();
  const trader = world.trader(3);
  const settler = world.settler(4);
  world.give(settler, "silver_penny", 40);
  return { world, traderId: trader.id, settlerId: settler.id };
}

const propose = (traderId: number, settlerId: number, coins: number) => ({
  buyerId: settlerId,
  sellerId: traderId,
  requested: [{ materialId: "nails", quantity: 10 }],
  offeredCoins: coins,
});

// @covers 019:FR-005 019:FR-008 019:FR-008b 019:FR-010
describe("registerTrade", () => {
  it("is idempotent, returns the engine's service and installs the wage payer", () => {
    const world = createTradeWorld();
    expect(registerTrade(world.engine)).toBe(getTradeService(world.engine));
    expect(getJobService(world.engine).wagePayer()).toBe(payWageFromTreasury);
  });

  it("SetSellsItems and SetPriceMultiplier add the Merchant component to any entity", () => {
    const { world, settlerId } = setup();
    world.command("SetSellsItems", { entityId: settlerId, value: true });
    world.command("SetPriceMultiplier", { entityId: settlerId, multiplierMilli: 1500 });
    expect(getComponent(world.engine.store.require(settlerId), merchantComponent)).toMatchObject({
      sellsItems: true,
      priceMultiplierMilli: 1500,
    });
    expect(() => world.command("SetSellsItems", { entityId: 9999, value: true })).toThrow(
      /UnknownEntity/,
    );
  });

  it("ProposeTrade, AcceptTradeCounter and WithdrawTradeOffer run a negotiation", () => {
    const { world, traderId, settlerId } = setup();
    const low = world.command("ProposeTrade", propose(traderId, settlerId, 2));
    expect(low).toEqual({ offerId: 1 });
    world.run(1);
    expect(world.query("trade-offers")).toMatchObject([
      { offerId: 1, status: OfferStatus.Countered, counterCoins: 3, round: 1 },
    ]);
    expect(world.command("AcceptTradeCounter", { offerId: 1 })).toEqual({ round: 2 });
    world.run(1);
    expect(world.query("trade-offers")).toEqual([]);
    expect(getTotal(world.engine.store.require(settlerId), "nails")).toBe(10);
    const second = world.command("ProposeTrade", propose(traderId, settlerId, 0));
    expect(world.command("WithdrawTradeOffer", second as { offerId: number })).toEqual({
      withdrawn: true,
    });
    expect(() => world.command("WithdrawTradeOffer", { offerId: 99 })).toThrow(/UnknownOffer/);
    expect(() => world.command("AcceptTradeCounter", { offerId: 99 })).toThrow(/UnknownOffer/);
  });

  it("an offer to a seller that does not sell is refused", () => {
    const { world, settlerId } = setup();
    const other = world.settler(6);
    world.command("ProposeTrade", {
      buyerId: settlerId,
      sellerId: other.id,
      requested: [{ materialId: "bread", quantity: 1 }],
      offeredCoins: 3,
    });
    const refused = world.record("trade.offer.rejected");
    world.run(1);
    world.engine.bus.processQueue();
    expect(refused).toMatchObject([{ reason: "not-for-sale" }]);
  });

  it("TradeSell, TradeBuy and CancelTradeOrder manage orders", () => {
    const { world, traderId } = setup();
    const refused = world.record("trade.order.refused");
    expect(world.command("TradeSell", { traderId, materialId: "iron_ore", quantity: 4 })).toEqual({
      orderId: 1,
    });
    expect(world.command("TradeBuy", { traderId, materialId: "nails", quantity: 4 })).toEqual({
      orderId: 2,
    });
    expect(() =>
      world.command("TradeBuy", { traderId, materialId: "iron_ingot", quantity: 1 }),
    ).toThrow(/RefinedCreditExhausted/);
    world.engine.bus.processQueue();
    expect(refused).toMatchObject([
      {
        direction: "Buy",
        traderId,
        materialId: "iron_ingot",
        quantity: 1,
        kind: "RefinedCreditExhausted",
      },
    ]);
    expect(world.command("CancelTradeOrder", { orderId: 1 })).toEqual({ cancelled: true });
    expect(world.query("trade-orders")).toMatchObject([
      { orderId: 1, status: OrderStatus.Cancelled, reason: "cancelled_by_player" },
      { orderId: 2, status: OrderStatus.Open },
    ]);
  });

  it("answers the queries traders, trade-ledger, treasury and trade-quote", () => {
    const { world, traderId, settlerId } = setup();
    expect(world.query("traders")).toMatchObject({ traders: [{ entityId: traderId }] });
    expect(world.query("trade-ledger")).toEqual([]);
    expect(world.query("treasury")).toEqual({ balance: 1000, pendingWages: [] });
    expect(
      world.query("trade-quote", { traderId, direction: "Buy", materialId: "nails", quantity: 10 }),
    ).toMatchObject({ coins: 3, available: 60 });
    expect(
      world.query("trade-quote", { traderId: settlerId, direction: "Buy", materialId: "nails" }),
    ).toBeNull();
  });

  it("a trader that is deleted queues trader.left, cancels its offers and releases its reservations", () => {
    const { world, traderId, settlerId } = setup();
    const left = world.record(traderLeftEvent);
    world.command("ProposeTrade", propose(traderId, settlerId, 1));
    world.engine.store.requestDelete(traderId);
    world.engine.store.flushDeletions();
    world.engine.bus.processQueue();
    expect(left).toMatchObject([{ entityId: traderId }]);
    expect(world.query("trade-offers")).toEqual([]);
  });
});
