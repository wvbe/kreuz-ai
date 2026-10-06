import { describe, expect, it } from "vitest";
import { dominantSkill, levelOfMilli, skillLevel, skillValueMilli } from "./skillLevels";
import { createTestCharacter } from "./testSkillContent";

// @covers 020:FR-002 020:FR-012
describe("levelOfMilli", () => {
  it("floors milli-percent to whole levels", () => {
    expect([0, 999, 1000, 35_999, 100_000].map(levelOfMilli)).toEqual([0, 0, 1, 35, 100]);
  });
});

describe("skillValueMilli", () => {
  it("is 0 for missing skills and entities without a Skills component", () => {
    const entity = createTestCharacter({ baking: 35 });
    expect(skillValueMilli(entity, "baking")).toBe(35_000);
    expect(skillValueMilli(entity, "glassblowing")).toBe(0);
    expect(skillValueMilli({ id: 2, prototype: "wall", components: {} }, "baking")).toBe(0);
  });
});

describe("skillLevel", () => {
  it("returns the integer level", () => {
    const entity = createTestCharacter({ baking: 35 });
    entity.components["Skills"] = { values: { baking: 35_999 } };
    expect(skillLevel(entity, "baking")).toBe(35);
  });
});

describe("dominantSkill", () => {
  it("returns the highest skill", () => {
    expect(dominantSkill(createTestCharacter({ baking: 60, construction: 20, hauling: 5 }))).toBe(
      "baking",
    );
  });

  it("is null when every skill is 0 or the entity has none", () => {
    expect(dominantSkill(createTestCharacter({}))).toBeNull();
    expect(dominantSkill(createTestCharacter({ baking: 0 }))).toBeNull();
    expect(dominantSkill({ id: 2, prototype: "wall", components: {} })).toBeNull();
  });

  it("breaks ties with the lexicographically smallest id", () => {
    expect(dominantSkill(createTestCharacter({ hauling: 50, baking: 50, construction: 50 }))).toBe(
      "baking",
    );
  });
});
