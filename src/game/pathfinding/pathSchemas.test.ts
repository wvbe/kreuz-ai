import { describe, expect, it } from "vitest";
import { pathResultSchema, routeResultSchema } from "./pathSchemas";
import { NoPathReason, PathResultKind } from "./pathTypes";
import type { PathResult } from "./pathTypes";

describe("pathResultSchema", () => {
  it("accepts the three result kinds and survives a JSON round trip", () => {
    for (const result of [
      { kind: PathResultKind.Found, cells: [1, 2, 3], cost: 30 },
      { kind: PathResultKind.AlreadyThere },
      { kind: PathResultKind.NoPath, reason: NoPathReason.Unreachable },
    ]) {
      const copy = JSON.parse(JSON.stringify(result)) as PathResult;
      expect(pathResultSchema.parse(copy)).toEqual(result);
    }
  });

  it("rejects an empty found path, unknown fields and fractional costs", () => {
    expect(pathResultSchema.safeParse({ kind: "found", cells: [], cost: 0 }).success).toBe(false);
    expect(pathResultSchema.safeParse({ kind: "already-there", extra: 1 }).success).toBe(false);
    expect(pathResultSchema.safeParse({ kind: "found", cells: [1], cost: 1.5 }).success).toBe(
      false,
    );
  });
});

describe("routeResultSchema", () => {
  it("accepts a route over two maps and rejects map id 0", () => {
    const route = {
      kind: PathResultKind.Found,
      steps: [
        { mapId: 1, cellIndex: 4 },
        { mapId: 2, cellIndex: 0 },
      ],
      cost: 30,
    };
    expect(routeResultSchema.parse(route)).toEqual(route);
    expect(
      routeResultSchema.safeParse({
        kind: "found",
        steps: [{ mapId: 0, cellIndex: 1 }],
        cost: 1,
      }).success,
    ).toBe(false);
  });
});
