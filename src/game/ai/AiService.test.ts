import { describe, expect, it } from "vitest";
import { Difficulty } from "../save/initOptions";
import { getAiService } from "./aiServiceRegistry";
import { createAiWorld } from "./testAiWorld";
import type { DecisionFactor } from "./decision/chooseAction";
import type { NeedSourceFinder } from "./decision/needPlanTypes";

describe("AiService", () => {
  it("takes the need decay multiplier from the difficulty of the game", () => {
    expect(getAiService(createAiWorld().engine).needDecayMultiplierPermille()).toBe(1000);
    expect(
      getAiService(
        createAiWorld({ difficulty: Difficulty.Harsh }).engine,
      ).needDecayMultiplierPermille(),
    ).toBe(1300);
    expect(
      getAiService(
        createAiWorld({ difficulty: Difficulty.Peaceful }).engine,
      ).needDecayMultiplierPermille(),
    ).toBe(700);
  });

  it("is 1000 before a difficulty is known and follows setDifficulty", () => {
    const world = createAiWorld();
    const service = getAiService(world.engine);
    service.setDifficulty(Difficulty.Harsh);
    expect(service.needDecayMultiplierPermille()).toBe(1300);
  });

  it("lets the multiplier hook override the difficulty and restores it with null", () => {
    const service = getAiService(createAiWorld().engine);
    service.setNeedDecayMultiplier(() => 1750);
    expect(service.needDecayMultiplierPermille()).toBe(1750);
    service.setNeedDecayMultiplier(null);
    expect(service.needDecayMultiplierPermille()).toBe(1000);
  });

  it("keeps need source finders in registration order", () => {
    const service = getAiService(createAiWorld().engine);
    const first: NeedSourceFinder = () => null;
    const second: NeedSourceFinder = () => null;
    service.registerNeedSource(first);
    service.registerNeedSource(second);
    expect(service.needSources().slice(-2)).toEqual([first, second]);
  });

  it("starts with the default factors, adds registered ones and rejects duplicates", () => {
    const service = getAiService(createAiWorld().engine);
    expect(service.decisionFactors().map((factor) => factor.id)).toEqual([
      "urgency",
      "emergency",
      "wealth_luxury",
    ]);
    const extra: DecisionFactor = { id: "extra", score: () => 1 };
    service.registerDecisionFactor(extra);
    expect(service.decisionFactors().at(-1)).toBe(extra);
    expect(() => service.registerDecisionFactor(extra)).toThrow(/already registered/);
  });

  it("exposes the pathfinding service of the engine", () => {
    const service = getAiService(createAiWorld().engine);
    expect(typeof service.pathfinding.findPath).toBe("function");
  });

  it("limits what a consumer may take from another entity with the availability hook", () => {
    const world = createAiWorld();
    const service = getAiService(world.engine);
    const holder = world.spawn("peasant", 1);
    const consumer = world.spawn("peasant", 2);
    expect(service.itemsAvailable(world.engine, holder, consumer, "bread", 2)).toBe(2);
    service.setItemAvailability(() => 1);
    expect(service.itemsAvailable(world.engine, holder, consumer, "bread", 2)).toBe(1);
    expect(service.itemsAvailable(world.engine, consumer, consumer, "bread", 2)).toBe(2);
    service.setItemAvailability(null);
    expect(service.itemsAvailable(world.engine, holder, consumer, "bread", 2)).toBe(2);
  });

  it("ranks every bed 0 until a bed policy says otherwise (setBedPolicy, bedRank)", () => {
    const world = createAiWorld();
    const service = getAiService(world.engine);
    // The engine's housing system installs its household bed policy; start from the default.
    service.setBedPolicy(null);
    const farmer = world.spawn("farmer", 0);
    const bed = world.spawn("farmer", 5);
    expect(service.bedRank(world.engine, farmer, bed)).toBe(0);
    service.setBedPolicy((_engine, sleeper, candidate) => (sleeper.id === candidate.id ? 0 : null));
    expect(service.bedRank(world.engine, farmer, bed)).toBeNull();
    expect(service.bedRank(world.engine, bed, bed)).toBe(0);
    service.setBedPolicy(null);
    expect(service.bedRank(world.engine, farmer, bed)).toBe(0);
  });

  it("asks the registered wake checks whether a busy entity should decide (registerWakeCheck, shouldWake)", () => {
    const world = createAiWorld();
    const service = getAiService(world.engine);
    const farmer = world.spawn("farmer", 0);
    expect(service.shouldWake(world.engine, farmer)).toBe(false);
    service.registerWakeCheck((_engine, entity) => entity.id === farmer.id);
    expect(service.shouldWake(world.engine, farmer)).toBe(true);
    expect(service.shouldWake(world.engine, world.spawn("farmer", 1))).toBe(false);
  });
});
