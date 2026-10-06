import { describe, expect, it } from "vitest";
import type { JsonObject } from "./invariants";
import { checkBounded, checkReferences, checkReservations, collectNonIntegers } from "./invariants";
import { runSoak, seededUnit } from "./soakRun";

// The light soak of plan task 7.1 that runs in CI: the hamlet-to-village opening for about 2,400
// ticks on two seeds with every invariant checked every 300 ticks and two save/load round trips.
// `npm run soak` plays the full 10,000 ticks.

const soakTimeout = 280_000;

describe("soak: invariants of a running game", () => {
  it(
    "seed 42 (steady): nothing is violated and a run with save/load round trips ends in the same state",
    () => {
      const plain = runSoak({
        seed: 42,
        difficulty: "steady",
        ticks: 2400,
        checkEvery: 300,
        roundTrips: 0,
      });
      expect(plain.violations).toEqual([]);
      expect(plain.checkpoints).toBe(8);
      expect(plain.ledgerChecks).toBeGreaterThan(100);
      const interrupted = runSoak({
        seed: 42,
        difficulty: "steady",
        ticks: 2400,
        checkEvery: 300,
        roundTrips: 3,
      });
      expect(interrupted.violations).toEqual([]);
      expect(interrupted.roundTrips).toBeGreaterThan(0);
      expect(interrupted.comparableState).toBe(plain.comparableState);
    },
    soakTimeout,
  );

  it(
    "seed 7 (peaceful): nothing is violated and the entity count stays bounded",
    () => {
      const report = runSoak({
        seed: 7,
        difficulty: "peaceful",
        ticks: 2400,
        checkEvery: 300,
        roundTrips: 2,
      });
      expect(report.violations).toEqual([]);
      expect(report.maxEntities).toBeLessThan(200);
      expect(report.finalEntities).toBeLessThanOrEqual(report.maxEntities);
    },
    soakTimeout,
  );
});

describe("soak: the invariant checks find what they are for", () => {
  it("flags floats, NaN and infinities in state", () => {
    const violations: string[] = [];
    collectNonIntegers(
      { a: 1.5, b: [2, Number.NaN], c: { d: Number.POSITIVE_INFINITY, e: 3 } },
      "root",
      violations,
    );
    expect(violations).toEqual([
      "non-integer 1.5 at root.a",
      "non-integer NaN at root.b[1]",
      "non-integer Infinity at root.c.d",
    ]);
  });

  it("flags a reference to an entity that does not exist, but not one inside a history", () => {
    const root: JsonObject = {
      entities: [
        {
          id: 1,
          components: { Task: { crafterId: 2 }, JobBoard: { history: [{ claimantId: 99 }] } },
        },
        { id: 2, components: { Task: { crafterId: 77 } } },
      ],
      systems: { reservations: { reservations: [] } },
    };
    expect(checkReferences(root)).toEqual(["dangling crafterId=77 at entity#2.Task"]);
  });

  it("flags reservations of more than is in store, duplicates and gone holders", () => {
    const inventory = { slots: [{ materialId: "wheat", quantity: 3 }] };
    const root: JsonObject = {
      entities: [
        { id: 1, components: {} },
        { id: 2, components: { Inventory: inventory } },
      ],
      systems: {
        reservations: {
          reservations: [
            { id: 5, holderId: 1, inventoryOwnerId: 2, materialId: "wheat", quantity: 2 },
            { id: 5, holderId: 9, inventoryOwnerId: 2, materialId: "wheat", quantity: 2 },
          ],
        },
      },
    };
    expect(checkReservations(root)).toEqual([
      "reservation 5 appears twice",
      "reservation 5: holder 9 is gone",
      "reservations of wheat on #2 total 4, stock 3",
    ]);
  });

  it("flags a swollen queue and an empty slot", () => {
    const root: JsonObject = {
      eventQueue: { queue: [1, 2, 3] },
      systems: { commandQueue: { pending: [] } },
      entities: [
        { id: 4, components: { Inventory: { slots: [{ materialId: "bread", quantity: 0 }] } } },
      ],
    };
    expect(checkBounded(root, 2)).toEqual([
      "event queue holds 3 events (limit 2)",
      "entity#4 holds 0 bread",
    ]);
  });

  it("the seeded generator repeats and spreads", () => {
    const first = seededUnit(5);
    const second = seededUnit(5);
    const values = [first(), first(), first()];
    expect(values).toEqual([second(), second(), second()]);
    expect(new Set(values).size).toBe(3);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
