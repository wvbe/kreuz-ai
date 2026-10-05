import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import { PathHeap } from "./PathHeap";

describe("PathHeap", () => {
  it("pops by priority, then estimate, then key", () => {
    const heap = new PathHeap();
    heap.push({ priority: 10, estimate: 5, key: 3, cost: 5 });
    heap.push({ priority: 10, estimate: 2, key: 9, cost: 8 });
    heap.push({ priority: 10, estimate: 2, key: 4, cost: 8 });
    heap.push({ priority: 7, estimate: 7, key: 50, cost: 0 });
    expect(heap.size).toBe(4);
    const order: number[] = [];
    for (let entry = heap.pop(); entry !== undefined; entry = heap.pop()) {
      order.push(entry.key);
    }
    expect(order).toEqual([50, 4, 9, 3]);
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBeUndefined();
  });

  it("sorts random entries like a full sort (independent of insertion order)", () => {
    const stream = Prng.create({ seed: 5 }).stream("test.heap");
    const entries = Array.from({ length: 300 }, (_, key) => ({
      priority: stream.nextBelow(20),
      estimate: stream.nextBelow(5),
      key,
      cost: 0,
    }));
    const expected = [...entries].sort(
      (left, right) =>
        left.priority - right.priority || left.estimate - right.estimate || left.key - right.key,
    );
    const heap = new PathHeap();
    for (const entry of entries) {
      heap.push(entry);
    }
    const popped = expected.map(() => heap.pop());
    expect(popped).toEqual(expected);
  });
});
