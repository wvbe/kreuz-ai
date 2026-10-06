import { describe, expect, it } from "vitest";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { grantRefinedCredit, topUpRefinedStash } from "./refinedLedger";
import { createTradeWorld } from "./testTradeWorld";
import {
  creditExhaustedQuoteReason,
  notSoldQuoteReason,
  notWantedQuoteReason,
  quoteTrade,
  sellableQuantity,
} from "./tradeQuotes";
import { OrderDirection } from "./tradeTypes";

describe("quoteTrade", () => {
  it("quotes what the settlement pays for goods, with the trader's margin, rounded up", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    expect(quoteTrade(world.engine, trader, OrderDirection.Buy, "nails", 10)).toEqual({
      direction: OrderDirection.Buy,
      materialId: "nails",
      quantity: 10,
      coins: 3,
      ceilingCoins: 3,
      available: 60,
      reason: null,
    });
    expect(quoteTrade(world.engine, trader, OrderDirection.Buy, "iron_hammer", 2).coins).toBe(18);
  });

  it("quotes what the trader bids for goods it wants, and its ceiling", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    expect(quoteTrade(world.engine, trader, OrderDirection.Sell, "iron_ore", 10)).toMatchObject({
      coins: 23,
      ceilingCoins: 25,
      available: 400,
      reason: null,
    });
    expect(quoteTrade(world.engine, trader, OrderDirection.Sell, "nails", 1)).toMatchObject({
      available: 0,
      reason: notWantedQuoteReason,
    });
  });

  it("says why a good cannot be bought: not sold, or the refined credit is used up", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    expect(quoteTrade(world.engine, trader, OrderDirection.Buy, "bread", 1)).toMatchObject({
      available: 0,
      reason: notSoldQuoteReason,
    });
    expect(quoteTrade(world.engine, trader, OrderDirection.Buy, "iron_ingot", 1)).toMatchObject({
      available: 0,
      reason: creditExhaustedQuoteReason,
    });
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 6 }]);
    topUpRefinedStash(world.engine, trader);
    expect(quoteTrade(world.engine, trader, OrderDirection.Buy, "iron_ingot", 3)).toMatchObject({
      coins: 20,
      available: 3,
      reason: null,
    });
  });

  it("answers for an entity that is no trader with a refusal", () => {
    const world = createTradeWorld();
    expect(
      quoteTrade(world.engine, world.settler(4), OrderDirection.Buy, "nails", 1),
    ).toMatchObject({ coins: null, reason: notSoldQuoteReason });
  });

  it("has no price for a material without a value", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const coal = world.engine.materials.require("coal");
    const before = coal.valueMilli;
    coal.valueMilli = undefined;
    const quote = quoteTrade(world.engine, trader, OrderDirection.Buy, "coal", 1);
    coal.valueMilli = before;
    expect(quote.coins).toBeNull();
  });
});

describe("sellableQuantity", () => {
  it("is the stash minus what others reserved, capped by the credit for refined goods", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    expect(sellableQuantity(world.engine, trader, "nails")).toBe(60);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Payment,
      holderId: world.settler(4).id,
      inventoryOwnerId: trader.id,
      materialId: "nails",
      quantity: 25,
    });
    expect(sellableQuantity(world.engine, trader, "nails")).toBe(35);
    expect(sellableQuantity(world.engine, trader, "iron_ingot")).toBe(0);
    world.give(trader, "iron_ingot", 9);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 4 }]);
    expect(sellableQuantity(world.engine, trader, "iron_ingot")).toBe(2);
  });
});
