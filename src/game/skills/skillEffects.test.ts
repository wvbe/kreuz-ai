import { describe, expect, it } from "vitest";
import { ContentTable } from "../content/ContentTable";
import { SkillEffectKind } from "../content/contentTypes";
import { faithBonusMilli, skillEffectMilli } from "./skillEffects";
import { marginAddPermille } from "./traitModifiers";
import { createTestCharacter, createTestSkillContent, testSkills } from "./testSkillContent";

const base = createTestSkillContent();
const template = testSkills[0]!;
const content = {
  ...base,
  skills: new ContentTable(
    "skills",
    [
      ...testSkills.filter((entry) => entry.id !== "trading"),
      {
        ...template,
        id: "trading",
        outcomeEffects: [{ kind: SkillEffectKind.TradeMargin, value: 50 }],
      },
      {
        ...template,
        id: "preaching",
        outcomeEffects: [{ kind: SkillEffectKind.FaithBonus, value: 5000 }],
      },
    ],
    (record) => record.id,
  ),
};

describe("skillEffectMilli", () => {
  it("scales the effect linearly with the level and floors", () => {
    const at = (level: number) =>
      skillEffectMilli(
        content,
        createTestCharacter({ preaching: level }),
        "preaching",
        SkillEffectKind.FaithBonus,
      );
    expect([0, 1, 50, 100].map(at)).toEqual([0, 50, 2500, 5000]);
  });

  it("is 0 for another effect kind and for a skill the pack lacks", () => {
    const entity = createTestCharacter({ preaching: 100 });
    expect(skillEffectMilli(content, entity, "preaching", SkillEffectKind.TradeMargin)).toBe(0);
    expect(skillEffectMilli(content, entity, "alchemy", SkillEffectKind.FaithBonus)).toBe(0);
  });
});

describe("faithBonusMilli", () => {
  it("is +5 percent points at preaching 100", () => {
    expect(faithBonusMilli(content, createTestCharacter({ preaching: 100 }))).toBe(5000);
    expect(faithBonusMilli(content, createTestCharacter({}))).toBe(0);
  });
});

describe("marginAddPermille with the trade_margin effect", () => {
  it("adds the scaled skill effect to the trait margin", () => {
    expect(marginAddPermille(content, createTestCharacter({ trading: 100 }))).toBe(50);
    expect(marginAddPermille(content, createTestCharacter({ trading: 40 }, ["greedy"]))).toBe(70);
    expect(marginAddPermille(content, createTestCharacter({}))).toBe(0);
  });
});
