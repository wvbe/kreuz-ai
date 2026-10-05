import { describe, expect, it } from "vitest";
import { PerformanceStat } from "../content/contentTypes";
import { UnknownContentError } from "../content/ContentTable";
import {
  aptitudeMultiplierPermille,
  marginAddPermille,
  modifierCoversSkill,
  needModifiers,
  traitPerformance,
  traitsOf,
} from "./traitModifiers";
import { createTestCharacter, createTestSkillContent } from "./testSkillContent";

const content = createTestSkillContent();

describe("traitsOf", () => {
  it("returns the records in stored order and nothing without a component", () => {
    const entity = createTestCharacter({}, ["strong", "greedy"]);
    expect(traitsOf(content, entity).map((trait) => trait.id)).toEqual(["strong", "greedy"]);
    expect(traitsOf(content, { id: 2, prototype: "wall", components: {} })).toEqual([]);
  });

  it("throws for an unknown trait id", () => {
    expect(() => traitsOf(content, createTestCharacter({}, ["ghost"]))).toThrow(
      UnknownContentError,
    );
  });
});

describe("modifierCoversSkill", () => {
  it("matches ids, ALL, ALL_WORK and ALL_CRAFTING", () => {
    expect(modifierCoversSkill(content, "baking", "baking")).toBe(true);
    expect(modifierCoversSkill(content, "baking", "hauling")).toBe(false);
    expect(modifierCoversSkill(content, "ALL", "hauling")).toBe(true);
    expect(modifierCoversSkill(content, "ALL_WORK", "hauling")).toBe(true);
    expect(modifierCoversSkill(content, "ALL_CRAFTING", "baking")).toBe(true);
    expect(modifierCoversSkill(content, "ALL_CRAFTING", "hauling")).toBe(false);
  });

  it("covers unskilled work only through ALL_WORK", () => {
    expect(modifierCoversSkill(content, "ALL_WORK", null)).toBe(true);
    expect(modifierCoversSkill(content, "ALL", null)).toBe(false);
    expect(modifierCoversSkill(content, "baking", null)).toBe(false);
  });
});

describe("aptitudeMultiplierPermille", () => {
  it("is 1000 without traits", () => {
    expect(aptitudeMultiplierPermille(content, createTestCharacter({}), "baking")).toBe(1000);
  });

  it("applies a skill-specific aptitude only to that skill", () => {
    const entity = createTestCharacter({}, ["gifted_baker"]);
    expect(aptitudeMultiplierPermille(content, entity, "baking")).toBe(1500);
    expect(aptitudeMultiplierPermille(content, entity, "hauling")).toBe(1000);
  });

  it("stacks aptitudes multiplicatively, conflicting traits included", () => {
    const entity = createTestCharacter({}, ["gifted_baker", "quick_learner", "slow_learner"]);
    // 1000 * 1.5 = 1500, * 1.2 = 1800, * 0.8 = 1440
    expect(aptitudeMultiplierPermille(content, entity, "baking")).toBe(1440);
  });
});

describe("traitPerformance", () => {
  it("combines speed multipliers multiplicatively", () => {
    const entity = createTestCharacter({}, ["heavy_handed", "fast_hands"]);
    expect(traitPerformance(content, entity, "construction", PerformanceStat.SpeedMultiplier)).toBe(
      880,
    );
    expect(traitPerformance(content, entity, "hauling", PerformanceStat.SpeedMultiplier)).toBe(
      1100,
    );
    expect(traitPerformance(content, entity, null, PerformanceStat.SpeedMultiplier)).toBe(1100);
  });

  it("keeps multiplier and speed_multiplier apart", () => {
    const entity = createTestCharacter({}, ["strong"]);
    expect(traitPerformance(content, entity, "hauling", PerformanceStat.Multiplier)).toBe(1300);
    expect(traitPerformance(content, entity, "hauling", PerformanceStat.SpeedMultiplier)).toBe(
      1000,
    );
  });

  it("adds output bonus and margin amounts", () => {
    const entity = createTestCharacter({}, ["crafty", "greedy"]);
    expect(traitPerformance(content, entity, "baking", PerformanceStat.OutputBonus)).toBe(500);
    expect(traitPerformance(content, entity, "hauling", PerformanceStat.OutputBonus)).toBe(0);
    expect(traitPerformance(content, entity, "trading", PerformanceStat.MarginAdd)).toBe(50);
  });
});

describe("marginAddPermille", () => {
  it("is +50 for Greedy (US3 AC3) and 0 otherwise", () => {
    expect(marginAddPermille(content, createTestCharacter({}, ["greedy"]))).toBe(50);
    expect(marginAddPermille(content, createTestCharacter({}, ["strong"]))).toBe(0);
  });
});

describe("needModifiers", () => {
  it("returns identity for untouched needs", () => {
    expect(needModifiers(content, createTestCharacter({}, ["hearty"]), "rest")).toEqual({
      decayRateMultiplierPermille: 1000,
      satisfactionBonusMultiplierPermille: 1000,
      moodBonusMilli: 0,
    });
  });

  it("reports decay, satisfaction and mood of a matching trait", () => {
    expect(needModifiers(content, createTestCharacter({}, ["hearty"]), "hunger")).toEqual({
      decayRateMultiplierPermille: 800,
      satisfactionBonusMultiplierPermille: 1200,
      moodBonusMilli: 5000,
    });
  });
});
