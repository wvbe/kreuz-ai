import { describe, expect, it } from "vitest";
import { SettlementTier } from "../content/contentTypes";
import { hasReachedTier, nextTierOf, orderedTiers, tierRank } from "./tierOrder";

describe("tier order", () => {
  // @covers 027:FR-001
  it("lists the four tiers in ascending order", () => {
    expect(orderedTiers).toEqual([
      SettlementTier.Hamlet,
      SettlementTier.Village,
      SettlementTier.MarketTown,
      SettlementTier.CharteredTown,
    ]);
  });

  it("ranks tiers and gives -1 for an unknown one", () => {
    expect(tierRank("hamlet")).toBe(0);
    expect(tierRank("chartered_town")).toBe(3);
    expect(tierRank("city")).toBe(-1);
  });

  it("finds the next tier and stops at the highest", () => {
    expect(nextTierOf(SettlementTier.Hamlet)).toBe(SettlementTier.Village);
    expect(nextTierOf(SettlementTier.MarketTown)).toBe(SettlementTier.CharteredTown);
    expect(nextTierOf(SettlementTier.CharteredTown)).toBeNull();
  });

  it("compares by rank and treats an absent requirement as Hamlet", () => {
    expect(hasReachedTier("village", "village")).toBe(true);
    expect(hasReachedTier("hamlet", "village")).toBe(false);
    expect(hasReachedTier("market_town", "village")).toBe(true);
    expect(hasReachedTier("hamlet", undefined)).toBe(true);
  });
});
