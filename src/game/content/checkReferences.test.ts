import { describe, expect, it } from "vitest";
import { checkReferences } from "./checkReferences";
import { bundledContentFiles } from "./ContentLoader";
import { ContentFile } from "./contentTypes";
import { parseContentPack } from "./parseContentPack";
import type { ParsedContent } from "./parseContentPack";

function parsed(): ParsedContent {
  const result = parseContentPack(bundledContentFiles);
  if (!result.content) {
    throw new Error("bundled pack must parse");
  }
  return structuredClone(result.content);
}

describe("checkReferences", () => {
  it("accepts the bundled pack", () => {
    expect(checkReferences(parsed())).toEqual([]);
  });

  it("reports byname and title noun clashes", () => {
    const content = parsed();
    content.nameLists[0]?.bynames.push("Baker");
    const issues = checkReferences(content);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: ContentFile.NameLists, id: "common_13c" });
  });

  it("reports every dangling reference of a record, not just the first", () => {
    const content = parsed();
    const recipe = content.recipes.find((entry) => entry.id === "bake_bread");
    if (!recipe) throw new Error("fixture");
    recipe.inputs = [{ materialId: "rye", quantity: 1 }];
    recipe.skillId = "milling";
    const fields = checkReferences(content).map((issue) => issue.field);
    expect(fields).toEqual(["inputs.0.materialId", "skillId"]);
  });
});
