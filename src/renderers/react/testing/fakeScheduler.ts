import type { Scheduler } from "../../../game/engine/AutoRunner";

/**
 * A scheduler a test drives by hand: nothing runs until `fire` is called.
 */
export type FakeScheduler = {
  scheduler: Scheduler;
  /**
   * Runs the oldest pending callback; false when none is pending.
   */
  fire: () => boolean;
  /**
   * Runs pending callbacks up to `count` times.
   *
   * @returns How many ran.
   */
  fireMany: (count: number) => number;
  /**
   * Number of callbacks waiting.
   */
  pending: () => number;
  /**
   * The delays the callbacks were scheduled with, in order.
   */
  delays: number[];
};

/**
 * Creates a hand-driven scheduler for `EngineHost` and `createSessionRunner` tests.
 *
 * @returns The scheduler and its controls.
 */
export function createFakeScheduler(): FakeScheduler {
  const callbacks = new Map<number, () => void>();
  const delays: number[] = [];
  let next = 1;
  const fire = (): boolean => {
    const first = [...callbacks.entries()][0];
    if (first === undefined) {
      return false;
    }
    callbacks.delete(first[0]);
    first[1]();
    return true;
  };
  return {
    scheduler: {
      schedule: (callback, delayMs) => {
        const handle = next;
        next += 1;
        callbacks.set(handle, callback);
        delays.push(delayMs);
        return handle;
      },
      cancel: (handle) => {
        callbacks.delete(handle);
      },
    },
    fire,
    fireMany: (count) => {
      let ran = 0;
      while (ran < count && fire()) {
        ran += 1;
      }
      return ran;
    },
    pending: () => callbacks.size,
    delays,
  };
}
