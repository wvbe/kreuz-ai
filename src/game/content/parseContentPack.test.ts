import { describe, expect, it } from "vitest";
import { bundledContentFiles } from "./ContentLoader";
import { ContentFile } from "./contentTypes";
import { parseContentPack } from "./parseContentPack";

describe("parseContentPack", () => {
  it("parses the bundled pack without issues, in file order", () => {
    const result = parseContentPack(bundledContentFiles);
    expect(result.issues).toEqual([]);
    expect(result.content?.skills.map((skill) => skill.id)[0]).toBe("farming");
    expect(result.content?.materials[0]?.id).toBe("silver_penny");
  });

  it("returns no content and names the file when a file is missing", () => {
    const result = parseContentPack({});
    expect(result.content).toBeNull();
    expect(result.issues).toHaveLength(Object.values(ContentFile).length);
    expect(result.issues.every((issue) => issue.id === null)).toBe(true);
  });

  it("falls back to the position as id when a broken record has no id", () => {
    const result = parseContentPack({
      ...bundledContentFiles,
      [ContentFile.Skills]: [{ name: 1 }],
    });
    expect(
      result.issues.some((issue) => issue.file === ContentFile.Skills && issue.id === "#0"),
    ).toBe(true);
  });
});
