/**
 * Categories of trade command failure. The enum value is the command error code the player sees
 * at the start of the message.
 */
export enum TradeErrorKind {
  UnknownEntity = "UnknownEntity",
  InvalidItems = "InvalidItems",
  UnknownOffer = "UnknownOffer",
  NotCountered = "NotCountered",
  UnknownTrader = "UnknownTrader",
  TraderAbsent = "TraderAbsent",
  NotWanted = "NotWanted",
  NotSold = "NotSold",
  RefinedCreditExhausted = "RefinedCreditExhausted",
  InsufficientStock = "InsufficientStock",
  UnknownOrder = "UnknownOrder",
  OrderClosed = "OrderClosed",
}

/**
 * Failure of a trade command; callers branch on `kind`.
 */
export class TradeError extends Error {
  /**
   * Creates a trade error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the entity or offer.
   */
  constructor(
    public readonly kind: TradeErrorKind,
    message: string,
  ) {
    super(`${kind}: ${message}`);
    this.name = "TradeError";
  }
}
