import { describe, expect, it } from "vitest";
import { SkillError, SkillErrorKind } from "./SkillError";

describe("SkillError", () => {
  it("carries a kind and message", () => {
    const error = new SkillError(SkillErrorKind.DanglingReference, "entity 3 has unknown skill");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SkillError");
    expect(error.kind).toBe(SkillErrorKind.DanglingReference);
    expect(error.message).toBe("entity 3 has unknown skill");
    expect(SkillErrorKind.UnknownSkill).toBe("unknown-skill");
  });
});
