import { describe, expect, it } from "vitest";
import { createFakeScheduler } from "./fakeScheduler";

describe("createFakeScheduler", () => {
  it("runs callbacks only when fired and records delays", () => {
    const fake = createFakeScheduler();
    const calls: number[] = [];
    fake.scheduler.schedule(() => calls.push(1), 50);
    const handle = fake.scheduler.schedule(() => calls.push(2), 70);
    fake.scheduler.schedule(() => calls.push(3), 90);
    expect(calls).toEqual([]);
    fake.scheduler.cancel(handle);
    expect(fake.pending()).toBe(2);
    expect(fake.fireMany(5)).toBe(2);
    expect(calls).toEqual([1, 3]);
    expect(fake.fire()).toBe(false);
    expect(fake.delays).toEqual([50, 70, 90]);
  });
});
