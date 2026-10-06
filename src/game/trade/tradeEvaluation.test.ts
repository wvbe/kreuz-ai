import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { governmentFactionId } from "../factions/factionRegistry";
import { setStanding } from "../factions/factionStanding";
import { retrieve } from "../inventory/inventoryOperations";
import { traitsComponent } from "../skills/skillsComponent";
import { merchantComponent } from "./merchantComponent";
import { createTradeWorld } from "./testTradeWorld";
import type { TradeTestWorld } from "./testTradeWorld";
import {
  EvaluationKind,
  askedMilli,
  evaluateOffer,
  hasTradeAgreement,
  isFactionHostile,
  isTradeHostile,
  sellerMarginPermille,
} from "./tradeEvaluation";
import { OfferStatus, RejectReason, refinedCreditExhaustedDetail } from "./tradeTypes";
import type { Item, TradeOffer } from "./tradeTypes";
import { traderComponent } from "./traderComponent";
import { grantRefinedCredit } from "./refinedLedger";

function offer(
  buyer: Entity,
  seller: Entity,
  requested: Item[],
  coins: number,
  offered: Item[] = [],
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

const nails = (quantity: number): Item[] => [{ materialId: "nails", quantity }];

// @covers 019:FR-007 019:FR-008
describe("evaluateOffer", () => {
  it("accepts when the coins reach what the trader asks (10 nails: 2000 milli x 1.1 = 3 coins)", () => {
    const { world, trader, settler } = setup();
    const result = evaluateOffer(world.engine, offer(settler, trader, nails(10), 3));
    expect(result).toMatchObject({
      kind: EvaluationKind.Accept,
      minAcceptableMilli: 2200,
      offeredMilli: 3000,
    });
  });

  it("counters with the coins it asks, rounded up (spec 019: offer 2 counters 3)", () => {
    const { world, trader, settler } = setup();
    const result = evaluateOffer(world.engine, offer(settler, trader, nails(10), 2));
    expect(result.kind).toBe(EvaluationKind.Counter);
    expect(result.counterCoins).toBe(3);
  });

  it("values barter goods at the plain value, without margin", () => {
    const { world, trader, settler } = setup();
    world.give(settler, "iron_ore", 2);
    const asked = askedMilli(world.engine, trader, [{ materialId: "iron_hammer", quantity: 1 }]);
    expect(asked).toBe(8800);
    const enough = evaluateOffer(
      world.engine,
      offer(settler, trader, [{ materialId: "iron_hammer", quantity: 1 }], 5, [
        { materialId: "iron_ore", quantity: 2 },
      ]),
    );
    expect(enough).toMatchObject({ kind: EvaluationKind.Accept, offeredMilli: 9000 });
    const short = evaluateOffer(
      world.engine,
      offer(settler, trader, [{ materialId: "iron_hammer", quantity: 1 }], 4, [
        { materialId: "iron_ore", quantity: 2 },
      ]),
    );
    expect(short.kind).toBe(EvaluationKind.Counter);
    expect(short.counterCoins).toBe(5);
  });

  it("refuses a trade with oneself without a reason to report", () => {
    const { world, settler } = setup();
    const result = evaluateOffer(world.engine, offer(settler, settler, nails(1), 1));
    expect(result).toMatchObject({ kind: EvaluationKind.Reject, reason: RejectReason.SelfTrade });
  });

  it("refuses an offer with a missing party", () => {
    const { world, trader, settler } = setup();
    const ghost = { ...settler, id: 9999 };
    expect(evaluateOffer(world.engine, offer(ghost, trader, nails(1), 1)).kind).toBe(
      EvaluationKind.Reject,
    );
  });

  it("refuses goods the seller lacks", () => {
    const { world, trader, settler } = setup();
    expect(evaluateOffer(world.engine, offer(settler, trader, nails(61), 99)).reason).toBe(
      RejectReason.InsufficientStock,
    );
  });

  it("refuses a buyer that cannot pay what it offers", () => {
    const { world, trader, settler } = setup();
    expect(evaluateOffer(world.engine, offer(settler, trader, nails(10), 400)).reason).toBe(
      RejectReason.InsufficientFunds,
    );
  });

  it("refuses an item without a value", () => {
    const { world, trader, settler } = setup();
    const coal = world.engine.materials.require("coal");
    const before = coal.valueMilli;
    coal.valueMilli = undefined;
    const result = evaluateOffer(
      world.engine,
      offer(settler, trader, [{ materialId: "coal", quantity: 1 }], 5),
    );
    coal.valueMilli = before;
    expect(result.reason).toBe(RejectReason.UnknownItemValue);
  });

  it("refuses a hostile faction in both directions", () => {
    const { world, trader, settler } = setup();
    const government = governmentFactionId(world.engine) ?? 0;
    const factionId = getComponent(trader, traderComponent)?.factionId ?? 0;
    expect(isTradeHostile(world.engine, trader)).toBe(false);
    setStanding(world.engine, factionId, government, -31);
    expect(isFactionHostile(world.engine, factionId)).toBe(true);
    expect(isTradeHostile(world.engine, trader)).toBe(true);
    expect(isTradeHostile(world.engine, settler)).toBe(false);
    expect(evaluateOffer(world.engine, offer(settler, trader, nails(1), 5)).reason).toBe(
      RejectReason.FactionHostile,
    );
    setStanding(world.engine, factionId, government, -30);
    setStanding(world.engine, government, factionId, -45);
    expect(isFactionHostile(world.engine, factionId)).toBe(true);
    expect(isFactionHostile(world.engine, 0)).toBe(false);
  });

  it("applies the trade agreement discount of 0.9 (D-12)", () => {
    const { world, trader } = setup();
    const factionId = getComponent(trader, traderComponent)?.factionId ?? 0;
    const hammer = [{ materialId: "iron_hammer", quantity: 1 }];
    expect(askedMilli(world.engine, trader, hammer)).toBe(8800);
    setStanding(world.engine, factionId, governmentFactionId(world.engine) ?? 0, 0, true);
    expect(hasTradeAgreement(world.engine, trader)).toBe(true);
    expect(askedMilli(world.engine, trader, hammer)).toBe(7920);
  });

  it("adds a scarcity premium once the trader has sold down its stock", () => {
    const { world, trader } = setup();
    retrieve({ materials: world.engine.materials, actor: null }, trader, "nails", 30);
    // Half the stock left: +10% on the multiplier, so 2000 milli x 1.1 x 1.1.
    expect(askedMilli(world.engine, trader, nails(10))).toBe(2420);
  });

  it("adds the Greedy trait margin of the seller (+50 permille, marginAddPermille)", () => {
    const { world, trader, settler } = setup();
    expect(sellerMarginPermille(world.engine, settler)).toBe(100);
    const traits = getComponent(settler, traitsComponent);
    expect(traits).toBeDefined();
    if (traits !== undefined) {
      traits.ids = ["greedy"];
    }
    expect(sellerMarginPermille(world.engine, settler)).toBe(150);
    world.give(settler, "iron_ore", 10);
    // The greedy settler sells 10 ore (20000 milli) to the trader and asks 23 coins, not 22.
    const asked = askedMilli(world.engine, settler, [{ materialId: "iron_ore", quantity: 10 }]);
    expect(asked).toBe(23000);
    const bid = evaluateOffer(
      world.engine,
      offer(trader, settler, [{ materialId: "iron_ore", quantity: 10 }], 22),
    );
    expect(bid).toMatchObject({ kind: EvaluationKind.Counter, counterCoins: 23 });
  });

  it("uses the merchant margin and multiplier of the seller when it has them", () => {
    const { world, settler } = setup();
    world.engine.store.addComponent(settler.id, merchantComponent, {
      sellsItems: true,
      priceMultiplierMilli: 1500,
      minimumMarginRatePermille: 0,
    });
    expect(sellerMarginPermille(world.engine, settler)).toBe(0);
    world.give(settler, "bread", 2);
    expect(askedMilli(world.engine, settler, [{ materialId: "bread", quantity: 2 }])).toBe(6000);
  });

  it("refuses goods a buying trader does not want (not in its buys list)", () => {
    const { world, trader, settler } = setup();
    world.give(settler, "bread", 2);
    const result = evaluateOffer(
      world.engine,
      offer(trader, settler, [{ materialId: "bread", quantity: 2 }], 4),
    );
    expect(result.reason).toBe(RejectReason.NotWanted);
  });

  it("caps a refined good at the credit and reports refined-credit-exhausted", () => {
    const { world, trader, settler } = setup();
    const ingot = [{ materialId: "iron_ingot", quantity: 1 }];
    const none = evaluateOffer(world.engine, offer(settler, trader, ingot, 20));
    expect(none).toMatchObject({
      reason: RejectReason.InsufficientStock,
      detail: refinedCreditExhaustedDetail,
    });
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 2 }]);
    world.give(trader, "iron_ingot", 1);
    expect(evaluateOffer(world.engine, offer(settler, trader, ingot, 20)).kind).toBe(
      EvaluationKind.Accept,
    );
    const two = evaluateOffer(
      world.engine,
      offer(settler, trader, [{ materialId: "iron_ingot", quantity: 2 }], 40),
    );
    expect(two.detail).toBe(refinedCreditExhaustedDetail);
  });
});
