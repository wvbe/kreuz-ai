import { describe, expect, it } from "vitest";
import { dwellingComponent, dwellingDataSchema } from "./dwellingComponent";

describe("dwellingComponent", () => {
  it("defaults to a Hovel with empty counters", () => {
    expect(dwellingComponent.defaults()).toEqual({
      level: "hovel",
      upgradeStreak: 0,
      downgradeStreak: 0,
      consumptionAccumulators: {},
      foodRecord: {},
      lastEvaluatedDay: null,
    });
  });

  it("accepts a progressed record and survives a JSON round trip", () => {
    const data = {
      level: "cottage",
      upgradeStreak: 2,
      downgradeStreak: 0,
      consumptionAccumulators: { bread: 500, "ale|wine": 250 },
      foodRecord: { bread: 4, cheese: 5 },
      lastEvaluatedDay: 5,
    };
    const parsed = dwellingDataSchema.parse(JSON.parse(JSON.stringify(data)));
    expect(parsed).toEqual(data);
  });

  it("rejects unknown levels, negative or fractional numbers and extra fields", () => {
    const base = dwellingComponent.defaults();
    expect(dwellingDataSchema.safeParse({ ...base, level: "castle" }).success).toBe(false);
    expect(dwellingDataSchema.safeParse({ ...base, upgradeStreak: -1 }).success).toBe(false);
    expect(
      dwellingDataSchema.safeParse({ ...base, consumptionAccumulators: { bread: 0.5 } }).success,
    ).toBe(false);
    expect(dwellingDataSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
