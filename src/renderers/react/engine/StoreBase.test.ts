import { describe, expect, it } from "vitest";
import { StoreBase } from "./StoreBase";

class CounterStore extends StoreBase<{ count: number }> {
  constructor() {
    super({ count: 0 });
  }

  increment(): void {
    this.replace({ count: this.getSnapshot().count + 1 });
  }
}

describe("StoreBase", () => {
  it("keeps the snapshot identity until a change and notifies listeners", () => {
    const store = new CounterStore();
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.increment();
    expect(calls).toBe(1);
    expect(store.getSnapshot()).not.toBe(first);
    expect(store.getSnapshot().count).toBe(1);
    unsubscribe();
    store.increment();
    expect(calls).toBe(1);
  });
});
