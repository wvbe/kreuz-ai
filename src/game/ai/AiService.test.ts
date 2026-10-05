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
    expect(service.needSources()).toEqual([first, second]);
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
});
