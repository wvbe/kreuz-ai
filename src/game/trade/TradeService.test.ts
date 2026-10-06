import { describe, expect, it } from "vitest";
import { TradeService } from "./TradeService";
import { OfferStatus, OrderDirection, OrderStatus, finishedOrderHistory } from "./tradeTypes";
import type { TradeOffer } from "./tradeTypes";

function offer(offerId: number): TradeOffer {
  return {
    offerId,
    negotiationId: offerId,
    round: 1,
    buyerId: 4,
    sellerId: 5,
    requested: [{ materialId: "nails", quantity: 2 }],
    offered: [],
    coins: 3,
    status: OfferStatus.Pending,
    counterCoins: null,
    createdTick: 1,
    expiryTick: 25,
  };
}

const fields = {
  traderPrototypeId: "trader_caravan",
  direction: OrderDirection.Sell,
  materialId: "iron_ore",
  quantity: 10,
  tick: 5,
};

// @covers 019:FR-014 019:SC-006
describe("TradeService offers", () => {
  it("hands out ascending ids and keeps the offers sorted, as copies", () => {
    const service = new TradeService();
    expect(service.allocateOfferId()).toBe(1);
    expect(service.allocateOfferId()).toBe(2);
    service.putOffer(offer(2));
    service.putOffer(offer(1));
    expect(service.offers().map((held) => held.offerId)).toEqual([1, 2]);
    service.putOffer({ ...offer(1), round: 2 });
    expect(service.findOffer(1)?.round).toBe(2);
    service.findOffer(1)!.round = 9;
    expect(service.findOffer(1)?.round).toBe(2);
    service.removeOffer(1);
    expect(service.findOffer(1)).toBeNull();
  });
});

describe("TradeService orders", () => {
  it("adds, updates and finds orders, and finds the order of a posting", () => {
    const service = new TradeService();
    const order = service.addOrder(fields);
    expect(order).toMatchObject({ orderId: 1, remaining: 10, status: OrderStatus.Open });
    service.putOrder({ ...order, postingId: 77, remaining: 6 });
    expect(service.findOrder(1)?.remaining).toBe(6);
    expect(service.orderOfPosting(77)?.orderId).toBe(1);
    expect(service.orderOfPosting(78)).toBeNull();
    expect(service.findOrder(2)).toBeNull();
  });

  it("keeps the open orders and only the last finished ones", () => {
    const service = new TradeService();
    const open = service.addOrder(fields);
    for (let index = 0; index < finishedOrderHistory + 3; index += 1) {
      const order = service.addOrder(fields);
      service.putOrder({ ...order, status: OrderStatus.Done });
    }
    const orders = service.orders();
    expect(orders.filter((order) => order.status === OrderStatus.Done)).toHaveLength(
      finishedOrderHistory,
    );
    expect(orders.some((order) => order.orderId === open.orderId)).toBe(true);
    expect(orders[1]?.orderId).toBe(5);
  });
});

describe("TradeService ledger, visits and standing gains", () => {
  it("stores credit per trader kind, settlement and refined good; zero removes it", () => {
    const service = new TradeService();
    expect(service.creditOf("trader_caravan", 1, "iron_ingot")).toBe(0);
    service.setCredit({
      traderPrototypeId: "trader_caravan",
      settlementFactionId: 1,
      refinedMaterialId: "iron_ingot",
      creditMilli: 3000,
    });
    service.setCredit({
      traderPrototypeId: "a_trader",
      settlementFactionId: 1,
      refinedMaterialId: "flour",
      creditMilli: 500,
    });
    expect(service.creditOf("trader_caravan", 1, "iron_ingot")).toBe(3000);
    expect(service.creditOf("trader_caravan", 2, "iron_ingot")).toBe(0);
    expect(service.ledger().map((entry) => entry.traderPrototypeId)).toEqual([
      "a_trader",
      "trader_caravan",
    ]);
    service.setCredit({
      traderPrototypeId: "trader_caravan",
      settlementFactionId: 1,
      refinedMaterialId: "iron_ingot",
      creditMilli: 0,
    });
    expect(service.ledger()).toHaveLength(1);
  });

  it("keeps one visit record per trader kind", () => {
    const service = new TradeService();
    service.putVisit({ traderPrototypeId: "b", nextArrivalTick: 5, entityId: null });
    service.putVisit({ traderPrototypeId: "a", nextArrivalTick: 9, entityId: 4 });
    service.putVisit({ traderPrototypeId: "b", nextArrivalTick: 50, entityId: null });
    expect(service.visits().map((visit) => visit.traderPrototypeId)).toEqual(["a", "b"]);
    expect(service.visitOf("b")?.nextArrivalTick).toBe(50);
    expect(service.visitOf("c")).toBeNull();
  });

  it("counts standing gains per day and faction, a new day starts again", () => {
    const service = new TradeService();
    expect(service.gainedOn(3, 9)).toBe(0);
    service.addGain(3, 9, 2);
    service.addGain(3, 9, 1);
    service.addGain(3, 4, 1);
    expect(service.gainedOn(3, 9)).toBe(3);
    expect(service.gainedOn(4, 9)).toBe(0);
    service.addGain(4, 9, 1);
    expect(service.gainedOn(4, 9)).toBe(1);
    expect(service.gainedOn(3, 9)).toBe(0);
  });
});

describe("TradeService save section", () => {
  it("round-trips everything through JSON", () => {
    const service = new TradeService();
    service.allocateOfferId();
    service.putOffer(offer(1));
    const order = service.addOrder(fields);
    service.putOrder({ ...order, postingId: 12 });
    service.setCredit({
      traderPrototypeId: "trader_caravan",
      settlementFactionId: 1,
      refinedMaterialId: "iron_ingot",
      creditMilli: 4500,
    });
    service.putVisit({ traderPrototypeId: "trader_caravan", nextArrivalTick: 900, entityId: null });
    service.addGain(2, 7, 3);
    const section = service.createSection();
    expect(section.key).toBe("trade");
    const saved = JSON.parse(JSON.stringify(section.serialize()));
    const other = new TradeService();
    other.createSection().restore(saved);
    expect(JSON.parse(JSON.stringify(other.createSection().serialize()))).toEqual(saved);
    expect(other.allocateOfferId()).toBe(2);
    expect(other.addOrder(fields).orderId).toBe(2);
    expect(other.gainedOn(2, 7)).toBe(3);
  });

  it("rejects offers at or above the id counter and has an empty default", () => {
    const service = new TradeService();
    const section = service.createSection();
    const empty = section.defaultForOlderSaves?.();
    expect(empty).toMatchObject({ nextOfferId: 1, nextOrderId: 1, offers: [], orders: [] });
    expect(() => section.restore({ ...(empty as object), offers: [offer(1)] } as never)).toThrow();
  });
});
