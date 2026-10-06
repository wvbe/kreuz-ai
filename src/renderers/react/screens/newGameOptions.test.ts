import { describe, expect, it } from "vitest";
import {
  defaultDifficulty,
  difficultyChoices,
  mapSizeChoices,
  maxSeed,
  parseSeed,
  randomSeed,
  tierChoices,
} from "./newGameOptions";

describe("newGameOptions", () => {
  it("offers the three difficulties with descriptions and Steady by default", () => {
    expect(difficultyChoices.map((choice) => choice.value)).toEqual([
      "peaceful",
      "steady",
      "harsh",
    ]);
    expect(difficultyChoices.every((choice) => choice.description.length > 10)).toBe(true);
    expect(defaultDifficulty).toBe("steady");
    expect(mapSizeChoices).toHaveLength(3);
    expect(tierChoices[0]?.value).toBe("hamlet");
  });

  it("parses seeds strictly", () => {
    expect(parseSeed("42")).toBe(42);
    expect(parseSeed(" 0 ")).toBe(0);
    expect(parseSeed(String(maxSeed))).toBe(maxSeed);
    expect(parseSeed(String(maxSeed + 1))).toBeNull();
    expect(parseSeed("-1")).toBeNull();
    expect(parseSeed("4.5")).toBeNull();
    expect(parseSeed("")).toBeNull();
  });

  it("draws seeds in range", () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.999999999)).toBeLessThanOrEqual(maxSeed);
  });
});
