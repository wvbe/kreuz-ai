import { AutoRunner } from "../engine/AutoRunner";
import type { Scheduler } from "../engine/AutoRunner";
import type { GameSession } from "./GameSession";

/**
 * Handle of a real-time driver of a session: the surface of `AutoRunner` that hosts need.
 */
export type SessionRunner = {
  /**
   * Starts scheduling ticks (no effect when running).
   */
  start: () => void;
  /**
   * Stops scheduling (no effect when stopped).
   */
  stop: () => void;
  /**
   * Whether ticks are being scheduled.
   */
  isRunning: () => boolean;
};

/**
 * Options of {@link createSessionRunner}.
 */
export type SessionRunnerOptions = {
  /**
   * Timer facility; default the real one (`setTimeout`), tests pass a fake.
   */
  scheduler?: Scheduler;
  /**
   * Called after every tick the runner ran, with whether the underlying Step succeeded. A failed
   * step (for example no game) is reported here instead of thrown.
   */
  onTick?: (ok: boolean) => void;
};

/**
 * Wraps a session in an `AutoRunner` so a host (the React `EngineHost`) gets real time without
 * touching the engine tree: every scheduled tick is the ordinary `Step` command of one tick, so
 * it is logged and replays to the identical state hash. While the clock is paused the ticks are
 * no-ops that still apply waiting commands (DECISIONS D-23).
 *
 * @param session - The session to drive.
 * @param options - Scheduler and tick callback.
 * @returns The runner handle.
 */
export function createSessionRunner(
  session: GameSession,
  options: SessionRunnerOptions = {},
): SessionRunner {
  const runner = new AutoRunner({
    time: session.engine.time,
    scheduler: options.scheduler,
    tick: () => {
      const result = session.step(1);
      options.onTick?.(result.ok);
    },
  });
  return {
    start: () => {
      runner.start();
    },
    stop: () => {
      runner.stop();
    },
    isRunning: () => runner.isRunning(),
  };
}
