import { describe, expect, it } from "vitest";
import { seasonModifier } from "./seasonModifier";

describe("seasonModifier", () => {
  it("is normal speed (1000 permille): v1 has no seasons", () => {
    expect(seasonModifier()).toBe(1000);
  });
});
