import { describe, expect, it } from "vitest";
import { createTestCharacter, createTestSkillContent } from "../../skills/testSkillContent";
import { defaultMoveSpeed, moveSpeedOf } from "./movementSpeed";

describe("moveSpeedOf", () => {
  const content = createTestSkillContent();

  it("is 10 (one normal cell per tick) without modifiers", () => {
    expect(defaultMoveSpeed).toBe(10);
    expect(moveSpeedOf(content, createTestCharacter({}))).toBe(10);
  });

  it("scales with speed multiplier traits that cover unskilled work", () => {
    expect(moveSpeedOf(content, createTestCharacter({}, ["fast_hands"]))).toBe(11);
  });

  it("ignores traits that only touch specific skills and never drops below 1", () => {
    expect(moveSpeedOf(content, createTestCharacter({}, ["strong"]))).toBe(10);
  });
});
