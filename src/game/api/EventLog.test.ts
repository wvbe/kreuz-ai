import { describe, expect, it } from "vitest";
import { defaultRecentEventLimit, EventLog } from "./EventLog";

describe("EventLog", () => {
  it("numbers events, keeps the newest ones and reports drops", () => {
    const log = new EventLog(3);
    const first = log.mark();
    for (let index = 1; index <= 5; index += 1) {
      log.push(index, "demo.event", { index });
    }
    expect(log.total).toBe(5);
    expect(log.recent().map((record) => record.seq)).toEqual([3, 4, 5]);
    expect(log.recent(2).map((record) => record.seq)).toEqual([4, 5]);
    expect(log.recent(0)).toEqual([]);
    const seen = log.since(first);
    expect(seen.events.map((record) => record.seq)).toEqual([3, 4, 5]);
    expect(seen.droppedEvents).toBe(2);
    expect(log.since(4).events).toHaveLength(1);
    expect(log.since(4).droppedEvents).toBe(0);
    expect(log.since(5)).toEqual({ events: [], droppedEvents: 0 });
  });

  it("copies payloads so mutation cannot reach the buffer", () => {
    const log = new EventLog();
    const payload = { list: [1] };
    const pushed = log.push(1, "demo.event", payload);
    payload.list.push(2);
    (pushed.payload as { list: number[] }).list.push(3);
    (log.recent()[0]?.payload as { list: number[] }).list.push(4);
    (log.since(0).events[0]?.payload as { list: number[] }).list.push(5);
    expect(log.recent()[0]?.payload).toEqual({ list: [1] });
  });

  it("rejects an invalid limit and has a default", () => {
    expect(() => new EventLog(0)).toThrow(RangeError);
    expect(() => new EventLog(1.5)).toThrow(RangeError);
    expect(defaultRecentEventLimit).toBeGreaterThan(0);
    expect(new EventLog().mark()).toBe(0);
  });
});
