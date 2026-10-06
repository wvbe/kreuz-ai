import { SettlementTier } from "../content/contentTypes";

/**
 * The tiers in ascending order (spec 027 FR-001: the order is fixed in code).
 */
export const orderedTiers: readonly SettlementTier[] = [
  SettlementTier.Hamlet,
  SettlementTier.Village,
  SettlementTier.MarketTown,
  SettlementTier.CharteredTown,
];

/**
 * Position of a tier in the ladder (Hamlet 0 ... Chartered Town 3).
 *
 * @param tier - A tier; an unknown value gives -1.
 * @returns The rank.
 */
export function tierRank(tier: string): number {
  return orderedTiers.findIndex((candidate) => candidate === tier);
}

/**
 * The tier above one.
 *
 * @param tier - A tier.
 * @returns The next tier, null at the highest (or for an unknown value).
 */
export function nextTierOf(tier: SettlementTier): SettlementTier | null {
  return orderedTiers[tierRank(tier) + 1] ?? null;
}

/**
 * Whether the tier in force has reached a required tier (ordinal compare, FR-001).
 *
 * @param current - The tier in force.
 * @param required - The tier a piece of content needs (absent means Hamlet).
 * @returns True when `current` is at or above `required`.
 */
export function hasReachedTier(current: string, required: string | undefined): boolean {
  return tierRank(current) >= tierRank(required ?? SettlementTier.Hamlet);
}
