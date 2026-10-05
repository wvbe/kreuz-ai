import type { GameTime } from "../time/GameTime";

/**
 * Opaque handle for a scheduled callback.
 */
export type TimerHandle = number;

/**
 * Injected timer facility. The real one wraps `setTimeout`; tests inject a fake.
 */
export type Scheduler = {
  /**
   * Runs `callback` once after `delayMs` real milliseconds.
   */
  schedule: (callback: () => void, delayMs: number) => TimerHandle;
  /**
   * Cancels a pending callback; unknown handles are ignored.
   */
  cancel: (handle: TimerHandle) => void;
};

/**
 * Construction options for {@link AutoRunner}.
 */
export type AutoRunnerOptions = {
  time: GameTime;
  /**
   * Advances the simulation by one tick (normally `TickPipeline.tick`).
   */
  tick: () => void;
  /**
   * Timer facility; defaults to {@link createTimerScheduler}.
   */
  scheduler?: Scheduler;
};

/**
 * Creates the real scheduler backed by `setTimeout`. This file is the only code in `src/game`
 * allowed to touch timers (lint override, spec 001 and DECISIONS D-22).
 *
 * @returns A scheduler using the host timer implementation.
 */
export function createTimerScheduler(): Scheduler {
  const pending = new Map<TimerHandle, ReturnType<typeof setTimeout>>();
  let nextHandle = 1;
  return {
    schedule: (callback, delayMs) => {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(
        handle,
        setTimeout(() => {
          pending.delete(handle);
          callback();
        }, delayMs),
      );
      return handle;
    },
    cancel: (handle) => {
      const timer = pending.get(handle);
      if (timer !== undefined) {
        clearTimeout(timer);
        pending.delete(handle);
      }
    },
  };
}

/**
 * Optional real-time driver: calls `tick()` every `tickIntervalMs / speed` real milliseconds.
 * It chains one timer at a time and re-reads the clock settings before each, so speed and
 * interval changes apply from the next tick. Each call advances exactly one tick at every speed;
 * there is no catch-up. While the game is paused the ticks are no-ops, so the runner keeps
 * polling. If the tick callback throws, the runner stops and the error propagates to the host.
 * It never reads the wall clock.
 */
export class AutoRunner {
  private readonly scheduler: Scheduler;
  private handle: TimerHandle | null = null;
  private running = false;

  /**
   * Creates a stopped runner.
   *
   * @param options - Clock, tick callback and optional scheduler.
   */
  constructor(private readonly options: AutoRunnerOptions) {
    this.scheduler = options.scheduler ?? createTimerScheduler();
  }

  /**
   * Whether the runner is scheduling ticks.
   *
   * @returns True between `start` and `stop`.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Starts scheduling ticks. Does nothing when already running.
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.scheduleNext();
  }

  /**
   * Stops scheduling and cancels the pending timer. Does nothing when stopped.
   */
  stop(): void {
    this.running = false;
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle);
      this.handle = null;
    }
  }

  private scheduleNext(): void {
    this.handle = this.scheduler.schedule(() => {
      this.handle = null;
      try {
        this.options.tick();
      } catch (failure) {
        this.running = false;
        throw failure;
      }
      if (this.running) {
        this.scheduleNext();
      }
    }, this.options.time.realDelayMs());
  }
}
