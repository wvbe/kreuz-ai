import { describe, expect, it } from "vitest";
import type { Entity } from "../ecs/Entity";
import { getTotal } from "../inventory/inventoryQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { createTradeWorld, fullInventory } from "./testTradeWorld";
import type { TradeTestWorld } from "./testTradeWorld";
import { executeTrade, legsOf } from "./tradeExecution";
import { ExecutionFailure, OfferStatus } from "./tradeTypes";
import type { TradeOffer } from "./tradeTypes";

function offerOf(
  buyer: Entity,
  seller: Entity,
  requested: TradeOffer["requested"],
  coins: number,
  offered: TradeOffer["offered"] = [],
): TradeOffer {
  return {
    offerId: 1,
    negotiationId: 1,
    round: 1,
    buyerId: buyer.id,
    sellerId: seller.id,
    requested,
    offered,
    coins,
    status: OfferStatus.Pending,
    counterCoins: null,
    createdTick: 0,
    expiryTick: 24,
  };
}

function setup(): { world: TradeTestWorld; trader: Entity; settler: Entity } {
  const world = createTradeWorld();
  const trader = world.trader(3);
  const settler = world.settler(4);
  world.give(settler, "silver_penny", 40);
  return { world, trader, settler };
}

function snapshot(world: TradeTestWorld, ...entities: Entity[]): number[] {
  return entities.flatMap((entity) =>
    ["silver_penny", "nails", "iron_ore", "coal"].map((id) => getTotal(entity, id)),
  );
}

describe("legsOf", () => {
  it("moves goods to the buyer and barter goods and coins to the seller", () => {
    const { world, trader, settler } = setup();
    const legs = legsOf(
      world.engine,
      offerOf(settler, trader, [{ materialId: "nails", quantity: 4 }], 3, [
        { materialId: "iron_ore", quantity: 1 },
      ]),
    );
    expect(legs).toEqual([
      { fromId: trader.id, toId: settler.id, materialId: "nails", quantity: 4 },
      { fromId: settler.id, toId: trader.id, materialId: "iron_ore", quantity: 1 },
      { fromId: settler.id, toId: trader.id, materialId: "silver_penny", quantity: 3 },
    ]);
  });

  it("leaves out the coin leg when no coins are offered", () => {
    const { world, trader, settler } = setup();
    expect(
      legsOf(world.engine, offerOf(settler, trader, [{ materialId: "nails", quantity: 1 }], 0)),
    ).toHaveLength(1);
  });
});

describe("executeTrade", () => {
  it("moves goods and coins and releases every reservation", () => {
    const { world, trader, settler } = setup();
    const result = executeTrade(
      world.engine,
      offerOf(settler, trader, [{ materialId: "nails", quantity: 10 }], 3),
    );
    expect(result.ok).toBe(true);
    expect(getTotal(settler, "nails")).toBe(10);
    expect(getTotal(settler, "silver_penny")).toBe(37);
    expect(getTotal(trader, "nails")).toBe(50);
    expect(world.coins(trader.id)).toBe(403);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
  });

  it("rolls everything back when the buyer has no room for the goods (atomic, SC-002)", () => {
    const { world, trader, settler } = setup();
    fullInventory(settler);
    const before = snapshot(world, trader, settler);
    const result = executeTrade(
      world.engine,
      offerOf(settler, trader, [{ materialId: "coal", quantity: 3 }], 3),
    );
    expect(result).toEqual({ ok: false, reason: ExecutionFailure.BuyerInventoryFull });
    expect(snapshot(world, trader, settler)).toEqual(before);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
  });

  it("rolls the goods back when the seller cannot take the payment", () => {
    const { world, trader, settler } = setup();
    fullInventory(trader);
    world.give(settler, "iron_ore", 2);
    const before = snapshot(world, trader, settler);
    const result = executeTrade(
      world.engine,
      offerOf(settler, trader, [{ materialId: "nails", quantity: 5 }], 0, [
        { materialId: "iron_ore", quantity: 2 },
      ]),
    );
    expect(result).toEqual({ ok: false, reason: ExecutionFailure.SellerInventoryFull });
    expect(snapshot(world, trader, settler)).toEqual(before);
  });

  it("fails without moving anything when the stock was promised to another holder", () => {
    const { world, trader, settler } = setup();
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Haul,
      holderId: world.settler(6).id,
      inventoryOwnerId: trader.id,
      materialId: "nails",
      quantity: 60,
    });
    const before = snapshot(world, trader, settler);
    const result = executeTrade(
      world.engine,
      offerOf(settler, trader, [{ materialId: "nails", quantity: 1 }], 1),
    );
    expect(result).toEqual({ ok: false, reason: ExecutionFailure.StockChanged });
    expect(snapshot(world, trader, settler)).toEqual(before);
    expect(getStorageService(world.engine).reservations.all()).toHaveLength(1);
  });

  it("reports a deleted party", () => {
    const { world, trader, settler } = setup();
    const offer = offerOf(settler, trader, [{ materialId: "nails", quantity: 1 }], 1);
    expect(executeTrade(world.engine, { ...offer, buyerId: 9999 })).toEqual({
      ok: false,
      reason: ExecutionFailure.BuyerDeleted,
    });
    expect(executeTrade(world.engine, { ...offer, sellerId: 9999 })).toEqual({
      ok: false,
      reason: ExecutionFailure.SellerDeleted,
    });
  });
});
