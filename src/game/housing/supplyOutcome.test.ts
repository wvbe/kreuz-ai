import { describe, expect, it } from "vitest";
import { supplyOutcome } from "./supplyOutcome";

describe("supplyOutcome", () => {
  it.each([
    // accumulator, demand, stock, needed, consumed, accumulator after, met
    [0, 1000, 1, 1, 1, 0, true],
    [0, 1000, 0, 1, 0, 1000, false],
    [0, 500, 0, 0, 0, 500, true],
    [500, 500, 1, 1, 1, 0, true],
    [500, 500, 0, 1, 0, 1000, false],
    [750, 250, 5, 1, 1, 0, true],
    [1500, 1000, 1, 2, 0, 1500, false],
    [1500, 1000, 2, 2, 2, 500, true],
    [0, 0, 0, 0, 0, 0, true],
  ])(
    "accumulator %i + demand %i with %i in stock",
    (accumulator, demand, stock, needed, consumed, after, met) => {
      expect(supplyOutcome(accumulator, demand, stock)).toEqual({
        needed,
        consumed,
        accumulator: after,
        met,
      });
    },
  );

  it("consumes a quarter unit per resident on the fourth day only (spec 029 US3.2)", () => {
    let accumulator = 0;
    const consumed: number[] = [];
    for (let day = 0; day < 4; day += 1) {
      const outcome = supplyOutcome(accumulator, 250, 10);
      accumulator = outcome.accumulator;
      consumed.push(outcome.consumed);
    }
    expect(consumed).toEqual([0, 0, 0, 1]);
    expect(accumulator).toBe(0);
  });

  it("consumes floor(days x residents x rate / 1000) units over many days (SC-005)", () => {
    let accumulator = 0;
    let total = 0;
    for (let day = 0; day < 30; day += 1) {
      const outcome = supplyOutcome(accumulator, 3 * 500, 100);
      accumulator = outcome.accumulator;
      total += outcome.consumed;
    }
    expect(total).toBe(Math.floor((30 * 3 * 500) / 1000));
  });

  it("does not let unmet demand pile up beyond one day's units", () => {
    let accumulator = 0;
    for (let day = 0; day < 10; day += 1) {
      accumulator = supplyOutcome(accumulator, 2000, 0).accumulator;
    }
    expect(accumulator).toBe(2000);
  });
});
