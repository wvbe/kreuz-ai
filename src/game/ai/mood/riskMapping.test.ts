import { describe, expect, it } from "vitest";
import { Prng } from "../../engine/Prng";
import { riskSuccessPermille, rollRisk } from "./riskMapping";

// @covers 013:FR-005 013:SC-001
describe("riskSuccessPermille", () => {
  it.each([
    [10_000, 200],
    [50_000, 500],
    [90_000, 800],
    [30_000, 350],
    [70_000, 650],
  ])("maps mood %i to %i permille (spec 013: 20/50/80 percent)", (mood, expected) => {
    expect(riskSuccessPermille(mood)).toBe(expected);
  });

  it("clamps outside 10..90 percent instead of extrapolating", () => {
    expect(riskSuccessPermille(0)).toBe(200);
    expect(riskSuccessPermille(5_000)).toBe(200);
    expect(riskSuccessPermille(95_000)).toBe(800);
    expect(riskSuccessPermille(100_000)).toBe(800);
  });

  it("equals 20 + (mood - 10) * 60 / 80 percent between the bounds", () => {
    for (let mood = 10; mood <= 90; mood += 1) {
      const percent = 20 + ((mood - 10) * 60) / 80;
      expect(riskSuccessPermille(mood * 1000)).toBe(Math.floor(percent * 10));
    }
  });
});

describe("rollRisk", () => {
  it("is deterministic per stream and respects the probability", () => {
    const first = Prng.create({ seed: 5 }).stream("ai.risk");
    const second = Prng.create({ seed: 5 }).stream("ai.risk");
    const rolls = Array.from({ length: 50 }, () => rollRisk(first, 50_000));
    expect(Array.from({ length: 50 }, () => rollRisk(second, 50_000))).toEqual(rolls);
    const high = Prng.create({ seed: 9 }).stream("ai.risk");
    const low = Prng.create({ seed: 9 }).stream("ai.risk");
    const highWins = Array.from({ length: 400 }, () => rollRisk(high, 90_000)).filter(Boolean);
    const lowWins = Array.from({ length: 400 }, () => rollRisk(low, 10_000)).filter(Boolean);
    expect(highWins.length).toBeGreaterThan(lowWins.length * 2);
  });
});
