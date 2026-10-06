import { describe, expect, it } from "vitest";
import type { Scheduler } from "../engine/AutoRunner";
import { createSessionRunner } from "./createSessionRunner";
import { GameSession } from "./GameSession";

function fakeScheduler(): { scheduler: Scheduler; fire: () => boolean; pending: () => number } {
  const callbacks = new Map<number, () => void>();
  let next = 1;
  return {
    scheduler: {
      schedule: (callback) => {
        const handle = next;
        next += 1;
        callbacks.set(handle, callback);
        return handle;
      },
      cancel: (handle) => {
        callbacks.delete(handle);
      },
    },
    fire: () => {
      const first = [...callbacks.entries()][0];
      if (first === undefined) {
        return false;
      }
      callbacks.delete(first[0]);
      first[1]();
      return true;
    },
    pending: () => callbacks.size,
  };
}

describe("createSessionRunner", () => {
  it("runs one logged Step tick per scheduled callback and stops cleanly", () => {
    const session = new GameSession();
    session.newGame({ seed: 7 });
    const fake = fakeScheduler();
    const results: boolean[] = [];
    const runner = createSessionRunner(session, {
      scheduler: fake.scheduler,
      onTick: (ok) => results.push(ok),
    });
    expect(runner.isRunning()).toBe(false);
    runner.start();
    expect(runner.isRunning()).toBe(true);
    fake.fire();
    fake.fire();
    expect(session.tick).toBe(2);
    expect(results).toEqual([true, true]);
    runner.stop();
    expect(runner.isRunning()).toBe(false);
    expect(fake.pending()).toBe(0);
  });

  it("reports a failed step instead of throwing", () => {
    const session = new GameSession();
    const fake = fakeScheduler();
    const results: boolean[] = [];
    const runner = createSessionRunner(session, {
      scheduler: fake.scheduler,
      onTick: (ok) => results.push(ok),
    });
    runner.start();
    fake.fire();
    expect(results).toEqual([false]);
    runner.stop();
  });
});
