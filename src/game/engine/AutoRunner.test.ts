import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoRunner, createTimerScheduler } from "./AutoRunner";
import type { Scheduler, TimerHandle } from "./AutoRunner";
import { EventBus } from "./EventBus";
import { TickPipeline } from "./TickPipeline";
import { GameTime, SpeedSetting } from "../time/GameTime";

type FakeScheduler = Scheduler & {
  pending: () => { handle: TimerHandle; delayMs: number }[];
  fireNext: () => number;
};

function createFakeScheduler(): FakeScheduler {
  const queue = new Map<TimerHandle, { callback: () => void; delayMs: number }>();
  let nextHandle = 1;
  return {
    schedule: (callback, delayMs) => {
      const handle = nextHandle;
      nextHandle += 1;
      queue.set(handle, { callback, delayMs });
      return handle;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
    pending: () => [...queue].map(([handle, entry]) => ({ handle, delayMs: entry.delayMs })),
    fireNext: () => {
      const first = [...queue][0];
      if (!first) {
        throw new Error("nothing scheduled");
      }
      queue.delete(first[0]);
      first[1].callback();
      return first[1].delayMs;
    },
  };
}

describe("AutoRunner", () => {
  it("schedules one tick per interval and chains the next", () => {
    const time = new GameTime();
    const scheduler = createFakeScheduler();
    let ticks = 0;
    const runner = new AutoRunner({
      time,
      scheduler,
      tick: () => {
        ticks += 1;
      },
    });
    expect(runner.isRunning()).toBe(false);
    expect(scheduler.pending()).toEqual([]);
    runner.start();
    runner.start();
    expect(runner.isRunning()).toBe(true);
    expect(scheduler.pending().map((entry) => entry.delayMs)).toEqual([6250]);
    expect(scheduler.fireNext()).toBe(6250);
    expect(scheduler.fireNext()).toBe(6250);
    expect(ticks).toBe(2);
    expect(scheduler.pending()).toHaveLength(1);
  });

  it("re-reads speed and interval before every tick", () => {
    const time = new GameTime();
    const scheduler = createFakeScheduler();
    const runner = new AutoRunner({ time, scheduler, tick: () => undefined });
    runner.start();
    const delays: number[] = [];
    delays.push(scheduler.fireNext());
    time.setSpeed(SpeedSetting.Double);
    delays.push(scheduler.fireNext());
    time.setSpeed(SpeedSetting.Quarter);
    delays.push(scheduler.fireNext());
    time.setSpeed(SpeedSetting.Normal);
    time.setTickIntervalMs(1000);
    delays.push(scheduler.fireNext());
    expect(delays).toEqual([6250, 6250, 3125, 25000]);
    expect(scheduler.pending().map((entry) => entry.delayMs)).toEqual([1000]);
  });

  it("stop cancels the pending timer and start resumes", () => {
    const time = new GameTime();
    const scheduler = createFakeScheduler();
    let ticks = 0;
    const runner = new AutoRunner({
      time,
      scheduler,
      tick: () => {
        ticks += 1;
      },
    });
    runner.start();
    runner.stop();
    runner.stop();
    expect(scheduler.pending()).toEqual([]);
    expect(runner.isRunning()).toBe(false);
    runner.start();
    scheduler.fireNext();
    expect(ticks).toBe(1);
  });

  it("stops and rethrows when the tick callback throws", () => {
    const time = new GameTime();
    const scheduler = createFakeScheduler();
    const runner = new AutoRunner({
      time,
      scheduler,
      tick: () => {
        throw new Error("boom");
      },
    });
    runner.start();
    expect(() => scheduler.fireNext()).toThrow("boom");
    expect(runner.isRunning()).toBe(false);
    expect(scheduler.pending()).toEqual([]);
  });

  it("drives a pipeline: 2x speed gives 2 ticks per base interval, each tick still +1", () => {
    const bus = new EventBus();
    const time = new GameTime(bus);
    const pipeline = new TickPipeline({ time, bus });
    const scheduler = createFakeScheduler();
    const runner = new AutoRunner({ time, scheduler, tick: () => pipeline.tick() });
    time.setSpeed(SpeedSetting.Double);
    runner.start();
    let elapsedMs = 0;
    while (elapsedMs < 6250) {
      elapsedMs += scheduler.fireNext();
    }
    expect(time.tickCount).toBe(2);
  });

  it("keeps polling while the game is paused without advancing time", () => {
    const bus = new EventBus();
    const time = new GameTime(bus);
    const pipeline = new TickPipeline({ time, bus });
    const scheduler = createFakeScheduler();
    const runner = new AutoRunner({ time, scheduler, tick: () => pipeline.tick() });
    time.pause();
    runner.start();
    scheduler.fireNext();
    scheduler.fireNext();
    expect(time.tickCount).toBe(0);
    time.resume();
    scheduler.fireNext();
    expect(time.tickCount).toBe(1);
  });
});

describe("createTimerScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a callback after the delay and supports cancel", () => {
    vi.useFakeTimers();
    const scheduler = createTimerScheduler();
    const fired: string[] = [];
    scheduler.schedule(() => fired.push("first"), 100);
    const second = scheduler.schedule(() => fired.push("second"), 100);
    scheduler.cancel(second);
    scheduler.cancel(9999);
    vi.advanceTimersByTime(99);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fired).toEqual(["first"]);
  });

  it("the default scheduler drives a real AutoRunner", () => {
    vi.useFakeTimers();
    const time = new GameTime();
    time.setTickIntervalMs(10);
    let ticks = 0;
    const runner = new AutoRunner({
      time,
      tick: () => {
        ticks += 1;
      },
    });
    runner.start();
    vi.advanceTimersByTime(35);
    runner.stop();
    vi.advanceTimersByTime(100);
    expect(ticks).toBe(3);
  });
});
