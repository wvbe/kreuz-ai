import { describe, expect, it } from "vitest";
import { maxMoodInfluences } from "../aiTypes";
import { moodComponent, moodDataSchema } from "./moodComponent";

describe("moodComponent", () => {
  it("defaults to neutral mood without influences", () => {
    expect(moodComponent.name).toBe("Mood");
    expect(moodComponent.defaults()).toEqual({ valueMilli: 50_000, influences: [] });
  });

  it("round trips JSON", () => {
    const data = {
      valueMilli: 61_234,
      influences: [{ source: "consumed_hunger", deltaMilli: 3000, untilTick: 99 }],
    };
    expect(moodDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects too many influences, out of range mood and unknown fields", () => {
    const influence = { source: "x", deltaMilli: 1, untilTick: 1 };
    expect(
      moodDataSchema.safeParse({
        valueMilli: 1,
        influences: Array.from({ length: maxMoodInfluences + 1 }, () => influence),
      }).success,
    ).toBe(false);
    expect(moodDataSchema.safeParse({ valueMilli: 100_001, influences: [] }).success).toBe(false);
    expect(moodDataSchema.safeParse({ valueMilli: 1, influences: [], extra: 1 }).success).toBe(
      false,
    );
  });
});
