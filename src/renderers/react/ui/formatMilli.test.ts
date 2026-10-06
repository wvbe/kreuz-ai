import { describe, expect, it } from "vitest";
import { formatMilli } from "./formatMilli";

describe("formatMilli", () => {
  it("prints one decimal", () => {
    expect(formatMilli(1500)).toBe("1.5");
    expect(formatMilli(0)).toBe("0.0");
    expect(formatMilli(-2250)).toBe("-2.2");
    expect(formatMilli(320000)).toBe("320.0");
  });
});
