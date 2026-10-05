import { describe, expect, it } from "vitest";
import {
  createTestCharacter,
  createTestSkillContent,
  testSkills,
  testTraits,
} from "./testSkillContent";

describe("createTestSkillContent", () => {
  it("builds independent tables with the bundled recipes", () => {
    const first = createTestSkillContent();
    const second = createTestSkillContent();
    expect(first.skills.ids()).toEqual(testSkills.map((skill) => skill.id).sort());
    expect(first.traits.size).toBe(testTraits.length);
    expect(first.recipes.has("bake_bread")).toBe(true);
    expect(first.skills).not.toBe(second.skills);
  });
});

describe("createTestCharacter", () => {
  it("stores levels as milli-percent and copies the trait ids", () => {
    const traits = ["greedy"];
    const entity = createTestCharacter({ baking: 35 }, traits, 7);
    traits.push("strong");
    expect(entity.id).toBe(7);
    expect(entity.components["Skills"]).toEqual({ values: { baking: 35000 } });
    expect(entity.components["Traits"]).toEqual({ ids: ["greedy"] });
  });
});
