import { describe, expect, it } from "vitest";
import { governmentFactionId } from "../factions/factionRegistry";
import { getTotal } from "../inventory/inventoryQueries";
import {
  drawRefinedCredit,
  grantRefinedCredit,
  isRefinedGood,
  refinedAllowance,
  refinedCreditMilli,
  topUpRefinedStash,
} from "./refinedLedger";
import { createTradeWorld, fullInventory } from "./testTradeWorld";
import { getTradeService } from "./tradeServiceRegistry";
import { creditChangedEvent, traderPrototypeId } from "./tradeTypes";

describe("refined-credit ledger (D-13)", () => {
  it("knows which goods a trader sells only through the ledger", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    expect(isRefinedGood(trader, "iron_ingot")).toBe(true);
    expect(isRefinedGood(trader, "nails")).toBe(false);
    expect(isRefinedGood(world.settler(4), "iron_ingot")).toBe(false);
    expect(refinedAllowance(world.engine, trader, "nails")).toBeNull();
    expect(refinedAllowance(world.engine, trader, "iron_ingot")).toBe(0);
  });

  it("grants quantity x ratio milli-items of credit for the raw goods sold, and adds up", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const events = world.record(creditChangedEvent);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 10 }]);
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(5000);
    expect(refinedAllowance(world.engine, trader, "iron_ingot")).toBe(5);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 3 }]);
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(6500);
    expect(refinedAllowance(world.engine, trader, "iron_ingot")).toBe(6);
    world.engine.bus.processQueue();
    expect(events.at(-1)).toMatchObject({ refinedMaterialId: "iron_ingot", creditMilli: 6500 });
  });

  it("ignores goods without a refine rule and traders without rules", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    grantRefinedCredit(world.engine, trader, [{ materialId: "limestone", quantity: 10 }]);
    grantRefinedCredit(world.engine, world.settler(4), [{ materialId: "iron_ore", quantity: 10 }]);
    expect(getTradeService(world.engine).ledger()).toEqual([]);
  });

  it("draws credit down by whole units and never below zero", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 5 }]);
    drawRefinedCredit(world.engine, trader, "iron_ingot", 2);
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(500);
    expect(refinedAllowance(world.engine, trader, "iron_ingot")).toBe(0);
    drawRefinedCredit(world.engine, trader, "iron_ingot", 3);
    expect(refinedCreditMilli(world.engine, traderPrototypeId, "iron_ingot")).toBe(0);
    drawRefinedCredit(world.engine, trader, "nails", 1);
    expect(getTradeService(world.engine).ledger()).toEqual([]);
  });

  it("keeps the credit per settlement and trader kind", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 4 }]);
    const entry = getTradeService(world.engine).ledger()[0];
    expect(entry).toMatchObject({
      traderPrototypeId,
      settlementFactionId: governmentFactionId(world.engine),
      refinedMaterialId: "iron_ingot",
      creditMilli: 2000,
    });
  });

  it("tops the stash up to floor(credit / 1000), never above and never twice", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 5 }]);
    topUpRefinedStash(world.engine, trader);
    expect(getTotal(trader, "iron_ingot")).toBe(2);
    topUpRefinedStash(world.engine, trader);
    expect(getTotal(trader, "iron_ingot")).toBe(2);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 1 }]);
    topUpRefinedStash(world.engine, trader);
    expect(getTotal(trader, "iron_ingot")).toBe(3);
  });

  it("keeps the credit when the stash is full (the credit is never reduced by capacity)", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    fullInventory(trader);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 10 }]);
    topUpRefinedStash(world.engine, trader);
    expect(getTotal(trader, "iron_ingot")).toBe(0);
    expect(refinedAllowance(world.engine, trader, "iron_ingot")).toBe(5);
    topUpRefinedStash(world.engine, world.settler(4));
  });
});
