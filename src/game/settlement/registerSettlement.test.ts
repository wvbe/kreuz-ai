import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { SettlementTier } from "../content/contentTypes";
import { GameEngine } from "../engine/GameEngine";
import { governmentFactionId } from "../factions/factionRegistry";
import { getJobService } from "../jobs/jobServiceRegistry";
import { registerSettlement } from "./registerSettlement";
import { settlementProgressOf } from "./settlementProgressOf";
import { getSettlementService } from "./settlementServiceRegistry";
import { createSettlementWorld } from "./testSettlementWorld";

function newEngine(): GameEngine {
  return new GameEngine(loadContent(), { entropy: () => 1 });
}

describe("registerSettlement", () => {
  it("is done by the engine itself and a second call returns the same service", () => {
    const engine = newEngine();
    expect(registerSettlement(engine)).toBe(getSettlementService(engine));
  });

  it("gives the government both components and feeds the job service's tier source", () => {
    const engine = newEngine();
    engine.newGame({ seed: 1 });
    const government = engine.store.require(governmentFactionId(engine) ?? 0);
    expect(Object.keys(government.components)).toEqual(
      expect.arrayContaining(["SettlementProgress", "SettlementChronicle"]),
    );
    expect(getJobService(engine).currentTier()).toBe("hamlet");
    getSettlementService(engine).setTier(SettlementTier.Village);
    expect(getJobService(engine).currentTier()).toBe("village");
  });

  it("starts at the startingTier with every lower tier reached at tick 0 and no milestone", () => {
    const engine = newEngine();
    engine.newGame({ seed: 1, startingTier: SettlementTier.MarketTown });
    expect(settlementProgressOf(engine)).toEqual({
      tier: "market_town",
      tierReachedAtTick: {
        [SettlementTier.Hamlet]: 0,
        [SettlementTier.Village]: 0,
        [SettlementTier.MarketTown]: 0,
      },
      milestones: [],
      evaluations: 0,
      lastEvaluationTick: null,
    });
    expect(getJobService(engine).currentTier()).toBe("market_town");
    const events: string[] = [];
    engine.bus.subscribe("settlement.**", (_payload, event) => {
      events.push(event.name);
    });
    engine.runTicks(1);
    expect(events).toEqual([]);
  });

  it("a new game after a promoted one starts over", () => {
    const engine = newEngine();
    engine.newGame({ seed: 1, startingTier: SettlementTier.CharteredTown });
    engine.newGame({ seed: 1 });
    expect(getSettlementService(engine).tier()).toBe(SettlementTier.Hamlet);
  });

  it("restores the tier of a saved game when it loads", () => {
    const first = newEngine();
    first.newGame({ seed: 5, startingTier: SettlementTier.Village });
    first.runTicks(3);
    const save = first.saveGame();
    const second = newEngine();
    second.newGame({ seed: 9 });
    second.loadGame(save);
    expect(getSettlementService(second).tier()).toBe(SettlementTier.Village);
    expect(second.getStateHash()).toBe(first.getStateHash());
  });

  it("adds the components to a government that lacks them (a save from before 4.4)", () => {
    const engine = newEngine();
    engine.newGame({ seed: 5 });
    const government = governmentFactionId(engine) ?? 0;
    engine.store.removeComponent(government, { name: "SettlementProgress" });
    engine.store.removeComponent(government, { name: "SettlementChronicle" });
    engine.loadGame(engine.saveGame());
    expect(settlementProgressOf(engine)?.tier).toBe("hamlet");
  });

  it("runs the tier check only on the first tick of a day", () => {
    const world = createSettlementWorld();
    world.engine.runTicks(300);
    expect(world.progress().evaluations).toBe(1);
    expect(world.progress().lastEvaluationTick).toBe(288);
  });

  it("registers the three queries and no command", () => {
    const world = createSettlementWorld();
    expect(world.engine.queryNames()).toEqual(
      expect.arrayContaining(["settlement-progress", "unlocks", "milestones"]),
    );
    expect(
      world.query("unlocks", { contentKind: "dwelling_level", lockedOnly: true }),
    ).toHaveLength(3);
    expect(world.query("unlocks", { tier: "village" })).toEqual([
      expect.objectContaining({ contentId: "cottage", lockText: "Unlocks at Village" }),
    ]);
    expect(world.query("milestones")).toHaveLength(7);
    expect(world.query("settlement-progress")).toMatchObject({
      tier: "hamlet",
      nextTier: "village",
    });
  });
});
