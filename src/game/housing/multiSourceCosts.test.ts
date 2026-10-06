import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { BlockReason } from "../map/mapTypes";
import { reachableCells } from "../pathfinding/reachableCells";
import { multiSourceCosts } from "./multiSourceCosts";

describe("multiSourceCosts", () => {
  // @covers 029:FR-008
  it("equals the minimum over the single-source costs", () => {
    const world = createAiWorld({ width: 8, height: 6 });
    const map = world.engine.maps.require(world.mapId);
    map.setObstruction(19, BlockReason.Wall);
    map.setObstruction(20, BlockReason.Wall);
    const starts = [9, 30];
    const combined = multiSourceCosts(map, starts);
    const singles = starts.map((start) => {
      const costs = new Map(reachableCells(map, start).map((entry) => [entry.cell, entry.cost]));
      return costs;
    });
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      const options = singles
        .map((costs) => costs.get(cell))
        .filter((cost): cost is number => cost !== undefined);
      expect(combined[cell]).toBe(options.length === 0 ? -1 : Math.min(...options));
    }
  });

  it("marks cells that no start reaches with -1 and starts with 0", () => {
    const world = createAiWorld({ width: 5, height: 1 });
    const map = world.engine.maps.require(world.mapId);
    map.setObstruction(2, BlockReason.Wall);
    const costs = multiSourceCosts(map, [0]);
    expect(costs[0]).toBe(0);
    expect(costs[1]).toBeGreaterThan(0);
    expect(costs[3]).toBe(-1);
    expect(costs[4]).toBe(-1);
  });

  it("ignores starts outside the map", () => {
    const world = createAiWorld({ width: 3, height: 1 });
    const map = world.engine.maps.require(world.mapId);
    expect([...multiSourceCosts(map, [99])]).toEqual([-1, -1, -1]);
  });
});
