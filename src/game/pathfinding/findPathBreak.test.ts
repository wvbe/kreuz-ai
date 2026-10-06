import { describe, expect, it } from "vitest";
import { BlockReason } from "../map/mapTypes";
import { findPathBreak } from "./findPathBreak";
import { createAsciiMap, createPathTestWorld } from "./pathTestWorld";

describe("findPathBreak", () => {
  it("is null for a valid path and the index of the first bad step otherwise", () => {
    const map = createAsciiMap(createPathTestWorld(), ["....", "...."]);
    expect(findPathBreak(map, 0, [1, 2, 3])).toBeNull();
    expect(findPathBreak(map, 0, [])).toBeNull();
    expect(findPathBreak(map, 0, [1, 3])).toBe(1);
    expect(findPathBreak(map, 0, [0])).toBe(0);
    expect(findPathBreak(map, 0, [1, 99])).toBe(1);
    expect(findPathBreak(map, 99, [1])).toBe(0);
  });

  // @covers 012:FR-006
  it("detects an obstacle that appeared on the path", () => {
    const map = createAsciiMap(createPathTestWorld(), ["....", "...."]);
    map.setObstruction(2, BlockReason.Wall);
    expect(findPathBreak(map, 0, [1, 2, 3])).toBe(1);
  });
});
