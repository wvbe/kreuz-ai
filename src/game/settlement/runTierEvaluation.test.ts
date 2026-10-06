import { describe, expect, it } from "vitest";
import { SettlementTier } from "../content/contentTypes";
import type { JsonValue } from "../engine/EventBus";
import { settlementProgressOf } from "./settlementProgressOf";
import { runTierEvaluation } from "./runTierEvaluation";
import { getSettlementService } from "./settlementServiceRegistry";
import { contentWithTiers, createSettlementWorld } from "./testSettlementWorld";

const easyTiers: JsonValue[] = [
  { tier: "hamlet", settlementNoun: "hamlet", requirements: [] },
  {
    tier: "village",
    settlementNoun: "village",
    requirements: [{ kind: "population", min: 3 }],
  },
  {
    tier: "market_town",
    settlementNoun: "market town",
    requirements: [{ kind: "population", min: 3 }],
  },
  {
    tier: "chartered_town",
    settlementNoun: "town",
    requirements: [{ kind: "population", min: 50 }],
  },
];

describe("runTierEvaluation", () => {
  it("promotes at the day boundary, stores the reach tick and queues the event", () => {
    const world = createSettlementWorld({ content: contentWithTiers(easyTiers) });
    world.addSettlers(3);
    world.runToDay(1);
    expect(world.progress().tier).toBe(SettlementTier.Village);
    expect(world.progress().tierReachedAtTick).toEqual({ hamlet: 0, village: 288 });
    expect(world.tierEvents).toEqual([{ tier: "village", previousTier: "hamlet", tick: 288 }]);
    expect(getSettlementService(world.engine).tier()).toBe(SettlementTier.Village);
  });

  it("advances at most one tier per evaluation even when two tiers' requirements hold", () => {
    const world = createSettlementWorld({ content: contentWithTiers(easyTiers) });
    world.addSettlers(3);
    world.runToDay(1);
    expect(world.progress().tier).toBe(SettlementTier.Village);
    world.runToDay(2);
    expect(world.progress().tier).toBe(SettlementTier.MarketTown);
    expect(world.tierEvents).toHaveLength(2);
    world.runToDay(3);
    expect(world.progress().tier).toBe(SettlementTier.MarketTown);
  });

  it("does not run in the middle of a day and never at tick 0", () => {
    const world = createSettlementWorld({ content: contentWithTiers(easyTiers) });
    world.addSettlers(3);
    world.engine.runTicks(287);
    expect(world.progress().evaluations).toBe(0);
    expect(world.tierEvents).toEqual([]);
  });

  it("never loses a tier when the population shrinks (FR-005)", () => {
    const world = createSettlementWorld({ content: contentWithTiers(easyTiers) });
    const ids = world.addSettlers(3);
    world.runToDay(1);
    for (const id of ids) {
      world.engine.store.requestDelete(id);
    }
    world.runToDay(3);
    expect(world.progress().tier).toBe(SettlementTier.Village);
    expect(world.progress().tierReachedAtTick["village"]).toBe(288);
  });

  it("counts the evaluation and reports whether it promoted", () => {
    const world = createSettlementWorld();
    const promoted = runTierEvaluation(world.engine, 288);
    expect(promoted).toBe(false);
    expect(settlementProgressOf(world.engine)).toMatchObject({
      evaluations: 1,
      lastEvaluationTick: 288,
    });
  });
});
