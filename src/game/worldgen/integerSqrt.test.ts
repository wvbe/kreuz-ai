import { describe, expect, it } from "vitest";
import { integerSqrt } from "./integerSqrt";

describe("integerSqrt", () => {
  it("returns the floor of the square root", () => {
    expect(integerSqrt(0)).toBe(0);
    expect(integerSqrt(1)).toBe(1);
    expect(integerSqrt(15)).toBe(3);
    expect(integerSqrt(16)).toBe(4);
    expect(integerSqrt(17)).toBe(4);
    expect(integerSqrt(7158278)).toBe(2675);
    expect(integerSqrt(4294967296)).toBe(65536);
  });

  it("is exact around perfect squares", () => {
    for (let root = 2; root < 300; root += 7) {
      expect(integerSqrt(root * root - 1)).toBe(root - 1);
      expect(integerSqrt(root * root)).toBe(root);
      expect(integerSqrt(root * root + 1)).toBe(root);
    }
  });

  it("rejects negative and fractional input", () => {
    expect(() => integerSqrt(-1)).toThrow(RangeError);
    expect(() => integerSqrt(2.5)).toThrow(RangeError);
  });
});
