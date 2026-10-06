import { describe, expect, it } from "vitest";
import { governmentFactionId } from "../factions/factionRegistry";
import { getBalance } from "../inventory/inventoryMoney";
import { buildFlowRows } from "../status/flow/flowSummary";
import { FlowSource } from "../status/statusTypes";
import { createTradeWorld } from "./testTradeWorld";
import { isSettlementSide, recordTradeFlow, settleTrade } from "./tradeSettlement";
import { OfferStatus, tradeCompletedEvent, traderPrototypeId } from "./tradeTypes";
import type { TradeOffer } from "./tradeTypes";
import { refinedCreditMilli } from "./refinedLedger";

// @covers 019:FR-010
describe("isSettlementSide", () => {
  it("is true for the treasury and the settlers, false for traders and strangers", () => {
    const world = createTradeWorld();
    const government = world.engine.store.require(governmentFactionId(world.engine) ?? 0);
    expect(isSettlementSide(world.engine, government)).toBe(true);
    expect(isSettlementSide(world.engine, world.settler(4))).toBe(true);
    expect(isSettlementSide(world.engine, world.trader(3))).toBe(false);
    expect(isSettlementSide(world.engine, world.spawn("peasant", 6))).toBe(false);
  });
});

describe("recordTradeFlow", () => {
  it("counts goods entering the settlement as produced and leaving as consumed, never coins", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const settler = world.settler(4);
    recordTradeFlow(world.engine, [
      { fromId: trader.id, toId: settler.id, materialId: "nails", quantity: 5 },
      { fromId: settler.id, toId: trader.id, materialId: "iron_ore", quantity: 2 },
      { fromId: settler.id, toId: trader.id, materialId: "silver_penny", quantity: 9 },
      { fromId: settler.id, toId: world.settler(5).id, materialId: "bread", quantity: 1 },
    ]);
    const rows = buildFlowRows(world.engine);
    const nails = rows.find((row) => row.materialId === "nails");
    const ore = rows.find((row) => row.materialId === "iron_ore");
    expect(nails?.producers).toEqual([{ subject: null, source: FlowSource.Trade, quantity: 5 }]);
    expect(ore?.consumers).toEqual([{ subject: null, source: FlowSource.Trade, quantity: 2 }]);
    expect(
      rows.some((row) => row.materialId === "silver_penny" || row.materialId === "bread"),
    ).toBe(false);
  });
});

describe("settleTrade", () => {
  it("credits the ledger for raw goods the trader bought and queues trade.completed", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const settler = world.settler(4);
    const events = world.record(tradeCompletedEvent);
    const offer: TradeOffer = {
      offerId: 7,
      negotiationId: 7,
      round: 1,
      buyerId: trader.id,
      sellerId: settler.id,
      requested: [{ materialId: "iron_ore", quantity: 4 }],
      offered: [],
      coins: 9,
      status: OfferStatus.Pending,
      counterCoins: null,
      createdTick: 0,
      expiryTick: 24,
    };
    settleTrade(world.engine, offer, [
      { fromId: settler.id, toId: trader.id, materialId: "iron_ore", quantity: 4 },
      { fromId: trader.id, toId: settler.id, materialId: "silver_penny", quantity: 9 },
    ]);
    world.engine.bus.processQueue();
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(2000);
    expect(events.at(-1)).toMatchObject({
      offerId: 7,
      buyerId: trader.id,
      sellerId: settler.id,
      items: [{ materialId: "iron_ore", quantity: 4 }],
      payment: [{ materialId: "silver_penny", quantity: 9 }],
    });
    expect(getBalance({ materials: world.engine.materials, actor: null }, settler)).toBe(0);
  });

  it("draws the credit down when the trader sold a refined good", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const settler = world.settler(4);
    const sale: TradeOffer = {
      offerId: 1,
      negotiationId: 1,
      round: 1,
      buyerId: trader.id,
      sellerId: settler.id,
      requested: [{ materialId: "iron_ore", quantity: 10 }],
      offered: [],
      coins: 20,
      status: OfferStatus.Pending,
      counterCoins: null,
      createdTick: 0,
      expiryTick: 24,
    };
    settleTrade(world.engine, sale, []);
    const purchase: TradeOffer = {
      ...sale,
      offerId: 2,
      buyerId: settler.id,
      sellerId: trader.id,
      requested: [{ materialId: "iron_ingot", quantity: 3 }],
    };
    settleTrade(world.engine, purchase, []);
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(2000);
  });
});
