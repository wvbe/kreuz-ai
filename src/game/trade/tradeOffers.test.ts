import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { governmentFactionId } from "../factions/factionRegistry";
import { setStanding } from "../factions/factionStanding";
import { getTotal } from "../inventory/inventoryQueries";
import { merchantComponent } from "./merchantComponent";
import { createTradeWorld, fullInventory } from "./testTradeWorld";
import type { TradeTestWorld } from "./testTradeWorld";
import {
  OfferOutcome,
  acceptCounter,
  cancelHostileOffers,
  cancelOffer,
  cancelOffersOf,
  negotiate,
  processOffers,
  proposeOffer,
  resolveOffer,
} from "./tradeOffers";
import { getTradeService } from "./tradeServiceRegistry";
import { TradeError, TradeErrorKind } from "./TradeError";
import {
  OfferStatus,
  RejectReason,
  executionFailedEvent,
  offerAcceptedEvent,
  offerCancelledEvent,
  offerCounteredEvent,
  offerExpiredEvent,
  offerProposedEvent,
  offerRejectedEvent,
  tradeCompletedEvent,
} from "./tradeTypes";
import { traderComponent } from "./traderComponent";

function setup(): { world: TradeTestWorld; trader: Entity; settler: Entity } {
  const world = createTradeWorld();
  const trader = world.trader(3);
  const settler = world.settler(4);
  world.give(settler, "silver_penny", 40);
  return { world, trader, settler };
}

const nails = (quantity: number) => [{ materialId: "nails", quantity }];

describe("proposeOffer", () => {
  it("stores the offer and queues trade.offer.proposed", () => {
    const { world, trader, settler } = setup();
    const seen = world.record(offerProposedEvent);
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(10), offered: [], coins: 3 },
      5,
    );
    world.engine.bus.processQueue();
    expect(offer).toMatchObject({ offerId: 1, negotiationId: 1, round: 1, expiryTick: 29 });
    expect(getTradeService(world.engine).offers()).toHaveLength(1);
    expect(seen.at(-1)).toMatchObject({ offerId: 1, coins: 3, requested: nails(10) });
  });

  it("rejects a missing party, empty or bad items and an unknown material", () => {
    const { world, trader, settler } = setup();
    const base = {
      buyerId: settler.id,
      sellerId: trader.id,
      requested: nails(1),
      offered: [],
      coins: 1,
    };
    expect(() => proposeOffer(world.engine, { ...base, buyerId: 999 }, 0)).toThrow(TradeError);
    expect(() => proposeOffer(world.engine, { ...base, requested: [] }, 0)).toThrow(/at least one/);
    expect(() => proposeOffer(world.engine, { ...base, coins: -1 }, 0)).toThrow(/coins/);
    expect(() => proposeOffer(world.engine, { ...base, requested: nails(0) }, 0)).toThrow(
      /positive integer/,
    );
    expect(() =>
      proposeOffer(world.engine, { ...base, requested: [{ materialId: "nope", quantity: 1 }] }, 0),
    ).toThrow();
  });
});

describe("resolveOffer", () => {
  it("accepts and executes in the same step, atomically (no awaiting state)", () => {
    const { world, trader, settler } = setup();
    const completed = world.record(tradeCompletedEvent);
    const accepted = world.record(offerAcceptedEvent);
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(10), offered: [], coins: 3 },
      0,
    );
    expect(resolveOffer(world.engine, offer.offerId, true)).toEqual({
      outcome: OfferOutcome.Completed,
      reason: null,
      counterCoins: null,
    });
    world.engine.bus.processQueue();
    expect(getTotal(settler, "nails")).toBe(10);
    expect(world.coins(settler.id)).toBe(37);
    expect(getTradeService(world.engine).offers()).toEqual([]);
    expect(completed).toHaveLength(1);
    expect(accepted).toHaveLength(1);
  });

  it("counters a low offer and keeps it waiting", () => {
    const { world, trader, settler } = setup();
    const countered = world.record(offerCounteredEvent);
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(10), offered: [], coins: 2 },
      0,
    );
    const result = resolveOffer(world.engine, offer.offerId, true);
    expect(result).toEqual({ outcome: OfferOutcome.Countered, reason: null, counterCoins: 3 });
    world.engine.bus.processQueue();
    expect(countered.at(-1)).toMatchObject({ offerId: offer.offerId, counterCoins: 3, round: 1 });
    expect(getTradeService(world.engine).findOffer(offer.offerId)).toMatchObject({
      status: OfferStatus.Countered,
      counterCoins: 3,
    });
    expect(getTotal(settler, "nails")).toBe(0);
  });

  it("rejects with the reason and removes the offer; a self trade is silent", () => {
    const { world, trader, settler } = setup();
    const rejected = world.record(offerRejectedEvent);
    const tooMany = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(61), offered: [], coins: 40 },
      0,
    );
    expect(resolveOffer(world.engine, tooMany.offerId, true)).toMatchObject({
      outcome: OfferOutcome.Rejected,
      reason: RejectReason.InsufficientStock,
    });
    const self = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: settler.id, requested: nails(1), offered: [], coins: 1 },
      0,
    );
    expect(resolveOffer(world.engine, self.offerId, false).reason).toBe(RejectReason.SelfTrade);
    world.engine.bus.processQueue();
    expect(rejected).toHaveLength(1);
    expect(getTradeService(world.engine).offers()).toEqual([]);
  });

  it("requires sellsItems for proposals but not for the settlers' own trade jobs", () => {
    const { world, trader, settler } = setup();
    world.give(settler, "bread", 2);
    const request = {
      buyerId: trader.id,
      sellerId: settler.id,
      requested: [{ materialId: "bread", quantity: 1 }],
      offered: [],
      coins: 1,
    };
    const gated = proposeOffer(world.engine, request, 0);
    expect(resolveOffer(world.engine, gated.offerId, true).reason).toBe(RejectReason.NotForSale);
    world.engine.store.addComponent(settler.id, merchantComponent, { sellsItems: true });
    const open = proposeOffer(world.engine, request, 0);
    expect(resolveOffer(world.engine, open.offerId, true).reason).toBe(RejectReason.NotWanted);
  });

  it("reports an accepted trade that cannot be executed and moves nothing", () => {
    const { world, trader, settler } = setup();
    const failed = world.record(executionFailedEvent);
    fullInventory(settler);
    const offer = proposeOffer(
      world.engine,
      {
        buyerId: settler.id,
        sellerId: trader.id,
        requested: [{ materialId: "coal", quantity: 2 }],
        offered: [],
        coins: 3,
      },
      0,
    );
    expect(resolveOffer(world.engine, offer.offerId, true)).toMatchObject({
      outcome: OfferOutcome.Failed,
      reason: "buyer-inventory-full",
    });
    world.engine.bus.processQueue();
    expect(failed.at(-1)).toMatchObject({ offerId: offer.offerId, reason: "buyer-inventory-full" });
    expect(world.coins(settler.id)).toBe(40);
  });

  it("cancels an offer whose party was deleted (hook) and one that names a missing party", () => {
    const { world, trader, settler } = setup();
    const cancelled = world.record(offerCancelledEvent);
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(1), offered: [], coins: 1 },
      0,
    );
    world.engine.store.requestDelete(settler.id);
    world.engine.store.flushDeletions();
    expect(getTradeService(world.engine).offers()).toEqual([]);
    world.engine.bus.processQueue();
    expect(cancelled.at(-1)).toMatchObject({ offerId: offer.offerId, reason: "buyer-deleted" });
    const service = getTradeService(world.engine);
    service.putOffer({
      ...offer,
      offerId: 40,
      negotiationId: 40,
      buyerId: trader.id,
      sellerId: 9999,
    });
    expect(resolveOffer(world.engine, 40, true).reason).toBe("seller-deleted");
    expect(resolveOffer(world.engine, 999, true).outcome).toBe(OfferOutcome.Failed);
  });
});

describe("counters and rounds (FR-011, SC-007)", () => {
  it("the buyer accepts the counter: next round at the asked coins, then it completes", () => {
    const { world, trader, settler } = setup();
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(10), offered: [], coins: 2 },
      0,
    );
    resolveOffer(world.engine, offer.offerId, true);
    const next = acceptCounter(world.engine, offer.offerId, 3);
    expect(next).toMatchObject({
      round: 2,
      coins: 3,
      status: OfferStatus.Pending,
      counterCoins: null,
    });
    expect(next?.expiryTick).toBe(27);
    expect(resolveOffer(world.engine, offer.offerId, true).outcome).toBe(OfferOutcome.Completed);
    expect(getTotal(settler, "nails")).toBe(10);
  });

  it("refuses to accept what was not countered or does not exist", () => {
    const { world, trader, settler } = setup();
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(1), offered: [], coins: 1 },
      0,
    );
    expect(() => acceptCounter(world.engine, offer.offerId, 0)).toThrow(
      new TradeError(TradeErrorKind.NotCountered, `offer ${offer.offerId} has not been countered`),
    );
    expect(() => acceptCounter(world.engine, 55, 0)).toThrow(/UnknownOffer/);
  });

  it("expires after the third round instead of a fourth", () => {
    const { world, trader, settler } = setup();
    const expired = world.record(offerExpiredEvent);
    const service = getTradeService(world.engine);
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(10), offered: [], coins: 1 },
      0,
    );
    service.putOffer({ ...offer, round: 3, status: OfferStatus.Countered, counterCoins: 3 });
    expect(acceptCounter(world.engine, offer.offerId, 0)).toBeNull();
    world.engine.bus.processQueue();
    expect(service.offers()).toEqual([]);
    expect(expired.at(-1)).toMatchObject({
      offerId: offer.offerId,
      reason: RejectReason.RoundsExhausted,
    });
  });
});

describe("processOffers", () => {
  it("resolves pending offers in ascending id and leaves countered ones waiting", () => {
    const { world, trader, settler } = setup();
    world.engine.store.require(trader.id);
    const merchant = getComponent(trader, merchantComponent);
    expect(merchant?.sellsItems).toBe(true);
    const first = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(60), offered: [], coins: 20 },
      0,
    );
    const second = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(60), offered: [], coins: 20 },
      0,
    );
    const third = proposeOffer(
      world.engine,
      {
        buyerId: settler.id,
        sellerId: trader.id,
        requested: [{ materialId: "coal", quantity: 1 }],
        offered: [],
        coins: 0,
      },
      0,
    );
    processOffers(world.engine, 1);
    // The first takes all the nails; the second finds none (insufficient-stock, first by id wins).
    expect(getTotal(settler, "nails")).toBe(60);
    expect(getTradeService(world.engine).findOffer(first.offerId)).toBeNull();
    expect(getTradeService(world.engine).findOffer(second.offerId)).toBeNull();
    expect(getTradeService(world.engine).findOffer(third.offerId)?.status).toBe(
      OfferStatus.Countered,
    );
    processOffers(world.engine, 2);
    expect(getTradeService(world.engine).findOffer(third.offerId)?.status).toBe(
      OfferStatus.Countered,
    );
  });

  it("expires an unresolved offer after offerTimeoutTicks", () => {
    const { world, trader, settler } = setup();
    const expired = world.record(offerExpiredEvent);
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(1), offered: [], coins: 0 },
      0,
    );
    processOffers(world.engine, 1);
    expect(getTradeService(world.engine).findOffer(offer.offerId)?.status).toBe(
      OfferStatus.Countered,
    );
    processOffers(world.engine, offer.expiryTick);
    world.engine.bus.processQueue();
    expect(getTradeService(world.engine).offers()).toEqual([]);
    expect(expired.at(-1)).toMatchObject({ offerId: offer.offerId, reason: "timeout" });
  });
});

describe("cancelOffer, cancelOffersOf, cancelHostileOffers", () => {
  it("withdraws one offer and reports it", () => {
    const { world, trader, settler } = setup();
    const cancelled = world.record(offerCancelledEvent);
    const offer = proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(1), offered: [], coins: 1 },
      0,
    );
    expect(cancelOffer(world.engine, offer.offerId, "withdrawn")).toBe(true);
    expect(cancelOffer(world.engine, offer.offerId, "withdrawn")).toBe(false);
    world.engine.bus.processQueue();
    expect(cancelled).toHaveLength(1);
  });

  it("cancels every offer of an entity that goes away", () => {
    const { world, trader, settler } = setup();
    for (let count = 0; count < 2; count += 1) {
      proposeOffer(
        world.engine,
        { buyerId: settler.id, sellerId: trader.id, requested: nails(1), offered: [], coins: 1 },
        0,
      );
    }
    cancelOffersOf(world.engine, trader.id);
    expect(getTradeService(world.engine).offers()).toEqual([]);
  });

  it("cancels offers with a trader whose faction turned hostile (faction-hostile)", () => {
    const { world, trader, settler } = setup();
    const cancelled = world.record(offerCancelledEvent);
    proposeOffer(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(1), offered: [], coins: 1 },
      0,
    );
    expect(cancelHostileOffers(world.engine)).toBe(0);
    const faction = getComponent(trader, traderComponent)?.factionId ?? 0;
    setStanding(world.engine, faction, governmentFactionId(world.engine) ?? 0, -40);
    expect(cancelHostileOffers(world.engine)).toBe(1);
    world.engine.bus.processQueue();
    expect(cancelled.at(-1)).toMatchObject({ reason: RejectReason.FactionHostile });
  });
});

describe("negotiate", () => {
  it("completes at the asked price after one counter round", () => {
    const { world, trader, settler } = setup();
    const result = negotiate(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(10), offered: [], coins: 2 },
      5,
      0,
    );
    expect(result).toEqual({ completed: true, reason: null, coins: 3, rounds: 2 });
    expect(world.coins(settler.id)).toBe(37);
  });

  it("gives up when the counter is above what the buyer will pay", () => {
    const { world, trader, settler } = setup();
    const result = negotiate(
      world.engine,
      { buyerId: settler.id, sellerId: trader.id, requested: nails(10), offered: [], coins: 2 },
      2,
      0,
    );
    expect(result).toMatchObject({ completed: false, reason: RejectReason.PriceTooHigh });
    expect(getTradeService(world.engine).offers()).toEqual([]);
    expect(world.coins(settler.id)).toBe(40);
  });

  it("reports a refusal with its reason", () => {
    const { world, trader, settler } = setup();
    expect(
      negotiate(
        world.engine,
        { buyerId: settler.id, sellerId: trader.id, requested: nails(99), offered: [], coins: 9 },
        9,
        0,
      ),
    ).toMatchObject({ completed: false, reason: RejectReason.InsufficientStock });
  });
});
