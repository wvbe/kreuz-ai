import { describe, expect, it } from "vitest";
import { UnknownContentError } from "../content/ContentTable";
import { createTestCharacter, createTestSkillContent } from "./testSkillContent";
import { workDuration, workSpeed } from "./workSpeed";

const content = createTestSkillContent();
const baking = { skillId: "baking" };
const construction = { skillId: "construction" };

describe("workSpeed", () => {
  it("is the baseline at skill 0 without traits", () => {
    expect(workSpeed(content, createTestCharacter({}), baking)).toEqual({
      skillId: "baking",
      level: 0,
      speedBonusPermille: 0,
      traitMultiplierPermille: 1000,
      speedPermille: 1000,
    });
  });

  it("scales the skill's max speed bonus linearly with the level", () => {
    const atLevel = (level: number) =>
      workSpeed(content, createTestCharacter({ baking: level }), baking).speedBonusPermille;
    expect([0, 10, 50, 99, 100].map(atLevel)).toEqual([0, 50, 250, 495, 500]);
    expect(workSpeed(content, createTestCharacter({ baking: 100 }), baking).speedPermille).toBe(
      2000,
    );
  });

  it("combines skill and traits instead of overriding (US5 AC5)", () => {
    const entity = createTestCharacter({ construction: 100 }, ["heavy_handed", "fast_hands"]);
    const speed = workSpeed(content, entity, construction);
    expect(speed.speedBonusPermille).toBe(500);
    expect(speed.traitMultiplierPermille).toBe(880);
    expect(speed.speedPermille).toBe(1760);
  });

  it("applies the generic multiplier of Strong to hauling only", () => {
    const entity = createTestCharacter({}, ["strong"]);
    expect(workSpeed(content, entity, { skillId: "hauling" }).traitMultiplierPermille).toBe(1300);
    expect(workSpeed(content, entity, baking).traitMultiplierPermille).toBe(1000);
  });

  it("treats work without a skill as level 0 with only ALL_WORK traits", () => {
    const entity = createTestCharacter({ baking: 100 }, ["fast_hands", "strong"]);
    expect(workSpeed(content, entity, { skillId: null })).toEqual({
      skillId: null,
      level: 0,
      speedBonusPermille: 0,
      traitMultiplierPermille: 1100,
      speedPermille: 1100,
    });
  });

  it("gives no speed bonus for skills with other effects and rejects unknown skills", () => {
    const entity = createTestCharacter({ trading: 100 });
    expect(workSpeed(content, entity, { skillId: "trading" }).speedBonusPermille).toBe(0);
    expect(() => workSpeed(content, entity, { skillId: "ghost" })).toThrow(UnknownContentError);
  });

  it("accepts recipe and job records of the content pack", () => {
    const recipe = content.recipes.require("bake_bread");
    expect(
      workSpeed(content, createTestCharacter({ baking: 100 }), recipe).speedBonusPermille,
    ).toBe(500);
  });
});

describe("workDuration", () => {
  it("takes 24 ticks at skill 0 and 12 at skill 100 with max bonus 0.5 (US5 AC1/2)", () => {
    expect(workDuration(content, createTestCharacter({}), baking, 24)).toBe(24);
    expect(workDuration(content, createTestCharacter({ baking: 100 }), baking, 24)).toBe(12);
    expect(workDuration(content, createTestCharacter({ baking: 50 }), baking, 24)).toBe(18);
  });

  it("takes 25 percent longer for Heavy-Handed (US3 AC2)", () => {
    expect(workDuration(content, createTestCharacter({}, ["heavy_handed"]), construction, 24)).toBe(
      30,
    );
  });

  it("combines trait and skill and rounds up to whole ticks", () => {
    const entity = createTestCharacter({ construction: 100 }, ["heavy_handed"]);
    expect(workDuration(content, entity, construction, 24)).toBe(15);
    expect(workDuration(content, entity, construction, 25)).toBe(16);
  });

  it("is at least one tick", () => {
    expect(workDuration(content, createTestCharacter({ baking: 100 }), baking, 1)).toBe(1);
    expect(workDuration(content, createTestCharacter({ baking: 100 }), baking, 0)).toBe(1);
  });

  it("is independent of traits that do not cover the skill", () => {
    expect(workDuration(content, createTestCharacter({}, ["heavy_handed"]), baking, 24)).toBe(24);
  });
});
