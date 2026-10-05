import { describe, expect, it } from "vitest";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import { CommandQueue, createCommandQueueSection } from "./CommandQueue";

describe("CommandQueue", () => {
  it("hands out ids and keeps commands FIFO", () => {
    const queue = new CommandQueue();
    expect(queue.allocateId()).toBe(1);
    expect(queue.enqueue("a", { x: 1 }, 0)).toBe(2);
    expect(queue.enqueue("b", null, 3)).toBe(3);
    expect(queue.size).toBe(2);
    expect(queue.list().map((entry) => entry.kind)).toEqual(["a", "b"]);
    const taken = queue.takeAll();
    expect(taken.map((entry) => entry.commandId)).toEqual([2, 3]);
    expect(queue.size).toBe(0);
    expect(queue.takeAll()).toEqual([]);
  });

  it("copies payloads on the way in and out", () => {
    const queue = new CommandQueue();
    const payload = { list: [1] };
    queue.enqueue("a", payload, 0);
    payload.list.push(2);
    const listed = queue.list();
    expect(listed[0]?.payload).toEqual({ list: [1] });
    (listed[0]?.payload as { list: number[] }).list.push(9);
    expect(queue.list()[0]?.payload).toEqual({ list: [1] });
  });

  it("round-trips through JSON", () => {
    const queue = new CommandQueue();
    queue.enqueue("a", { count: 5 }, 7);
    const state = JSON.parse(JSON.stringify(queue.serialize()));
    const other = new CommandQueue();
    other.restore(state);
    expect(other.serialize()).toEqual(queue.serialize());
    expect(other.allocateId()).toBe(2);
  });

  it("rejects an invalid saved state", () => {
    expect(() => new CommandQueue().restore({ nextCommandId: 0, pending: [] })).toThrow();
  });
});

describe("createCommandQueueSection", () => {
  it("serializes and restores the queue under systems.commandQueue", () => {
    const queue = new CommandQueue();
    const section = createCommandQueueSection(queue);
    expect(section.key).toBe("commandQueue");
    expect(section.location).toBe(SaveSectionLocation.Systems);
    queue.enqueue("a", { count: 1 }, 2);
    const saved = section.serialize();
    expect(section.schema.safeParse(saved).success).toBe(true);
    queue.takeAll();
    section.restore(saved);
    expect(queue.size).toBe(1);
    expect(section.defaultForOlderSaves?.()).toEqual({ nextCommandId: 1, pending: [] });
  });
});
