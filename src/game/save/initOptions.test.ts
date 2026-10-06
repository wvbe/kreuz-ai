import { describe, expect, it } from "vitest";
import { MapSize } from "../map/mapSize";
import { Difficulty, initOptionsSchema } from "./initOptions";

describe("initOptionsSchema", () => {
  const valid = { seed: 7, difficulty: Difficulty.Steady, startingTier: null, mapSize: null };

  it("accepts valid options and map sizes", () => {
    expect(initOptionsSchema.parse(valid)).toEqual(valid);
    expect(initOptionsSchema.parse({ ...valid, mapSize: MapSize.Large }).mapSize).toBe(
      MapSize.Large,
    );
  });

  it("ignores unknown fields (spec 007)", () => {
    expect(initOptionsSchema.parse({ ...valid, typo: 1 })).toEqual(valid);
  });

  // @covers 027:FR-013
  it("rejects bad seeds and unknown difficulties", () => {
    expect(initOptionsSchema.safeParse({ ...valid, seed: -1 }).success).toBe(false);
    expect(initOptionsSchema.safeParse({ ...valid, seed: 2 ** 32 }).success).toBe(false);
    expect(initOptionsSchema.safeParse({ ...valid, difficulty: "normal" }).success).toBe(false);
  });
});
