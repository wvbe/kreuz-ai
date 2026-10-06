import { describe, expect, it } from "vitest";
import { setStanding } from "../factions/factionStanding";
import { governmentFactionId } from "../factions/factionRegistry";
import { getComponent } from "../ecs/Entity";
import { grantRefinedCredit } from "./refinedLedger";
import { createTradeWorld } from "./testTradeWorld";
import { OrderWait, createTradeOrder } from "./tradeOrders";
import { proposeOffer, resolveOffer } from "./tradeOffers";
import {
  buildLedgerViews,
  buildOfferViews,
  buildOrderViews,
  buildQuoteView,
  buildTradersView,
  buildTreasuryView,
} from "./tradeViews";
import { OrderDirection, TraderPhase } from "./tradeTypes";
import { traderComponent } from "./traderComponent";
import { payWageFromTreasury } from "./treasury";
import { debit } from "../inventory/inventoryMoney";
import { treasuryBalance, treasuryEntity } from "./treasury";

describe("buildTradersView", () => {
  it("lists the caravans with stock, coins, rules and standing, and the visit schedule", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const faction = getComponent(trader, traderComponent)?.factionId ?? 0;
    setStanding(world.engine, faction, governmentFactionId(world.engine) ?? 0, 7, true);
    const view = buildTradersView(world.engine);
    expect(view.traders).toHaveLength(1);
    expect(view.traders[0]).toMatchObject({
      entityId: trader.id,
      prototypeId: "trader_caravan",
      phase: TraderPhase.Present,
      cellIndex: 3,
      coins: 400,
      buys: ["iron_ore", "limestone", "oak_log", "wheat"],
      standing: 7,
      tradeAgreement: true,
    });
    expect(view.traders[0]?.stock).toEqual([
      { materialId: "coal", quantity: 20 },
      { materialId: "iron_hammer", quantity: 2 },
      { materialId: "nails", quantity: 60 },
    ]);
    expect(view.traders[0]?.refines[0]).toMatchObject({ refinedMaterialId: "iron_ingot" });
    expect(view.visits).toHaveLength(1);
    expect(view.visits[0]?.nextArrivalTick).toBeGreaterThan(0);
  });

  it("is plain JSON", () => {
    const world = createTradeWorld();
    world.trader(3);
    const view = buildTradersView(world.engine);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});

describe("buildOfferViews, buildOrderViews, buildLedgerViews", () => {
  it("shows the open offers", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const settler = world.settler(4);
    world.give(settler, "silver_penny", 5);
    const offer = proposeOffer(
      world.engine,
      {
        buyerId: settler.id,
        sellerId: trader.id,
        requested: [{ materialId: "nails", quantity: 10 }],
        offered: [],
        coins: 2,
      },
      0,
    );
    resolveOffer(world.engine, offer.offerId, true);
    expect(buildOfferViews(world.engine)).toMatchObject([
      { offerId: offer.offerId, status: "Countered", counterCoins: 3, coins: 2 },
    ]);
  });

  it("shows orders with what they wait for", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    createTradeOrder(world.engine, trader.id, OrderDirection.Sell, "iron_ore", 3, 0);
    expect(buildOrderViews(world.engine)).toMatchObject([
      {
        orderId: 1,
        direction: "Sell",
        materialId: "iron_ore",
        remaining: 3,
        status: "Open",
        waitingFor: OrderWait.NoStock,
      },
    ]);
  });

  it("shows the credit with its rule, in whole units too", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    expect(buildLedgerViews(world.engine)).toEqual([]);
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 7 }]);
    expect(buildLedgerViews(world.engine)).toEqual([
      {
        traderPrototypeId: "trader_caravan",
        refinedMaterialId: "iron_ingot",
        rawMaterialId: "iron_ore",
        ratioMilli: 500,
        creditMilli: 3500,
        units: 3,
      },
    ]);
  });
});

describe("buildTreasuryView and buildQuoteView", () => {
  it("shows the balance and the queued wages", () => {
    const world = createTradeWorld();
    const treasury = treasuryEntity(world.engine);
    if (treasury !== null) {
      debit(
        { materials: world.engine.materials, actor: null },
        treasury,
        treasuryBalance(world.engine),
      );
    }
    payWageFromTreasury(world.engine, world.settler(4).id, 2, {
      ...world.postFell(15),
      claimId: 4,
    });
    expect(buildTreasuryView(world.engine)).toMatchObject({
      balance: 0,
      pendingWages: [{ paymentId: 4, amount: 2 }],
    });
  });

  it("quotes through the view, null for a non-trader", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    expect(buildQuoteView(world.engine, trader.id, OrderDirection.Buy, "nails", 10)).toMatchObject({
      coins: 3,
    });
    expect(
      buildQuoteView(world.engine, world.settler(4).id, OrderDirection.Buy, "nails", 1),
    ).toBeNull();
    expect(buildQuoteView(world.engine, 9999, OrderDirection.Buy, "nails", 1)).toBeNull();
  });
});
