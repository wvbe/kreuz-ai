import { describe, expect, it } from "vitest";
import { BlockReason, GridType } from "../map/mapTypes";
import { createAsciiMap, createPathTestWorld } from "./pathTestWorld";
import { linkTraversalCost, NoPathReason, PathResultKind } from "./pathTypes";
import { searchRoute } from "./searchRoute";

const budget = 100000;

describe("searchRoute", () => {
  it("US2.1: crosses an exit/entrance link and ends on the other map", () => {
    const world = createPathTestWorld();
    const first = createAsciiMap(world, ["....."]);
    const second = createAsciiMap(world, ["....."]);
    world.maps.linkMaps({
      mapId: first.id,
      cell: 4,
      targetMapId: second.id,
      targetCell: 0,
      bidirectional: true,
    });
    const { result } = searchRoute(
      world.maps,
      { mapId: first.id, cellIndex: 0 },
      { mapId: second.id, cellIndex: 3 },
      budget,
    );
    expect(result).toEqual({
      kind: PathResultKind.Found,
      steps: [
        { mapId: 1, cellIndex: 1 },
        { mapId: 1, cellIndex: 2 },
        { mapId: 1, cellIndex: 3 },
        { mapId: 1, cellIndex: 4 },
        { mapId: 2, cellIndex: 0 },
        { mapId: 2, cellIndex: 1 },
        { mapId: 2, cellIndex: 2 },
        { mapId: 2, cellIndex: 3 },
      ],
      // 4 cells (40) + link (10) onto grass (10) + 3 cells (30)
      cost: 40 + linkTraversalCost + 10 + 30,
    });
  });

  it("US2.2: unconnected maps and one-way links give no path", () => {
    const world = createPathTestWorld();
    const first = createAsciiMap(world, ["..."]);
    const second = createAsciiMap(world, ["..."]);
    const from = { mapId: first.id, cellIndex: 0 };
    const target = { mapId: second.id, cellIndex: 2 };
    expect(searchRoute(world.maps, from, target, budget).result).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.Unreachable,
    });
    world.maps.linkMaps({ mapId: second.id, cell: 0, targetMapId: first.id, targetCell: 2 });
    expect(searchRoute(world.maps, from, target, budget).result.kind).toBe(PathResultKind.NoPath);
  });

  it("US2.3: routes A to C through B", () => {
    const world = createPathTestWorld();
    const north = createAsciiMap(world, ["..."]);
    const middle = createAsciiMap(world, ["..."]);
    const south = createAsciiMap(world, ["..."]);
    world.maps.linkMaps({
      mapId: north.id,
      cell: 2,
      targetMapId: middle.id,
      targetCell: 0,
      bidirectional: true,
    });
    world.maps.linkMaps({
      mapId: middle.id,
      cell: 2,
      targetMapId: south.id,
      targetCell: 0,
      bidirectional: true,
    });
    const { result } = searchRoute(
      world.maps,
      { mapId: north.id, cellIndex: 0 },
      { mapId: south.id, cellIndex: 1 },
      budget,
    );
    if (result.kind !== PathResultKind.Found) {
      throw new Error("expected a route");
    }
    expect(new Set(result.steps.map((step) => step.mapId))).toEqual(new Set([1, 2, 3]));
    expect(result.steps.at(-1)).toEqual({ mapId: 3, cellIndex: 1 });
  });

  it("US2.4: picks the cheaper of two routes, including link shortcuts inside a map", () => {
    const world = createPathTestWorld();
    const north = createAsciiMap(world, ["mmmmmmmm"]);
    const middle = createAsciiMap(world, ["...."]);
    world.maps.linkMaps({ mapId: north.id, cell: 0, targetMapId: middle.id, targetCell: 0 });
    world.maps.linkMaps({ mapId: middle.id, cell: 3, targetMapId: north.id, targetCell: 7 });
    const { result } = searchRoute(
      world.maps,
      { mapId: north.id, cellIndex: 0 },
      { mapId: north.id, cellIndex: 7 },
      budget,
    );
    // Walking: 7 mud cells = 175. Via the other map: (10 + 10) + 30 + (10 + 25) = 85.
    expect(result).toMatchObject({ kind: PathResultKind.Found, cost: 85 });
  });

  it("reports already there, invalid positions, blocked targets and the budget", () => {
    const world = createPathTestWorld();
    const north = createAsciiMap(world, ["...", "..#"]);
    const here = { mapId: north.id, cellIndex: 1 };
    expect(searchRoute(world.maps, here, here, budget).result.kind).toBe(
      PathResultKind.AlreadyThere,
    );
    expect(searchRoute(world.maps, here, { mapId: 9, cellIndex: 0 }, budget).result).toEqual({
      kind: PathResultKind.NoPath,
      reason: NoPathReason.InvalidPosition,
    });
    expect(searchRoute(world.maps, here, { mapId: north.id, cellIndex: 5 }, budget).result).toEqual(
      {
        kind: PathResultKind.NoPath,
        reason: NoPathReason.Unreachable,
      },
    );
    expect(
      searchRoute(
        world.maps,
        { mapId: north.id, cellIndex: 0 },
        { mapId: north.id, cellIndex: 4 },
        1,
      ).result,
    ).toEqual({ kind: PathResultKind.NoPath, reason: NoPathReason.BudgetExceeded });
    expect(world.maps.require(north.id).blockReason(5)).toBe(BlockReason.Wall);
    expect(north.gridType).toBe(GridType.Square);
  });
});
