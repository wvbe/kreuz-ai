import { describe, expect, it } from "vitest";
import { desiredRuns, HysteresisEvent, stepHysteresis } from "./hysteresis";

describe("stepHysteresis", () => {
  it("stays satisfied above the threshold, also while the stock is short of the target", () => {
    expect(stepHysteresis(false, 17, 20, 15)).toEqual({
      restocking: false,
      event: HysteresisEvent.None,
    });
    expect(stepHysteresis(false, 20, 20, 15).restocking).toBe(false);
  });

  it("starts restocking at the threshold (inclusive)", () => {
    expect(stepHysteresis(false, 15, 20, 15)).toEqual({
      restocking: true,
      event: HysteresisEvent.Started,
    });
    expect(stepHysteresis(false, 0, 20, 15).event).toBe(HysteresisEvent.Started);
  });

  it("keeps restocking between threshold and target and stops at the target", () => {
    expect(stepHysteresis(true, 18, 20, 15)).toEqual({
      restocking: true,
      event: HysteresisEvent.None,
    });
    expect(stepHysteresis(true, 20, 20, 15)).toEqual({
      restocking: false,
      event: HysteresisEvent.Satisfied,
    });
    expect(stepHysteresis(true, 25, 20, 15).restocking).toBe(false);
  });
});

describe("desiredRuns", () => {
  it("wants none unless restocking", () => {
    expect(desiredRuns(false, 0, 20, 4, 5)).toBe(0);
  });

  it("is the deficit in whole runs, capped by the run limit", () => {
    expect(desiredRuns(true, 5, 20, 4, 5)).toBe(4);
    expect(desiredRuns(true, 17, 20, 4, 5)).toBe(1);
    expect(desiredRuns(true, 0, 60, 4, 5)).toBe(5);
    expect(desiredRuns(true, 30, 20, 4, 5)).toBe(0);
  });
});
