import { describe, expect, it } from "vitest";
import { ContentTable } from "../content/ContentTable";
import { PerformanceStat, TraitModifierKind } from "../content/contentTypes";
import { Prng } from "../engine/Prng";
import { expectedOutputBonusMilli, rollOutputBonus } from "./outputBonus";
import { skillOutputStreamName } from "./skillTypes";
import { createTestCharacter, createTestSkillContent } from "./testSkillContent";

const content = createTestSkillContent();
const baking = { skillId: "baking" };

describe("expectedOutputBonusMilli", () => {
  it("scales the skill's maxExtra with the level", () => {
    const atLevel = (level: number) =>
      expectedOutputBonusMilli(content, createTestCharacter({ baking: level }), baking);
    expect([0, 1, 50, 100].map(atLevel)).toEqual([0, 10, 500, 1000]);
  });

  it("adds output bonus traits, also to unskilled-bonus work", () => {
    const entity = createTestCharacter({ baking: 100 }, ["crafty"]);
    expect(expectedOutputBonusMilli(content, entity, baking)).toBe(1500);
    expect(expectedOutputBonusMilli(content, entity, { skillId: "hauling" })).toBe(0);
    expect(expectedOutputBonusMilli(content, entity, { skillId: null })).toBe(0);
  });

  it("never goes below 0 when a negative trait total cancels the skill bonus (D-92)", () => {
    const clumsy = {
      ...content,
      traits: new ContentTable(
        "traits",
        [
          {
            id: "clumsy",
            name: "Clumsy",
            modifiers: [
              {
                kind: TraitModifierKind.Performance as const,
                skill: "ALL_CRAFTING",
                stat: PerformanceStat.OutputBonus,
                value: -300,
              },
            ],
            conflictsWith: [],
            extended: true,
          },
        ],
        (record) => record.id,
      ),
    };
    const entity = (level: number) => createTestCharacter({ baking: level }, ["clumsy"]);
    expect(expectedOutputBonusMilli(clumsy, entity(100), baking)).toBe(700);
    expect(expectedOutputBonusMilli(clumsy, entity(10), baking)).toBe(0);
    expect(expectedOutputBonusMilli(clumsy, entity(0), baking)).toBe(0);
  });

  it("is 0 for skills without an output effect", () => {
    expect(
      expectedOutputBonusMilli(content, createTestCharacter({ hauling: 100 }), {
        skillId: "hauling",
      }),
    ).toBe(0);
  });
});

describe("rollOutputBonus", () => {
  function stream(seed: number) {
    return Prng.create({ seed }).stream(skillOutputStreamName);
  }

  it("always gives the whole units without drawing (maxExtra 1 at level 100)", () => {
    const rolls = stream(1);
    const entity = createTestCharacter({ baking: 100 });
    expect(rollOutputBonus(content, entity, baking, rolls)).toBe(1);
    expect(rollOutputBonus(content, entity, baking, rolls)).toBe(1);
    expect(rollOutputBonus(content, createTestCharacter({}), baking, rolls)).toBe(0);
  });

  it("gives 1 or 2 extra units with a crafty level 100 baker (up to 5 Bread from 4)", () => {
    const rolls = stream(2);
    const entity = createTestCharacter({ baking: 100 }, ["crafty"]);
    const results = Array.from({ length: 200 }, () =>
      rollOutputBonus(content, entity, baking, rolls),
    );
    expect(new Set(results)).toEqual(new Set([1, 2]));
  });

  it("hits the expected rate over a fixed seed (level 50: 500 permille)", () => {
    const rolls = stream(3);
    const entity = createTestCharacter({ baking: 50 });
    let extra = 0;
    for (let index = 0; index < 4000; index += 1) {
      extra += rollOutputBonus(content, entity, baking, rolls);
    }
    expect(extra).toBeGreaterThan(1800);
    expect(extra).toBeLessThan(2200);
  });

  it("is deterministic for a seed and differs between seeds", () => {
    const run = (seed: number) => {
      const rolls = stream(seed);
      const entity = createTestCharacter({ baking: 37 });
      return Array.from({ length: 64 }, () => rollOutputBonus(content, entity, baking, rolls));
    };
    expect(run(9)).toEqual(run(9));
    expect(run(9)).not.toEqual(run(10));
  });
});
