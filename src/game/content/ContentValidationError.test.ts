import { describe, expect, it } from "vitest";
import { ContentValidationError, formatContentIssue } from "./ContentValidationError";
import { ContentFile } from "./contentTypes";

describe("formatContentIssue", () => {
  it("names file, id and field when present", () => {
    expect(
      formatContentIssue({
        file: ContentFile.Skills,
        id: "baking",
        field: "titleNoun",
        message: "bad",
      }),
    ).toBe("skills.json [baking] titleNoun: bad");
  });

  it("omits an empty id and field", () => {
    expect(
      formatContentIssue({ file: ContentFile.Needs, id: null, field: "", message: "missing" }),
    ).toBe("needs.json: missing");
  });
});

describe("ContentValidationError", () => {
  it("lists every issue on its own line", () => {
    const issues = [
      { file: ContentFile.Skills, id: "a", field: "x", message: "one" },
      { file: ContentFile.Needs, id: "b", field: "y", message: "two" },
    ];
    const error = new ContentValidationError(issues);
    expect(error.issues).toEqual(issues);
    expect(error.message).toContain("2 problems");
    expect(error.message).toContain("skills.json [a] x: one");
    expect(error.message).toContain("needs.json [b] y: two");
    expect(new ContentValidationError([issues[0]!]).message).toContain("1 problem)");
  });
});
