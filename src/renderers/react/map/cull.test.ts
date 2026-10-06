import { describe, expect, it } from "vitest";
import { isInBounds, visibleIndices } from "./cull";

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };

describe("culling", () => {
  it("keeps points inside the box and within the margin", () => {
    expect(isInBounds({ x: 5, z: 5 }, bounds, 0)).toBe(true);
    expect(isInBounds({ x: 11, z: 5 }, bounds, 0)).toBe(false);
    expect(isInBounds({ x: 10.5, z: 5 }, bounds, 1)).toBe(true);
    expect(isInBounds({ x: 999, z: 999 }, null, 0)).toBe(true);
  });

  it("lists the indices of visible points", () => {
    const points = [
      { x: 1, z: 1 },
      { x: 20, z: 1 },
      { x: 9, z: 9 },
    ];
    expect(visibleIndices(points, bounds, 0)).toEqual([0, 2]);
    expect(visibleIndices(points, null, 0)).toEqual([0, 1, 2]);
  });
});
