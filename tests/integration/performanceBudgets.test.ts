import { describe, expect, it } from "vitest";
import { getAiService } from "../../src/game/ai/aiServiceRegistry";
import {
  citizenCount,
  createSettlement,
  measureBootstrap,
  measureOptionValidation,
  measureQueries,
  measureSettlementTick,
} from "../../scripts/lib/perfCases";

// The performance success criteria of the specs (plan task 7.1). Wall-clock budgets are the
// spec's figure times 10 (the suite runs under coverage and on machines shared with other builds; D-114);
// docs/PERFORMANCE.md lists what `npm run perf` measures. The scaling checks compare two sizes
// on the same machine and the counter checks count work, so they do not depend on its speed.

const wallClockFactor = 10;
const dayTicks = 144;

// @covers 013:FR-019 013:FR-020 013:SC-007
describe("performance budgets (wall clock, spec figure x 10; the real figures are `npm run perf`)", () => {
  it("007 SC-001: a game is bootstrapped and idle in under 100 ms (with the Small map under 250 ms)", () => {
    const { bare, withMap } = measureBootstrap();
    expect(bare).toBeLessThan(1000);
    expect(withMap).toBeLessThan(2500);
  });

  it("007 SC-002: invalid options are rejected in under 50 ms", () => {
    expect(measureOptionValidation()).toBeLessThan(500);
  });

  it("007 SC-007: queries answer in under 5 ms with 1000 entities", () => {
    const timings = measureQueries(1000);
    expect(timings["entity count"]).toBeGreaterThanOrEqual(1000);
    for (const [name, milliseconds] of Object.entries(timings)) {
      if (name !== "entity count") {
        expect(milliseconds, `query ${name}`).toBeLessThan(5 * wallClockFactor);
      }
    }
  });

  it("013 SC-010: a decision takes under 5 ms per citizen (a whole 200-citizen tick divided by 200)", () => {
    const { meanMs, citizens } = measureSettlementTick(200, dayTicks);
    expect(citizens).toBe(200);
    expect(meanMs / citizens).toBeLessThan(50);
  });

  it("a 200-citizen settlement ticks in under 50 ms on average (documented budget)", () => {
    const { meanMs, worstMs, citizens } = measureSettlementTick(200, 2 * dayTicks);
    expect(citizens).toBe(200);
    expect(meanMs).toBeLessThan(500);
    expect(worstMs).toBeLessThan(5000);
  });
});

describe("tick cost scales with the settlement, not with its square (task 7.1)", () => {
  it("quadrupling the citizens costs well under sixteen times as much per tick", () => {
    measureSettlementTick(100, 20);
    const small = measureSettlementTick(100, dayTicks).meanMs;
    const large = measureSettlementTick(400, dayTicks).meanMs;
    // linear would be 4, the quadratic hot spots found in task 7.1 gave about 9 to 16
    expect(large / small).toBeLessThan(12);
  });

  it("reachability answers come from the cache for most of the questions of 200 citizens", () => {
    const session = createSettlement(200);
    expect(citizenCount(session)).toBe(200);
    const pathfinding = getAiService(session.engine).pathfinding;
    pathfinding.clearCache();
    session.step(dayTicks);
    const { hits, misses } = pathfinding.reachStats;
    expect(hits + misses).toBeGreaterThan(1000);
    expect(misses / (hits + misses)).toBeLessThan(0.4);
    // one search per start cell and map change at most, never one per citizen and tick
    expect(misses).toBeLessThan(200 * 20);
  });
});
