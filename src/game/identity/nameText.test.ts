import { describe, expect, it } from "vitest";
import { fullName, lowestFreeOrdinal, romanNumeral, sameName } from "./nameText";

describe("fullName", () => {
  it("joins given name and byname", () => {
    expect(fullName("Ansel", "atte Brook")).toBe("Ansel atte Brook");
    expect(fullName("Ansel", null)).toBe("Ansel");
    expect(fullName("Ansel", "")).toBe("Ansel");
  });
});

describe("sameName", () => {
  it("ignores case", () => {
    expect(sameName("Ansel Brook", "ansel BROOK")).toBe(true);
    expect(sameName("Ansel Brook", "Ansel Bridge")).toBe(false);
  });
});

describe("romanNumeral", () => {
  it("writes roman numerals", () => {
    expect(romanNumeral(2)).toBe("II");
    expect(romanNumeral(4)).toBe("IV");
    expect(romanNumeral(9)).toBe("IX");
    expect(romanNumeral(14)).toBe("XIV");
    expect(romanNumeral(1994)).toBe("MCMXCIV");
    expect(romanNumeral(0)).toBe("");
  });
});

describe("lowestFreeOrdinal", () => {
  it("is the lowest integer from 2 that is unused", () => {
    expect(lowestFreeOrdinal([0])).toBe(2);
    expect(lowestFreeOrdinal([0, 2])).toBe(3);
    expect(lowestFreeOrdinal([0, 3])).toBe(2);
    expect(lowestFreeOrdinal([0, 2, 3, 4])).toBe(5);
  });
});
