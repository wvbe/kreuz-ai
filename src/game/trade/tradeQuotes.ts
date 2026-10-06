import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getTotal } from "../inventory/inventoryQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { refinedAllowance } from "./refinedLedger";
import { askedMilli } from "./tradeEvaluation";
import { traderBidCoins, traderCeilingCoins, valueOfItemsMilli, wholeCoins } from "./tradePricing";
import { OrderDirection } from "./tradeTypes";
import { traderComponent } from "./traderComponent";

/**
 * What a trade of a quantity would cost or earn, seen from the settlement.
 */
export type TradeQuote = {
  direction: OrderDirection;
  materialId: string;
  quantity: number;
  /**
   * Coins the settlement pays (Buy) or the trader bids (Sell) for the quantity; null when the
   * material has no value.
   */
  coins: number | null;
  /**
   * Most coins the trader would pay after a counter (Sell), otherwise equal to `coins`.
   */
  ceilingCoins: number | null;
  /**
   * Buy: the most units the trader can sell now (its stock minus reservations, capped by the
   * refined credit). Sell: the coins left in the trader's purse (0 when it does not want the
   * material).
   */
  available: number;
  /**
   * Why the trader will not trade this material in this direction, or null.
   */
  reason: string | null;
};

/**
 * Reason of a quote: the trader does not buy the material.
 */
export const notWantedQuoteReason = "not-wanted";

/**
 * Reason of a quote: the trader does not sell the material.
 */
export const notSoldQuoteReason = "not-sold";

/**
 * Reason of a quote: the refined credit is used up (D-13).
 */
export const creditExhaustedQuoteReason = "refined-credit-exhausted";

/**
 * Whole units of a material a trader can sell right now: its stash minus what others reserved,
 * limited to the refined credit for a refined good (D-13).
 *
 * @param engine - The engine.
 * @param trader - The trader entity.
 * @param materialId - The material.
 * @returns Units, 0 when it does not sell the material.
 */
export function sellableQuantity(engine: GameEngine, trader: Entity, materialId: string): number {
  const stash = getStorageService(engine).reservations.availableTo(trader.id, materialId, null);
  const allowance = refinedAllowance(engine, trader, materialId);
  return allowance === null ? stash : Math.min(stash, allowance);
}

/**
 * Quotes a trade with a trader (the query `trade-quote` and the price the trade commands and
 * jobs use): a sale to the trader earns its bid, a purchase costs what the trader asks (its
 * multiplier, agreement discount, scarcity premium and margin, rounded up to whole coins).
 *
 * @param engine - The engine.
 * @param trader - The trader entity.
 * @param direction - From the settlement's side.
 * @param materialId - The material.
 * @param quantity - Units.
 * @returns The quote.
 */
export function quoteTrade(
  engine: GameEngine,
  trader: Entity,
  direction: OrderDirection,
  materialId: string,
  quantity: number,
): TradeQuote {
  const data = getComponent(trader, traderComponent);
  const item = { materialId, quantity };
  const value = valueOfItemsMilli(engine.materials, [item]);
  if (data === undefined) {
    return {
      direction,
      materialId,
      quantity,
      coins: null,
      ceilingCoins: null,
      available: 0,
      reason: notSoldQuoteReason,
    };
  }
  if (direction === OrderDirection.Sell) {
    const wanted = data.buys.includes(materialId);
    return {
      direction,
      materialId,
      quantity,
      coins: value === null ? null : traderBidCoins(value, data.buyOfferPermille),
      ceilingCoins: value === null ? null : traderCeilingCoins(value, data.buyCeilingPermille),
      available: wanted ? getTotal(trader, engine.materials.currencyId) : 0,
      reason: wanted ? null : notWantedQuoteReason,
    };
  }
  const available = sellableQuantity(engine, trader, materialId);
  const asked = askedMilli(engine, trader, [item]);
  const refined = refinedAllowance(engine, trader, materialId);
  let reason: string | null = null;
  if (available < 1) {
    reason = refined === null ? notSoldQuoteReason : creditExhaustedQuoteReason;
  }
  return {
    direction,
    materialId,
    quantity,
    coins: asked === null ? null : wholeCoins(asked),
    ceilingCoins: asked === null ? null : wholeCoins(asked),
    available,
    reason,
  };
}
