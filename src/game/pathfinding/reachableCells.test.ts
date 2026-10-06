import { describe, expect, it } from "vitest";
import { reachableCells } from "./reachableCells";
import { createAsciiMap, createPathTestWorld } from "./pathTestWorld";

describe("reachableCells", () => {
  // @covers 012:FR-010
  it("lists the walled-in region with cheapest costs, ascending by cell", () => {
    const map = createAsciiMap(createPathTestWorld(), ["..#.", "..#.", "..#."]);
    const cells = reachableCells(map, 0);
    expect(cells.map((entry) => entry.cell)).toEqual([0, 1, 4, 5, 8, 9]);
    expect(cells.find((entry) => entry.cell === 9)?.cost).toBe(30);
    expect(cells[0]).toEqual({ cell: 0, cost: 0 });
  });

  it("honours the cost bound and invalid starts", () => {
    const map = createAsciiMap(createPathTestWorld(), ["....."]);
    expect(reachableCells(map, 0, 20).map((entry) => entry.cell)).toEqual([0, 1, 2]);
    expect(reachableCells(map, 9)).toEqual([]);
  });
});
