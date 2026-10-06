import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { ceilDiv, floorDiv } from "../engine/fixedPoint";
import { governmentFactionId } from "../factions/factionRegistry";
import { getStanding } from "../factions/factionStanding";
import { isHostilePair } from "../factions/standingAttitude";
import { getTotal } from "../inventory/inventoryQueries";
import { marginAddPermille } from "../skills/traitModifiers";
import { getStorageService } from "../storage/storageServiceRegistry";
import { merchantComponent } from "./merchantComponent";
import { refinedAllowance } from "./refinedLedger";
import {
  effectiveMultiplierPermille,
  minAcceptableMilli,
  permilleOne,
  scarcityPermille,
  valueOfItemsMilli,
} from "./tradePricing";
import { RejectReason, refinedCreditExhaustedDetail } from "./tradeTypes";
import type { Item, TradeOffer } from "./tradeTypes";
import { traderComponent } from "./traderComponent";

/**
 * What a seller decided about an offer. The enum value is a log label.
 */
export enum EvaluationKind {
  Accept = "accept",
  Counter = "counter",
  Reject = "reject",
}

/**
 * The result of {@link evaluateOffer}.
 */
export type Evaluation = {
  kind: EvaluationKind;
  /**
   * Why the offer was refused (kind Reject), otherwise null.
   */
  reason: RejectReason | null;
  /**
   * Refines a refusal, e.g. `refined-credit-exhausted`.
   */
  detail: string | null;
  /**
   * The least the seller accepts, milli-coins.
   */
  minAcceptableMilli: number;
  /**
   * What the buyer offers, milli-coins (coins plus barter goods at their plain value).
   */
  offeredMilli: number;
  /**
   * The coins the seller asks to accept (kind Counter), otherwise null.
   */
  counterCoins: number | null;
};

function reject(reason: RejectReason, detail: string | null = null): Evaluation {
  return {
    kind: EvaluationKind.Reject,
    reason,
    detail,
    minAcceptableMilli: 0,
    offeredMilli: 0,
    counterCoins: null,
  };
}

/**
 * Whether the standing between a trader faction and the settlement forbids trade (spec 021:
 * either side below `hostileStanding`, -30).
 *
 * @param engine - The engine.
 * @param factionId - The trader's faction entity; 0 means none.
 * @returns True when trade is refused with `faction-hostile`.
 */
export function isFactionHostile(engine: GameEngine, factionId: number): boolean {
  const government = governmentFactionId(engine);
  if (factionId === 0 || government === null) {
    return false;
  }
  return isHostilePair(engine, factionId, government);
}

/**
 * Whether trade with a trader is refused because its faction is hostile.
 *
 * @param engine - The engine.
 * @param trader - The entity; only entities with a `Trader` component can be hostile.
 * @returns True when trade is refused with `faction-hostile`.
 */
export function isTradeHostile(engine: GameEngine, trader: Entity): boolean {
  const data = getComponent(trader, traderComponent);
  return data !== undefined && isFactionHostile(engine, data.factionId);
}

/**
 * Whether a trade agreement discount applies to a trader's prices (the standing hook of D-12:
 * the trader's faction holds an agreement with the settlement).
 *
 * @param engine - The engine.
 * @param trader - The trader entity.
 * @returns True when an agreement stands.
 */
export function hasTradeAgreement(engine: GameEngine, trader: Entity): boolean {
  const data = getComponent(trader, traderComponent);
  const government = governmentFactionId(engine);
  if (data === undefined || data.factionId === 0 || government === null) {
    return false;
  }
  return (
    getStanding(engine, data.factionId, government).tradeAgreement ||
    getStanding(engine, government, data.factionId).tradeAgreement
  );
}

/**
 * The margin a seller asks in permille: its `minimumMarginRate` (the content default
 * `defaultMinimumMarginRate` unless the entity has its own) plus the trait margin of the seller
 * (Greedy +50, `marginAddPermille`).
 *
 * @param engine - The engine.
 * @param seller - The selling entity.
 * @returns Permille.
 */
export function sellerMarginPermille(engine: GameEngine, seller: Entity): number {
  const merchant = getComponent(seller, merchantComponent);
  const base =
    merchant?.minimumMarginRatePermille ?? engine.content.constants.defaultMinimumMarginRate;
  return base + marginAddPermille(engine.content, seller);
}

/**
 * What the seller asks for goods, in milli-coins (D-12 step 2 with the scarcity and agreement
 * modifiers of D-55): the plain value of the goods (a trader's scarce goods carry their premium)
 * times the seller's multiplier, the agreement discount and one plus the margin, rounded up.
 *
 * @param engine - The engine.
 * @param seller - The selling entity.
 * @param items - The goods.
 * @returns Milli-coins, or null when a good has no value.
 */
export function askedMilli(
  engine: GameEngine,
  seller: Entity,
  items: readonly Item[],
): number | null {
  const merchant = getComponent(seller, merchantComponent);
  const trader = getComponent(seller, traderComponent);
  const constants = engine.content.constants;
  let scaled = 0;
  for (const item of items) {
    const value = valueOfItemsMilli(engine.materials, [item]);
    if (value === null) {
      return null;
    }
    const target =
      trader?.sells.find((entry) => entry.materialId === item.materialId)?.quantity ?? 0;
    const scarcity = scarcityPermille(
      getTotal(seller, item.materialId),
      target,
      constants.scarcityMaxPremium,
    );
    scaled += floorDiv(value * scarcity, permilleOne);
  }
  const agreement =
    trader !== undefined && hasTradeAgreement(engine, seller)
      ? constants.agreementDiscount
      : permilleOne;
  const multiplier = effectiveMultiplierPermille(
    merchant?.priceMultiplierMilli ?? permilleOne,
    agreement,
    permilleOne,
  );
  return minAcceptableMilli(scaled, multiplier, sellerMarginPermille(engine, seller));
}

/**
 * The seller's decision about an offer (DECISIONS D-12 steps 1 and 2): refuse (self trade,
 * hostile faction, unknown value, too little stock or refined credit, goods the buying trader does
 * not want, a buyer that cannot pay), accept when the offered value reaches the least the seller
 * accepts, otherwise counter with the coins it asks. Nothing moves here.
 *
 * @param engine - The engine.
 * @param offer - The offer; both parties must exist.
 * @returns The decision.
 */
export function evaluateOffer(engine: GameEngine, offer: TradeOffer): Evaluation {
  const buyer = engine.store.get(offer.buyerId);
  const seller = engine.store.get(offer.sellerId);
  if (buyer === undefined || seller === undefined) {
    return reject(RejectReason.InsufficientStock);
  }
  if (buyer.id === seller.id) {
    return reject(RejectReason.SelfTrade);
  }
  if (isTradeHostile(engine, buyer) || isTradeHostile(engine, seller)) {
    return reject(RejectReason.FactionHostile);
  }
  const requestedValue = valueOfItemsMilli(engine.materials, offer.requested);
  const barterValue = valueOfItemsMilli(engine.materials, offer.offered);
  const asked = askedMilli(engine, seller, offer.requested);
  if (requestedValue === null || barterValue === null || asked === null) {
    return reject(RejectReason.UnknownItemValue);
  }
  const reservations = getStorageService(engine).reservations;
  const buyingTrader = getComponent(buyer, traderComponent);
  for (const item of offer.requested) {
    if (buyingTrader !== undefined && !buyingTrader.buys.includes(item.materialId)) {
      return reject(RejectReason.NotWanted);
    }
    const allowance = refinedAllowance(engine, seller, item.materialId);
    if (allowance !== null && item.quantity > allowance) {
      return reject(RejectReason.InsufficientStock, refinedCreditExhaustedDetail);
    }
    if (reservations.availableTo(seller.id, item.materialId, buyer.id) < item.quantity) {
      return reject(RejectReason.InsufficientStock);
    }
  }
  const coin = engine.materials.currencyId;
  const payments: Item[] = [
    ...offer.offered,
    ...(offer.coins > 0 ? [{ materialId: coin, quantity: offer.coins }] : []),
  ];
  for (const item of payments) {
    if (reservations.availableTo(buyer.id, item.materialId, seller.id) < item.quantity) {
      return reject(RejectReason.InsufficientFunds);
    }
  }
  const offeredMilli = offer.coins * 1000 + barterValue;
  if (offeredMilli >= asked) {
    return {
      kind: EvaluationKind.Accept,
      reason: null,
      detail: null,
      minAcceptableMilli: asked,
      offeredMilli,
      counterCoins: null,
    };
  }
  return {
    kind: EvaluationKind.Counter,
    reason: null,
    detail: null,
    minAcceptableMilli: asked,
    offeredMilli,
    counterCoins: Math.max(0, ceilDiv(asked - barterValue, 1000)),
  };
}
