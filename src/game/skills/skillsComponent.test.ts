import { describe, expect, it } from "vitest";
import {
  skillsComponent,
  skillsDataSchema,
  traitsComponent,
  traitsDataSchema,
} from "./skillsComponent";

describe("skillsComponent", () => {
  it("defaults to no skills", () => {
    expect(skillsComponent.name).toBe("Skills");
    expect(skillsComponent.defaults()).toEqual({ values: {} });
  });

  it("round trips JSON", () => {
    const data = { values: { baking: 35_000, farming: 100_000 } };
    expect(skillsDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects fractions, out-of-range values, bad ids and unknown fields", () => {
    expect(skillsDataSchema.safeParse({ values: { baking: 0.5 } }).success).toBe(false);
    expect(skillsDataSchema.safeParse({ values: { baking: -1 } }).success).toBe(false);
    expect(skillsDataSchema.safeParse({ values: { baking: 100_001 } }).success).toBe(false);
    expect(skillsDataSchema.safeParse({ values: { Baking: 1 } }).success).toBe(false);
    expect(skillsDataSchema.safeParse({ values: {}, extra: 1 }).success).toBe(false);
  });
});

describe("traitsComponent", () => {
  it("defaults to no traits", () => {
    expect(traitsComponent.name).toBe("Traits");
    expect(traitsComponent.defaults()).toEqual({ ids: [] });
  });

  it("round trips JSON and rejects duplicates and bad ids", () => {
    const data = { ids: ["born_baker", "strong"] };
    expect(traitsDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(traitsDataSchema.safeParse({ ids: ["strong", "strong"] }).success).toBe(false);
    expect(traitsDataSchema.safeParse({ ids: ["Strong"] }).success).toBe(false);
    expect(traitsDataSchema.safeParse({ ids: [], extra: 1 }).success).toBe(false);
  });
});
