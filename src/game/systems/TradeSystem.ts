/**
 * Trade system: merchant entities, trade offers, price calculation.
 */

export type TradeOffer = {
  offerId: string;
  materialId: string;
  quantity: number;
  pricePerUnit: number;
  isBuying: boolean;
};

export type Merchant = {
  merchantId: string;
  entityId: number;
  faction: string;
  offers: TradeOffer[];
  currency: number;
};

export type TradeSystem = {
  merchants: Map<string, Merchant>;
  basePrices: Map<string, number>;
};

/**
 * Creates a new trade system.
 */
export function createTradeSystem(): TradeSystem {
  return { merchants: new Map(), basePrices: new Map() };
}

/**
 * Registers a merchant.
 */
export function registerMerchant(
  system: TradeSystem,
  merchantId: string,
  entityId: number,
  faction: string,
  currency: number,
): Merchant {
  const merchant: Merchant = { merchantId, entityId, faction, offers: [], currency };
  system.merchants.set(merchantId, merchant);
  return merchant;
}

/**
 * Adds a trade offer to a merchant.
 */
export function addTradeOffer(
  merchant: Merchant,
  offerId: string,
  materialId: string,
  quantity: number,
  pricePerUnit: number,
  isBuying: boolean,
): void {
  merchant.offers.push({ offerId, materialId, quantity, pricePerUnit, isBuying });
}

/**
 * Executes a trade: player buys from merchant.
 */
export function executeBuy(
  merchant: Merchant,
  offerId: string,
  quantity: number,
  playerCurrency: number,
): { cost: number; actualQuantity: number } | undefined {
  const offer = merchant.offers.find((o) => o.offerId === offerId && !o.isBuying);
  if (!offer) return undefined;

  const actualQuantity = Math.min(quantity, offer.quantity);
  const cost = actualQuantity * offer.pricePerUnit;
  if (cost > playerCurrency) return undefined;

  offer.quantity -= actualQuantity;
  merchant.currency += cost;
  return { cost, actualQuantity };
}
