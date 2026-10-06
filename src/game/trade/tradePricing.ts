import { ceilDiv, floorDiv } from "../engine/fixedPoint";
import type { MaterialRegistry } from "../inventory/MaterialRegistry";
import type { Item } from "./tradeTypes";

/**
 * Permille that means 1.0.
 */
export const permilleOne = 1000;

/**
 * Trade value of items in milli-coins at the plain material value (DECISIONS D-04, D-12: the base
 * of every price and the value of received barter goods).
 *
 * @param materials - The material registry.
 * @param items - The items.
 * @returns The sum of `valueMilli * quantity`, or null when an item has no value (the offer is
 * then refused with `unknown-item-value`).
 */
export function valueOfItemsMilli(
  materials: MaterialRegistry,
  items: readonly Item[],
): number | null {
  let total = 0;
  for (const item of items) {
    const value = materials.require(item.materialId).valueMilli;
    if (value === undefined) {
      return null;
    }
    total += value * item.quantity;
  }
  return total;
}

/**
 * The scarcity modifier of a trader's price (D-55): a trader that has sold down its stock below
 * the level it restocks to asks up to `maxPremiumPermille` more, in proportion to what is
 * missing. Goods without a restock level (the refined goods of the ledger) never carry a premium.
 *
 * @param held - Units the trader holds now.
 * @param target - Units it restocks to; 0 for goods without a level.
 * @param maxPremiumPermille - The premium when the stock is gone (`scarcityMaxPremium`).
 * @returns A permille multiplier of at least 1000.
 */
export function scarcityPermille(held: number, target: number, maxPremiumPermille: number): number {
  if (target < 1 || held >= target) {
    return permilleOne;
  }
  return permilleOne + floorDiv(maxPremiumPermille * (target - Math.max(0, held)), target);
}

/**
 * The price multiplier of a seller in force (D-12): its own multiplier, the trade agreement
 * discount (the faction standing hook) and the scarcity modifier, each in permille, combined with
 * truncation.
 *
 * @param basePermille - The seller's `priceMultiplier` (1000 = 1.0).
 * @param agreementPermille - The agreement discount (`agreementDiscount`, 900) when a trade
 * agreement stands, otherwise 1000.
 * @param scarcity - {@link scarcityPermille}.
 * @returns The multiplier in permille.
 */
export function effectiveMultiplierPermille(
  basePermille: number,
  agreementPermille: number,
  scarcity: number,
): number {
  return floorDiv(floorDiv(basePermille * agreementPermille, permilleOne) * scarcity, permilleOne);
}

/**
 * The least a seller accepts, in milli-coins (D-12 step 2):
 * `ceilDiv(valueMilli * multiplier * (1000 + margin), 1_000_000)`. Worked example of spec 019:
 * base 5, multiplier 1.0, margin 0.1, two units: 11 coins.
 *
 * @param valueMilli - Plain value of the goods in milli-coins.
 * @param multiplierPermille - {@link effectiveMultiplierPermille}.
 * @param marginPermille - `minimumMarginRate` plus the trait margin (Greedy +50).
 * @returns Milli-coins, rounded up.
 */
export function minAcceptableMilli(
  valueMilli: number,
  multiplierPermille: number,
  marginPermille: number,
): number {
  return ceilDiv(
    valueMilli * multiplierPermille * (permilleOne + marginPermille),
    permilleOne * permilleOne,
  );
}

/**
 * Settles milli-coins to whole coins (D-04), rounding up so the seller never loses to rounding.
 *
 * @param milli - Milli-coins.
 * @returns Whole coins.
 */
export function wholeCoins(milli: number): number {
  return ceilDiv(milli, 1000);
}

/**
 * The coins a trader bids for goods it buys: a permille of the plain value, rounded down.
 *
 * @param valueMilli - Plain value in milli-coins.
 * @param bidPermille - `buyOfferPermille`, the opening bid.
 * @returns Whole coins.
 */
export function traderBidCoins(valueMilli: number, bidPermille: number): number {
  return floorDiv(floorDiv(valueMilli * bidPermille, permilleOne), 1000);
}

/**
 * The most coins a trader pays for goods it buys: a permille of the plain value, rounded up so
 * that a counter for a single cheap unit is not lost to rounding.
 *
 * @param valueMilli - Plain value in milli-coins.
 * @param ceilingPermille - `buyCeilingPermille`.
 * @returns Whole coins.
 */
export function traderCeilingCoins(valueMilli: number, ceilingPermille: number): number {
  return wholeCoins(floorDiv(valueMilli * ceilingPermille, permilleOne));
}
