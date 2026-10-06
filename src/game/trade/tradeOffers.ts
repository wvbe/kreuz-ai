import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { EvaluationKind, evaluateOffer, isTradeHostile } from "./tradeEvaluation";
import { executeTrade } from "./tradeExecution";
import { merchantComponent } from "./merchantComponent";
import { settleTrade } from "./tradeSettlement";
import { getTradeService } from "./tradeServiceRegistry";
import { TradeError, TradeErrorKind } from "./TradeError";
import {
  ExecutionFailure,
  OfferStatus,
  RejectReason,
  executionFailedEvent,
  offerAcceptedEvent,
  offerCancelledEvent,
  offerCounteredEvent,
  offerExpiredEvent,
  offerProposedEvent,
  offerRejectedEvent,
} from "./tradeTypes";
import type {
  ExecutionFailed,
  Item,
  OfferCountered,
  OfferProposed,
  OfferResolved,
  TradeOffer,
} from "./tradeTypes";

/**
 * How one resolution step of an offer ended. The enum value is a log label.
 */
export enum OfferOutcome {
  /**
   * The trade was executed.
   */
  Completed = "completed",
  /**
   * The seller refused.
   */
  Rejected = "rejected",
  /**
   * The seller asked for more coins; the offer waits for the buyer.
   */
  Countered = "countered",
  /**
   * The seller agreed but the trade could not be executed; nothing moved.
   */
  Failed = "failed",
}

/**
 * Result of {@link resolveOffer}.
 */
export type OfferResolution = {
  outcome: OfferOutcome;
  /**
   * The reason of a refusal or failure, otherwise null.
   */
  reason: string | null;
  /**
   * The coins the seller asks (outcome Countered), otherwise null.
   */
  counterCoins: number | null;
};

/**
 * What a buyer proposes: goods from the seller against coins and/or barter goods.
 */
export type OfferRequest = {
  buyerId: EntityId;
  sellerId: EntityId;
  requested: Item[];
  offered: Item[];
  coins: number;
};

function describe(offer: TradeOffer, reason: string | null, detail: string | null): OfferResolved {
  return {
    offerId: offer.offerId,
    buyerId: offer.buyerId,
    sellerId: offer.sellerId,
    reason,
    detail,
  };
}

function checkItems(engine: GameEngine, items: readonly Item[], label: string): void {
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new TradeError(
        TradeErrorKind.InvalidItems,
        `${label} ${item.materialId}: quantity must be a positive integer`,
      );
    }
    engine.materials.require(item.materialId);
  }
}

/**
 * Makes a trade offer (spec 019 FR-004/005, DECISIONS D-12): the offer is stored and
 * `trade.offer.proposed` is queued; the seller answers in the next trade step (slot 10).
 *
 * @param engine - The engine.
 * @param request - Buyer, seller, requested goods, barter goods and coins.
 * @param tick - The current tick.
 * @param round - The round (1 for a new negotiation).
 * @param negotiationId - The first offer's id of a running negotiation, or null for a new one.
 * @returns A copy of the stored offer.
 */
export function proposeOffer(
  engine: GameEngine,
  request: OfferRequest,
  tick: number,
  round = 1,
  negotiationId: number | null = null,
): TradeOffer {
  for (const id of [request.buyerId, request.sellerId]) {
    if (!engine.store.has(id)) {
      throw new TradeError(TradeErrorKind.UnknownEntity, `entity ${id} does not exist`);
    }
  }
  if (request.requested.length === 0) {
    throw new TradeError(TradeErrorKind.InvalidItems, "an offer must request at least one item");
  }
  if (!Number.isSafeInteger(request.coins) || request.coins < 0) {
    throw new TradeError(
      TradeErrorKind.InvalidItems,
      "coins must be a whole number of coins, 0 or more",
    );
  }
  checkItems(engine, request.requested, "requested");
  checkItems(engine, request.offered, "offered");
  const service = getTradeService(engine);
  const offerId = service.allocateOfferId();
  const offer: TradeOffer = {
    offerId,
    negotiationId: negotiationId ?? offerId,
    round,
    buyerId: request.buyerId,
    sellerId: request.sellerId,
    requested: request.requested.map((item) => ({ ...item })),
    offered: request.offered.map((item) => ({ ...item })),
    coins: request.coins,
    status: OfferStatus.Pending,
    counterCoins: null,
    createdTick: tick,
    expiryTick: tick + engine.content.constants.offerTimeoutTicks,
  };
  service.putOffer(offer);
  const payload: OfferProposed = {
    offerId,
    negotiationId: offer.negotiationId,
    round,
    buyerId: offer.buyerId,
    sellerId: offer.sellerId,
    requested: offer.requested,
    offered: offer.offered,
    coins: offer.coins,
  };
  engine.bus.emit(offerProposedEvent, payload);
  return offer;
}

/**
 * Takes an offer back (withdrawn by the buyer, or cancelled because a party or the faction gate
 * changed): removes it and queues `trade.offer.cancelled`.
 *
 * @param engine - The engine.
 * @param offerId - Offer id.
 * @param reason - Why (`withdrawn`, `faction-hostile`, `buyer-deleted`, `seller-deleted`).
 * @returns True when the offer existed.
 */
export function cancelOffer(engine: GameEngine, offerId: number, reason: string): boolean {
  const service = getTradeService(engine);
  const offer = service.findOffer(offerId);
  if (offer === null) {
    return false;
  }
  service.removeOffer(offerId);
  engine.bus.emit(offerCancelledEvent, describe(offer, reason, null));
  return true;
}

/**
 * The buyer accepts a counter: the offer goes into its next round with the coins the seller asked
 * for. Beyond `maxNegotiationRounds` the offer expires instead (spec 019 FR-011).
 *
 * @param engine - The engine.
 * @param offerId - Offer id of a countered offer.
 * @param tick - The current tick.
 * @returns The offer in its new round, or null when it expired.
 */
export function acceptCounter(
  engine: GameEngine,
  offerId: number,
  tick: number,
): TradeOffer | null {
  const service = getTradeService(engine);
  const offer = service.findOffer(offerId);
  if (offer === null) {
    throw new TradeError(TradeErrorKind.UnknownOffer, `offer ${offerId} does not exist`);
  }
  if (offer.status !== OfferStatus.Countered || offer.counterCoins === null) {
    throw new TradeError(TradeErrorKind.NotCountered, `offer ${offerId} has not been countered`);
  }
  if (offer.round >= engine.content.constants.maxNegotiationRounds) {
    service.removeOffer(offerId);
    engine.bus.emit(offerExpiredEvent, describe(offer, RejectReason.RoundsExhausted, null));
    return null;
  }
  const next: TradeOffer = {
    ...offer,
    round: offer.round + 1,
    coins: offer.counterCoins,
    status: OfferStatus.Pending,
    counterCoins: null,
    expiryTick: tick + engine.content.constants.offerTimeoutTicks,
  };
  service.putOffer(next);
  const payload: OfferProposed = {
    offerId: next.offerId,
    negotiationId: next.negotiationId,
    round: next.round,
    buyerId: next.buyerId,
    sellerId: next.sellerId,
    requested: next.requested,
    offered: next.offered,
    coins: next.coins,
  };
  engine.bus.emit(offerProposedEvent, payload);
  return next;
}

/**
 * One resolution step of a pending offer (D-12 steps 1 to 4): the seller refuses, counters or
 * accepts; an accepted offer is executed in the same step. Refusals and executions are reported
 * with their events and the offer leaves the list, except a counter, which keeps it waiting.
 *
 * @param engine - The engine.
 * @param offerId - Offer id of a pending offer.
 * @param requireSellsItems - True for proposals from commands and the AI (the seller must have
 * `sellsItems`); false for the settlers' own trade jobs, whose seller is the party at hand.
 * @returns How the step ended.
 */
export function resolveOffer(
  engine: GameEngine,
  offerId: number,
  requireSellsItems: boolean,
): OfferResolution {
  const service = getTradeService(engine);
  const offer = service.findOffer(offerId);
  if (offer === null) {
    return { outcome: OfferOutcome.Failed, reason: "unknown-offer", counterCoins: null };
  }
  const buyer = engine.store.get(offer.buyerId);
  const seller = engine.store.get(offer.sellerId);
  if (buyer === undefined || seller === undefined) {
    const reason =
      buyer === undefined ? ExecutionFailure.BuyerDeleted : ExecutionFailure.SellerDeleted;
    service.removeOffer(offerId);
    engine.bus.emit(offerCancelledEvent, describe(offer, reason, null));
    return { outcome: OfferOutcome.Failed, reason, counterCoins: null };
  }
  const refuse = (reason: RejectReason, detail: string | null): OfferResolution => {
    service.removeOffer(offerId);
    if (reason !== RejectReason.SelfTrade) {
      engine.bus.emit(offerRejectedEvent, describe(offer, reason, detail));
    }
    return { outcome: OfferOutcome.Rejected, reason: detail ?? reason, counterCoins: null };
  };
  if (requireSellsItems && getComponent(seller, merchantComponent)?.sellsItems !== true) {
    return refuse(RejectReason.NotForSale, null);
  }
  const evaluation = evaluateOffer(engine, offer);
  if (evaluation.kind === EvaluationKind.Reject) {
    return refuse(evaluation.reason ?? RejectReason.InsufficientStock, evaluation.detail);
  }
  if (evaluation.kind === EvaluationKind.Counter) {
    const counterCoins = evaluation.counterCoins ?? 0;
    service.putOffer({ ...offer, status: OfferStatus.Countered, counterCoins });
    const payload: OfferCountered = {
      offerId,
      buyerId: offer.buyerId,
      sellerId: offer.sellerId,
      counterCoins,
      round: offer.round,
    };
    engine.bus.emit(offerCounteredEvent, payload);
    return { outcome: OfferOutcome.Countered, reason: null, counterCoins };
  }
  engine.bus.emit(offerAcceptedEvent, describe(offer, null, null));
  const result = executeTrade(engine, offer);
  service.removeOffer(offerId);
  if (!result.ok) {
    const payload: ExecutionFailed = { offerId, reason: result.reason };
    engine.bus.emit(executionFailedEvent, payload);
    return { outcome: OfferOutcome.Failed, reason: result.reason, counterCoins: null };
  }
  settleTrade(engine, offer, result.legs);
  return { outcome: OfferOutcome.Completed, reason: null, counterCoins: null };
}

/**
 * The trade step (slot 10): offers whose timeout passed expire (`trade.offer.expired`), every
 * pending offer is resolved in ascending offer id; countered offers wait for the buyer.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 */
export function processOffers(engine: GameEngine, tick: number): void {
  const service = getTradeService(engine);
  for (const offer of service.offers()) {
    if (tick >= offer.expiryTick) {
      service.removeOffer(offer.offerId);
      engine.bus.emit(offerExpiredEvent, describe(offer, "timeout", null));
    } else if (offer.status === OfferStatus.Pending) {
      resolveOffer(engine, offer.offerId, true);
    }
  }
}

/**
 * Cancels the open offers of an entity that is being deleted (`buyer-deleted` or
 * `seller-deleted`).
 *
 * @param engine - The engine.
 * @param entityId - The entity that goes away.
 */
export function cancelOffersOf(engine: GameEngine, entityId: EntityId): void {
  for (const offer of getTradeService(engine).offers()) {
    if (offer.buyerId === entityId || offer.sellerId === entityId) {
      cancelOffer(
        engine,
        offer.offerId,
        offer.buyerId === entityId ? ExecutionFailure.BuyerDeleted : ExecutionFailure.SellerDeleted,
      );
    }
  }
}

/**
 * Cancels the open offers with a trader whose faction became hostile (standing below -30): the
 * reaction to `diplomacy.standing.changed` (spec 021 US6, D-12).
 *
 * @param engine - The engine.
 * @returns The number of offers cancelled.
 */
export function cancelHostileOffers(engine: GameEngine): number {
  let cancelled = 0;
  for (const offer of getTradeService(engine).offers()) {
    const parties = [offer.buyerId, offer.sellerId]
      .map((id) => engine.store.get(id))
      .filter((entity) => entity !== undefined);
    if (parties.some((party) => isTradeHostile(engine, party))) {
      cancelled += cancelOffer(engine, offer.offerId, RejectReason.FactionHostile) ? 1 : 0;
    }
  }
  return cancelled;
}

/**
 * What a synchronous negotiation produced (see {@link negotiate}).
 */
export type Negotiation = {
  completed: boolean;
  /**
   * The refusal or failure reason, null when completed.
   */
  reason: string | null;
  /**
   * Coins the buyer finally paid.
   */
  coins: number;
  /**
   * Rounds used.
   */
  rounds: number;
};

/**
 * Runs a whole negotiation in one go for an agent that is standing at its counterpart (the
 * settlers' trade jobs): propose, resolve, and while the seller counters and the buyer is willing
 * to pay up to `maxCoins`, re-propose with the counter, at most `maxNegotiationRounds` rounds.
 * Every step emits the same events and obeys the same rules as a proposal by command.
 *
 * @param engine - The engine.
 * @param request - The first proposal.
 * @param maxCoins - Most coins the buyer is willing to pay.
 * @param tick - The current tick.
 * @returns The outcome; nothing moved unless `completed`.
 */
export function negotiate(
  engine: GameEngine,
  request: OfferRequest,
  maxCoins: number,
  tick: number,
): Negotiation {
  let offer = proposeOffer(engine, request, tick);
  const maxRounds = engine.content.constants.maxNegotiationRounds;
  for (;;) {
    const result = resolveOffer(engine, offer.offerId, false);
    if (result.outcome === OfferOutcome.Completed) {
      return { completed: true, reason: null, coins: offer.coins, rounds: offer.round };
    }
    if (result.outcome !== OfferOutcome.Countered) {
      return { completed: false, reason: result.reason, coins: 0, rounds: offer.round };
    }
    if ((result.counterCoins ?? 0) > maxCoins) {
      cancelOffer(engine, offer.offerId, RejectReason.PriceTooHigh);
      return { completed: false, reason: RejectReason.PriceTooHigh, coins: 0, rounds: offer.round };
    }
    const next = acceptCounter(engine, offer.offerId, tick);
    if (next === null) {
      return {
        completed: false,
        reason: RejectReason.RoundsExhausted,
        coins: 0,
        rounds: maxRounds,
      };
    }
    offer = next;
  }
}
