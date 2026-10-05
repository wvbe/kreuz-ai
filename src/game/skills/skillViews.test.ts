import { describe, expect, it } from "vitest";
import { buildSkillsView, buildTraitsView, describeTrait, formatPermille } from "./skillViews";
import { createTestCharacter, createTestSkillContent, testTraits } from "./testSkillContent";

const content = createTestSkillContent();

function trait(id: string) {
  const found = testTraits.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no test trait ${id}`);
  }
  return found;
}

describe("formatPermille", () => {
  it("prints integers without floats", () => {
    expect([1500, 800, 1000, 50, 0, -250, 10_000, 1234].map(formatPermille)).toEqual([
      "1.5",
      "0.8",
      "1",
      "0.05",
      "0",
      "-0.25",
      "10",
      "1.234",
    ]);
  });
});

describe("describeTrait", () => {
  it("describes aptitude with its starting bonus", () => {
    expect(describeTrait(trait("gifted_baker"))).toEqual(["learns baking x1.5, starts at +10"]);
    expect(describeTrait(trait("quick_learner"))).toEqual(["learns ALL x1.2"]);
  });

  it("describes performance modifiers with factor or amount", () => {
    expect(describeTrait(trait("heavy_handed"))).toEqual(["construction speed x0.8"]);
    expect(describeTrait(trait("strong"))).toEqual(["hauling performance x1.3"]);
    expect(describeTrait(trait("greedy"))).toEqual(["trading trade margin +0.05"]);
    expect(describeTrait(trait("crafty"))).toEqual(["ALL_CRAFTING extra output +0.5"]);
  });

  it("describes need modifiers", () => {
    expect(describeTrait(trait("hearty"))).toEqual(["hunger decay x0.8 satisfaction x1.2 mood +5"]);
  });
});

describe("buildSkillsView", () => {
  it("lists every registered skill and the dominant one (US6 AC1)", () => {
    const view = buildSkillsView(
      content,
      createTestCharacter({ baking: 60, construction: 20 }, [], 4),
    );
    expect(view?.entityId).toBe(4);
    expect(view?.dominantSkill).toBe("baking");
    expect(view?.skills.map((row) => [row.skillId, row.level])).toEqual([
      ["baking", 60],
      ["construction", 20],
      ["glassblowing", 0],
      ["hauling", 0],
      ["trading", 0],
    ]);
    expect(view?.skills[0]).toEqual({
      skillId: "baking",
      name: "baking",
      level: 60,
      valueMilli: 60_000,
    });
  });

  it("has no dominant skill when all are 0 and reads live data", () => {
    const entity = createTestCharacter({});
    expect(buildSkillsView(content, entity)?.dominantSkill).toBeNull();
    entity.components["Skills"] = { values: { baking: 41_000 } };
    expect(buildSkillsView(content, entity)?.skills[0]?.level).toBe(41);
  });

  it("is null without a Skills component", () => {
    expect(buildSkillsView(content, { id: 2, prototype: "wall", components: {} })).toBeNull();
  });
});

describe("buildTraitsView", () => {
  it("lists names and effects (US6 AC2)", () => {
    const view = buildTraitsView(
      content,
      createTestCharacter({}, ["gifted_baker", "heavy_handed"]),
    );
    expect(view?.traits).toEqual([
      {
        traitId: "gifted_baker",
        name: "Gifted baker",
        effects: ["learns baking x1.5, starts at +10"],
      },
      { traitId: "heavy_handed", name: "Heavy handed", effects: ["construction speed x0.8"] },
    ]);
  });

  it("is null without a Traits component", () => {
    expect(buildTraitsView(content, { id: 2, prototype: "wall", components: {} })).toBeNull();
  });
});
