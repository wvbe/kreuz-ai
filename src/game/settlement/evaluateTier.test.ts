import { describe, expect, it } from "vitest";
import { SettlementTier, TierRequirementKind } from "../content/contentTypes";
import { evaluateTier } from "./evaluateTier";
import { getSettlementService } from "./settlementServiceRegistry";
import { createSettlementWorld } from "./testSettlementWorld";

describe("evaluateTier", () => {
  // @covers 027:FR-006
  it("lists the next tier's requirements with their progress and changes nothing", () => {
    const world = createSettlementWorld();
    world.addSettlers(6);
    const before = JSON.stringify(world.progress());
    const evaluation = evaluateTier(world.engine);
    expect(evaluation.tier).toBe(SettlementTier.Hamlet);
    expect(evaluation.nextTier).toBe(SettlementTier.Village);
    expect(evaluation.requirements.map((entry) => entry.kind)).toEqual([
      TierRequirementKind.Population,
      TierRequirementKind.DwellingsAtLevel,
      TierRequirementKind.ActiveZone,
    ]);
    expect(evaluation.requirements.map((entry) => entry.met)).toEqual([false, false, false]);
    expect(evaluation.allMet).toBe(false);
    expect(JSON.stringify(world.progress())).toBe(before);
  });

  it("is deterministic: the same world gives the same answer", () => {
    const first = createSettlementWorld();
    const second = createSettlementWorld();
    first.addSettlers(4);
    second.addSettlers(4);
    expect(evaluateTier(first.engine)).toEqual(evaluateTier(second.engine));
  });

  it("has nothing to evaluate at the highest tier", () => {
    const world = createSettlementWorld();
    getSettlementService(world.engine).setTier(SettlementTier.CharteredTown);
    expect(evaluateTier(world.engine)).toEqual({
      tier: SettlementTier.CharteredTown,
      nextTier: null,
      requirements: [],
      allMet: false,
    });
  });

  it("shows which requirements of the next tier are still missing", () => {
    const world = createSettlementWorld();
    getSettlementService(world.engine).setTier(SettlementTier.Village);
    world.setDwellings(8);
    world.addSettlers(20);
    const evaluation = evaluateTier(world.engine);
    expect(evaluation.nextTier).toBe(SettlementTier.MarketTown);
    expect(
      evaluation.requirements.filter((entry) => !entry.met).map((entry) => entry.kind),
    ).toEqual([TierRequirementKind.FoundedGuilds]);
  });
});
