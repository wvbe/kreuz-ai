import { describe, expect, it } from "vitest";
import { interpolatePosition, tickDelayMs, tickProgress } from "./entityMotion";

describe("tickDelayMs", () => {
  // @covers 024:SC-002
  it("follows the engine rule at every speed", () => {
    expect(tickDelayMs(1000, 1000)).toBe(1000);
    expect(tickDelayMs(1000, 4000)).toBe(250);
    expect(tickDelayMs(1000, 250)).toBe(4000);
    expect(tickDelayMs(1000, 0)).toBe(1000);
  });
});

describe("tickProgress", () => {
  it("runs from 0 to 1 and clamps", () => {
    expect(tickProgress(0, 1000, false)).toBe(0);
    expect(tickProgress(250, 1000, false)).toBe(0.25);
    expect(tickProgress(5000, 1000, false)).toBe(1);
    expect(tickProgress(-5, 1000, false)).toBe(0);
  });

  it("is complete while paused or without an interval", () => {
    expect(tickProgress(0, 1000, true)).toBe(1);
    expect(tickProgress(0, 0, false)).toBe(1);
  });
});

describe("interpolatePosition", () => {
  const previous = { x: 1.5, z: 1.5 };
  const current = { x: 2.5, z: 1.5 };

  it("lerps between the two cell centres", () => {
    expect(interpolatePosition(previous, current, 0)).toEqual(previous);
    expect(interpolatePosition(previous, current, 0.5)).toEqual({ x: 2, z: 1.5 });
    expect(interpolatePosition(previous, current, 1)).toEqual(current);
  });

  it("draws a new entity and a standing one on the cell", () => {
    expect(interpolatePosition(undefined, current, 0)).toEqual(current);
    expect(interpolatePosition(current, current, 0.3)).toEqual(current);
  });

  it("snaps a teleport", () => {
    expect(interpolatePosition({ x: 40, z: 40 }, current, 0.1)).toEqual(current);
  });
});
