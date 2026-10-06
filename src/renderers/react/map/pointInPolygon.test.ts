import { describe, expect, it } from "vitest";
import { pointInPolygon } from "./pointInPolygon";

const square = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 4 },
  { x: 0, z: 4 },
];
const concave = [
  { x: 0, z: 0 },
  { x: 6, z: 0 },
  { x: 6, z: 6 },
  { x: 3, z: 2 },
  { x: 0, z: 6 },
];

describe("pointInPolygon", () => {
  it("finds points inside and outside a convex polygon", () => {
    expect(pointInPolygon({ x: 2, z: 2 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, z: 2 }, square)).toBe(false);
    expect(pointInPolygon({ x: -0.1, z: 2 }, square)).toBe(false);
  });

  it("handles a concave polygon and degenerate input", () => {
    expect(pointInPolygon({ x: 3, z: 4 }, concave)).toBe(false);
    expect(pointInPolygon({ x: 1, z: 1 }, concave)).toBe(true);
    expect(pointInPolygon({ x: 1, z: 1 }, [])).toBe(false);
  });
});
