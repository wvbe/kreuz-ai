import { describe, expect, it } from "vitest";
import { affinityScore, familiarityBucket, familiarityBucketWidth } from "./affinityScore";
import { createTestCharacter } from "./testSkillContent";

describe("familiarityBucket", () => {
  it("is floor(level / 10)", () => {
    const entity = createTestCharacter({ baking: 80, construction: 9, hauling: 100 });
    expect(familiarityBucketWidth).toBe(10);
    expect(familiarityBucket(entity, "baking")).toBe(8);
    expect(familiarityBucket(entity, "construction")).toBe(0);
    expect(familiarityBucket(entity, "hauling")).toBe(10);
    expect(familiarityBucket(entity, "trading")).toBe(0);
  });
});

describe("affinityScore", () => {
  it("ranks the skilled job above the unskilled one (US4 AC1)", () => {
    const entity = createTestCharacter({ baking: 80, construction: 10 });
    expect(affinityScore(entity, ["baking"])).toBeGreaterThan(
      affinityScore(entity, ["construction"]),
    );
  });

  it("is nearly equal at baking 5 (US4 AC2)", () => {
    const entity = createTestCharacter({ baking: 5, construction: 10 });
    expect(affinityScore(entity, ["baking"])).toBe(0);
    expect(
      Math.abs(affinityScore(entity, ["baking"]) - affinityScore(entity, ["construction"])),
    ).toBe(1);
  });

  it("takes the best bucket of several skills and 0 for none", () => {
    const entity = createTestCharacter({ baking: 35, hauling: 72 });
    expect(affinityScore(entity, ["baking", "hauling", "trading"])).toBe(7);
    expect(affinityScore(entity, [])).toBe(0);
  });
});
