import { describe, expect, it } from "vitest";
import { distanceSquared } from "./distanceSquared";

describe("distanceSquared", () => {
  it("is exact and symmetric", () => {
    expect(distanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
    expect(distanceSquared({ x: 3, y: 4 }, { x: 0, y: 0 })).toBe(25);
    expect(distanceSquared({ x: 0, y: 0 }, { x: 65535, y: 65535 })).toBe(2 * 65535 * 65535);
    expect(distanceSquared({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});
