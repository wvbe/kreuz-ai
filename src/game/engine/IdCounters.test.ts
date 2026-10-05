import { describe, expect, it } from "vitest";
import type { JsonValue } from "./EventBus";
import { CounterName, IdCounters, IdCountersError, firstId } from "./IdCounters";

describe("IdCounters", () => {
  it("starts every counter at the first id and increments independently", () => {
    const counters = new IdCounters();
    expect(counters.allocate(CounterName.EntityId)).toBe(firstId);
    expect(counters.allocate(CounterName.EntityId)).toBe(firstId + 1);
    expect(counters.allocate(CounterName.TaskId)).toBe(firstId);
    expect(counters.peek(CounterName.EntityId)).toBe(firstId + 2);
    expect(counters.peek(CounterName.EntityId)).toBe(firstId + 2);
  });

  it("covers the counter list of DECISIONS D-05", () => {
    const keys = Object.keys(new IdCounters().serialize());
    expect(keys).toEqual(
      [
        "nextClaimId",
        "nextEntityId",
        "nextJobId",
        "nextMapId",
        "nextMomentId",
        "nextOfferId",
        "nextOrderId",
        "nextPostingId",
        "nextReservationId",
        "nextTaskId",
        "nextZoneEventId",
      ].sort(),
    );
  });

  it("never reuses ids after a save and restore", () => {
    const counters = new IdCounters();
    counters.allocate(CounterName.EntityId);
    counters.allocate(CounterName.EntityId);
    const saved = JSON.parse(JSON.stringify(counters.serialize())) as JsonValue;
    const restored = new IdCounters();
    restored.restore(saved);
    expect(restored.serialize()).toEqual(counters.serialize());
    expect(restored.allocate(CounterName.EntityId)).toBe(3);
  });

  it("refuses to allocate beyond the safe integer range", () => {
    const counters = new IdCounters();
    const state = { ...counters.serialize(), nextTaskId: Number.MAX_SAFE_INTEGER };
    counters.restore(state);
    expect(() => counters.allocate(CounterName.TaskId)).toThrow(IdCountersError);
  });

  it("rejects unknown counter names", () => {
    const counters = new IdCounters();
    const bogus = "nextBogusId" as CounterName;
    expect(() => counters.allocate(bogus)).toThrow(IdCountersError);
    expect(() => counters.peek(bogus)).toThrow(IdCountersError);
  });

  it("restore rejects corrupt state and keeps the current values", () => {
    const counters = new IdCounters();
    counters.allocate(CounterName.JobId);
    const before = counters.serialize();
    const complete = counters.serialize();
    const missing: Record<string, number> = { ...complete };
    delete missing["nextTaskId"];
    const bad: JsonValue[] = [
      missing,
      { ...complete, nextTaskId: 0 },
      { ...complete, nextTaskId: 1.5 },
      { ...complete, nextTaskId: -2 },
      { ...complete, extra: 3 },
      null,
      [],
    ];
    for (const value of bad) {
      expect(() => counters.restore(value)).toThrow(IdCountersError);
    }
    expect(counters.serialize()).toEqual(before);
  });
});
