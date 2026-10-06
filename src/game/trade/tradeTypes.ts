import type { EntityId } from "../ecs/Entity";

/**
 * Id of the trade system (offers, orders, the refined-credit ledger, trader stock; slot 10).
 */
export const tradeSystemId = "trade";

/**
 * Id of the trader visit system (arrival, stay and departure of caravans; slot 11).
 */
export const traderVisitSystemId = "trade.visits";

/**
 * Id of the treasury system (wage payments, treasury hooks; slot 10).
 */
export const treasurySystemId = "treasury";

/**
 * Name of the PRNG stream that draws the arrival jitter of trader visits (spec 019, D-55).
 */
export const traderVisitStreamName = "trade.visit";

/**
 * Prototype id of the travelling caravan trader (engine prototypes).
 */
export const traderPrototypeId = "trader_caravan";

/**
 * Task type of a caravan's walk to the market, stay and walk out (`trader.visit`).
 */
export const traderVisitTaskType = "trader.visit";

/**
 * Priority of the visit task.
 */
export const traderVisitTaskPriority = 50;

/**
 * Job type id of carrying goods to a trader and selling them (`jobs.json`).
 */
export const tradeSellJobId = "trade.sell";

/**
 * Job type id of buying goods from a trader and bringing them home (`jobs.json`).
 */
export const tradeBuyJobId = "trade.buy";

/**
 * The skill the trade jobs train and the trait hook of the margin reads (`skills.json`).
 */
export const tradingSkillContentId = "trading";

/**
 * Milli-items of refined credit that make one whole item (the ledger counts in milli-items).
 */
export const milliPerItem = 1000;

/**
 * How many finished trade orders the service keeps for the `trade-orders` query.
 */
export const finishedOrderHistory = 16;

/**
 * Failed trips after which an order is cancelled (`too_many_failures`).
 */
export const maxOrderFailures = 3;

/**
 * Times a trade job re-targets a source or trader that moved (the haul rule of D-26).
 */
export const maxTradeApproaches = 5;

/**
 * Failure reason of a trade job: the trader left or is no longer there.
 */
export const traderGoneReason = "trader_gone";

/**
 * Failure reason of a trade job: the trade itself was refused or failed.
 */
export const tradeFailedReason = "trade_failed";

/**
 * Failure reason of a trade job: nothing was available to sell, or no money to buy with.
 */
export const nothingToTradeReason = "nothing_to_trade";

/**
 * Cancel reason of an order that failed too often.
 */
export const tooManyFailuresReason = "too_many_failures";

/**
 * Cancel reason of an order cancelled by the player.
 */
export const cancelledByPlayerReason = "cancelled_by_player";

/**
 * Which way a trade order moves goods, seen from the settlement. The enum value is serialized.
 */
export enum OrderDirection {
  /**
   * The settlement sells goods to the trader.
   */
  Sell = "Sell",
  /**
   * The settlement buys goods from the trader.
   */
  Buy = "Buy",
}

/**
 * State of a trade order. The enum value is serialized.
 */
export enum OrderStatus {
  Open = "Open",
  Done = "Done",
  Cancelled = "Cancelled",
}

/**
 * State of an offer in the service. Accepted and rejected offers leave the list at once (D-12:
 * no "accepted, awaiting execution" state). The enum value is serialized.
 */
export enum OfferStatus {
  /**
   * Waits for the next trade step.
   */
  Pending = "Pending",
  /**
   * The seller asked for more coins; the buyer may accept the counter.
   */
  Countered = "Countered",
}

/**
 * Why an offer was refused (`trade.offer.rejected` reason). The enum value is the event payload.
 */
export enum RejectReason {
  /**
   * Seller and buyer are the same entity; refused silently (no event).
   */
  SelfTrade = "self-trade",
  FactionHostile = "faction-hostile",
  UnknownItemValue = "unknown-item-value",
  InsufficientStock = "insufficient-stock",
  /**
   * The buyer cannot pay what it offers.
   */
  InsufficientFunds = "insufficient-funds",
  /**
   * The buying trader does not want the goods.
   */
  NotWanted = "not-wanted",
  /**
   * The seller of a proposal is not marked `sellsItems`.
   */
  NotForSale = "not-for-sale",
  /**
   * The counter was above what the buyer is willing to pay.
   */
  PriceTooHigh = "price-too-high",
  /**
   * More than `maxNegotiationRounds` rounds.
   */
  RoundsExhausted = "rounds-exhausted",
}

/**
 * Detail of an `insufficient-stock` refusal of a refined good: the ledger credit is used up.
 */
export const refinedCreditExhaustedDetail = "refined-credit-exhausted";

/**
 * Why an accepted trade could not be executed (`trade.execution.failed` reason).
 */
export enum ExecutionFailure {
  BuyerInventoryFull = "buyer-inventory-full",
  SellerInventoryFull = "seller-inventory-full",
  BuyerDeleted = "buyer-deleted",
  SellerDeleted = "seller-deleted",
  /**
   * The goods or coins were no longer there or were promised to someone else.
   */
  StockChanged = "stock-changed",
}

/**
 * A quantity of one material.
 */
export type Item = {
  materialId: string;
  quantity: number;
};

/**
 * One transfer of an executed trade: the goods or coins move from one inventory to another.
 */
export type Leg = {
  fromId: EntityId;
  toId: EntityId;
  materialId: string;
  quantity: number;
};

/**
 * One pending trade offer (D-12). `requested` goods go from the seller to the buyer, `offered`
 * barter items and `coins` go the other way.
 */
export type TradeOffer = {
  /**
   * From the persisted `nextOfferId`, never reused.
   */
  offerId: number;
  /**
   * The offerId of round one; the same through the counters.
   */
  negotiationId: number;
  /**
   * 1-based round.
   */
  round: number;
  buyerId: EntityId;
  sellerId: EntityId;
  requested: Item[];
  offered: Item[];
  coins: number;
  status: OfferStatus;
  /**
   * The coins the seller asks, while the offer is countered; null otherwise.
   */
  counterCoins: number | null;
  createdTick: number;
  expiryTick: number;
};

/**
 * A standing request of the player: sell or buy a quantity of one material with a kind of trader.
 * It outlives visits (it names the trader prototype, not a caravan entity) and posts trade jobs
 * while a matching trader is at the market.
 */
export type TradeOrder = {
  orderId: number;
  traderPrototypeId: string;
  direction: OrderDirection;
  materialId: string;
  /**
   * The ordered quantity.
   */
  quantity: number;
  /**
   * Still to trade.
   */
  remaining: number;
  /**
   * Coins earned (sell) or spent (buy) so far.
   */
  coins: number;
  /**
   * The open trade job, or null while none is posted.
   */
  postingId: number | null;
  status: OrderStatus;
  /**
   * Trips that failed since the last success.
   */
  failures: number;
  createdTick: number;
  finishedTick: number | null;
  /**
   * Why the order was cancelled, or null.
   */
  reason: string | null;
};

/**
 * Refined credit of one settlement with one kind of trader (D-13): milli-items of a refined good
 * the trader may still sell. Never expires.
 */
export type LedgerEntry = {
  traderPrototypeId: string;
  settlementFactionId: EntityId;
  refinedMaterialId: string;
  creditMilli: number;
};

/**
 * Visit schedule of one kind of trader.
 */
export type VisitRecord = {
  traderPrototypeId: string;
  /**
   * Tick at which the next caravan sets out (used while no caravan is on the map).
   */
  nextArrivalTick: number;
  /**
   * The caravan entity now on the map, or null.
   */
  entityId: EntityId | null;
};

/**
 * Standing gained per faction on one day, for the daily cap of D-14.
 */
export type StandingGain = {
  factionId: EntityId;
  gains: number;
};

/**
 * Phases of a caravan visit. The enum value is serialized.
 */
export enum TraderPhase {
  /**
   * Walking in from the map edge.
   */
  Arriving = "Arriving",
  /**
   * At the market; trades are possible.
   */
  Present = "Present",
  /**
   * Walking out.
   */
  Leaving = "Leaving",
}

/**
 * One wage waiting for the treasury or the worker's inventory (spec 019 FR-012/013).
 */
export type PendingWage = {
  /**
   * The claim id of the completed job (D-12).
   */
  paymentId: number;
  workerId: EntityId;
  amount: number;
  createdTick: number;
};

/**
 * One refine rule of a trader: selling `rawMaterialId` earns credit for `refinedMaterialId`.
 */
export type RefineRule = {
  rawMaterialId: string;
  refinedMaterialId: string;
  /**
   * Milli-items of credit per raw item sold (500 = one refined good per two raw).
   */
  ratioMilli: number;
};

/**
 * Event: a trade offer was made.
 */
export const offerProposedEvent = "trade.offer.proposed";

/**
 * Event: an offer was accepted (and is executed in the same step).
 */
export const offerAcceptedEvent = "trade.offer.accepted";

/**
 * Event: an offer was refused.
 */
export const offerRejectedEvent = "trade.offer.rejected";

/**
 * Event: an offer was withdrawn or cancelled.
 */
export const offerCancelledEvent = "trade.offer.cancelled";

/**
 * Event: an offer timed out or ran out of rounds.
 */
export const offerExpiredEvent = "trade.offer.expired";

/**
 * Event: the seller asked for more coins.
 */
export const offerCounteredEvent = "trade.offer.countered";

/**
 * Event: a trade was executed.
 */
export const tradeCompletedEvent = "trade.completed";

/**
 * Event: an accepted trade could not be executed (nothing moved).
 */
export const executionFailedEvent = "trade.execution.failed";

/**
 * Event: the refined credit of a settlement changed.
 */
export const creditChangedEvent = "trade.credit.changed";

/**
 * Event: a trade order was created.
 */
export const orderCreatedEvent = "trade.order.created";

/**
 * Event: a trade order was fulfilled.
 */
export const orderCompletedEvent = "trade.order.completed";

/**
 * Event: a trade order command was refused (the order does not exist; `command.rejected` only
 * carries a code, this says why).
 */
export const orderRefusedEvent = "trade.order.refused";

/**
 * Event: a trade order was cancelled.
 */
export const orderCancelledEvent = "trade.order.cancelled";

/**
 * Event: a caravan reached the market.
 */
export const traderArrivedEvent = "trader.arrived";

/**
 * Event: a caravan left the map.
 */
export const traderLeftEvent = "trader.left";

/**
 * Event: a wage could not be paid yet and was queued.
 */
export const paymentDeferredEvent = "treasury.payment.deferred";

/**
 * Event: a wage was paid.
 */
export const paymentCompletedEvent = "treasury.payment.completed";

/**
 * Event: the settlement has no treasury.
 */
export const treasuryUnavailableEvent = "treasury.unavailable";

/**
 * Event: rent reached the treasury (the hook of task 4.5).
 */
export const rentReceivedEvent = "treasury.rent.received";

/**
 * Payload of the offer events `proposed`.
 */
export type OfferProposed = {
  offerId: number;
  negotiationId: number;
  round: number;
  buyerId: EntityId;
  sellerId: EntityId;
  requested: Item[];
  offered: Item[];
  coins: number;
};

/**
 * Payload of `trade.offer.accepted`, `.rejected`, `.cancelled` and `.expired`. `reason` is null
 * for an acceptance; `detail` refines a refusal (`refined-credit-exhausted`).
 */
export type OfferResolved = {
  offerId: number;
  buyerId: EntityId;
  sellerId: EntityId;
  reason: string | null;
  detail: string | null;
};

/**
 * Payload of `trade.offer.countered`.
 */
export type OfferCountered = {
  offerId: number;
  buyerId: EntityId;
  sellerId: EntityId;
  counterCoins: number;
  round: number;
};

/**
 * Payload of `trade.completed`.
 */
export type TradeCompleted = {
  offerId: number;
  buyerId: EntityId;
  sellerId: EntityId;
  /**
   * What the buyer received.
   */
  items: Item[];
  /**
   * What the seller received (coins as `silver_penny`).
   */
  payment: Item[];
  tick: number;
};

/**
 * Payload of `trade.execution.failed`.
 */
export type ExecutionFailed = {
  offerId: number;
  reason: string;
};

/**
 * Payload of `trade.credit.changed`.
 */
export type CreditChanged = {
  traderPrototypeId: string;
  settlementFactionId: EntityId;
  refinedMaterialId: string;
  creditMilli: number;
};

/**
 * Payload of the order events.
 */
export type OrderEvent = {
  orderId: number;
  traderPrototypeId: string;
  direction: OrderDirection;
  materialId: string;
  quantity: number;
  reason: string | null;
};

/**
 * Payload of `trade.order.refused`: the order asked for, the `TradeErrorKind` and its message.
 */
export type OrderRefused = {
  direction: OrderDirection;
  traderId: EntityId;
  materialId: string;
  quantity: number;
  kind: string;
  message: string;
};

/**
 * Payload of `trader.arrived` and `trader.left`.
 */
export type TraderVisitEvent = {
  entityId: EntityId;
  traderPrototypeId: string;
  factionId: EntityId;
};

/**
 * Payload of `treasury.payment.deferred` and `.completed`.
 */
export type PaymentEvent = {
  paymentId: number;
  workerId: EntityId;
  amount: number;
};

/**
 * Payload of `treasury.rent.received`.
 */
export type RentReceived = {
  dwellingId: EntityId;
  amount: number;
};
