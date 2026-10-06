import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { hopDistance } from "./hopDistance";

describe("hopDistance", () => {
  const world = createAiWorld({ width: 10, height: 10 });
  const map = world.engine.maps.require(world.mapId);

  it("is 0 for the same cell and counts the steps of the adjacency graph", () => {
    expect(hopDistance(map, 0, 0, 5)).toBe(0);
    expect(hopDistance(map, 0, 1, 5)).toBe(1);
    expect(hopDistance(map, 0, 23, 9)).toBe(5);
  });

  it("returns null beyond the limit", () => {
    expect(hopDistance(map, 0, 23, 4)).toBeNull();
    expect(hopDistance(map, 0, 99, 0)).toBeNull();
  });
});
