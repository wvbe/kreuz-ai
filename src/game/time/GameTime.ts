import { z } from "zod";
import type { EventBus, JsonValue } from "../engine/EventBus";

/**
 * Ticks in one game hour (spec 001 FR-001, design constant, never stored per save).
 */
export const ticksPerHour = 12;

/**
 * Ticks in one game day (24 hours); always use this constant instead of a literal 288.
 */
export const ticksPerDay = ticksPerHour * 24;

/**
 * Days in one week.
 */
export const daysPerWeek = 7;

/**
 * Days in one month (4 weeks).
 */
export const daysPerMonth = 28;

/**
 * Months in one year.
 */
export const monthsPerYear = 12;

/**
 * Days in one year (336).
 */
export const daysPerYear = daysPerMonth * monthsPerYear;

/**
 * Real milliseconds per tick at normal speed unless configured otherwise.
 */
export const defaultTickIntervalMs = 6250;

/**
 * Upper bound accepted for the configurable tick interval (one hour).
 */
export const maxTickIntervalMs = 3_600_000;

/**
 * Game speed. The numeric value is the permille multiplier and the serialized form.
 */
export enum SpeedSetting {
  Quarter = 250,
  Half = 500,
  Normal = 1000,
  Double = 2000,
  Quadruple = 4000,
}

/**
 * Serialized form of {@link GameTime}: integers and one boolean only.
 */
export type GameTimeState = {
  tickCount: number;
  paused: boolean;
  speed: SpeedSetting;
  tickIntervalMs: number;
};

/**
 * Thrown for invalid speeds, intervals, or corrupt serialized time state.
 */
export class GameTimeError extends Error {
  /**
   * Creates a time validation error.
   *
   * @param message - Description of what was rejected.
   */
  constructor(message: string) {
    super(message);
    this.name = "GameTimeError";
  }
}

const gameTimeStateSchema = z
  .object({
    tickCount: z.number().int().min(0),
    paused: z.boolean(),
    speed: z.enum(SpeedSetting),
    tickIntervalMs: z.number().int().min(1).max(maxTickIntervalMs),
  })
  .strict();

/**
 * Integer floor division for non-negative integers, exact over the whole safe range.
 *
 * @param dividend - Non-negative integer.
 * @param divisor - Positive integer.
 * @returns The largest integer not above the exact quotient.
 */
function divideFloor(dividend: number, divisor: number): number {
  return (dividend - (dividend % divisor)) / divisor;
}

/**
 * Tells whether a number is one of the five allowed speeds.
 *
 * @param value - Candidate speed multiplier in permille.
 * @returns True when the value is a {@link SpeedSetting}.
 */
export function isSpeedSetting(value: number): value is SpeedSetting {
  return (
    value === SpeedSetting.Quarter ||
    value === SpeedSetting.Half ||
    value === SpeedSetting.Normal ||
    value === SpeedSetting.Double ||
    value === SpeedSetting.Quadruple
  );
}

/**
 * Whole game hours elapsed at a tick.
 *
 * @param tick - Tick count.
 * @returns Elapsed hours, rounded down.
 */
export function toGameHours(tick: number): number {
  return divideFloor(tick, ticksPerHour);
}

/**
 * Zero-indexed day number of a tick (the UI shows this plus one).
 *
 * @param tick - Tick count.
 * @returns Day index since the start of the simulation.
 */
export function toDay(tick: number): number {
  return divideFloor(tick, ticksPerDay);
}

/**
 * Zero-indexed week number of a tick.
 *
 * @param tick - Tick count.
 * @returns Week index since the start of the simulation.
 */
export function toWeek(tick: number): number {
  return divideFloor(toDay(tick), daysPerWeek);
}

/**
 * Zero-indexed month number of a tick.
 *
 * @param tick - Tick count.
 * @returns Month index since the start of the simulation.
 */
export function toMonth(tick: number): number {
  return divideFloor(toDay(tick), daysPerMonth);
}

/**
 * Zero-indexed year number of a tick.
 *
 * @param tick - Tick count.
 * @returns Year index since the start of the simulation.
 */
export function toYear(tick: number): number {
  return divideFloor(toDay(tick), daysPerYear);
}

/**
 * Position inside the current day.
 *
 * @param tick - Tick count.
 * @returns A value in `0..ticksPerDay-1`.
 */
export function tickOfDay(tick: number): number {
  return tick % ticksPerDay;
}

/**
 * Hour of the current day.
 *
 * @param tick - Tick count.
 * @returns A value in `0..23`.
 */
export function hourOfDay(tick: number): number {
  return divideFloor(tickOfDay(tick), ticksPerHour);
}

/**
 * Real milliseconds between ticks for a configured interval and speed (spec 001 FR-005),
 * rounded down: `floor(tickIntervalMs * 1000 / speed)`.
 *
 * @param tickIntervalMs - Real milliseconds per tick at normal speed.
 * @param speed - Current speed setting.
 * @returns Delay in whole milliseconds.
 */
export function computeTickDelayMs(tickIntervalMs: number, speed: SpeedSetting): number {
  return divideFloor(tickIntervalMs * 1000, speed);
}

/**
 * The simulation clock: an integer tick counter plus pause, speed and tick interval settings.
 * Calendar values are derived from `tickCount` only. State changes happen through methods, and
 * `game.paused`, `game.resumed` and `game.speed.changed` are emitted when an event bus is given.
 */
export class GameTime {
  private state: GameTimeState = {
    tickCount: 0,
    paused: false,
    speed: SpeedSetting.Normal,
    tickIntervalMs: defaultTickIntervalMs,
  };

  /**
   * Creates a clock at tick 0, running, normal speed.
   *
   * @param bus - Optional bus receiving `game.*` events when the settings change.
   */
  constructor(private readonly bus?: EventBus) {}

  /**
   * Number of ticks processed since the simulation started.
   *
   * @returns Tick count.
   */
  get tickCount(): number {
    return this.state.tickCount;
  }

  /**
   * Whether ticking is suspended.
   *
   * @returns True when paused.
   */
  get paused(): boolean {
    return this.state.paused;
  }

  /**
   * Current speed setting.
   *
   * @returns The speed.
   */
  get speed(): SpeedSetting {
    return this.state.speed;
  }

  /**
   * Real milliseconds per tick at normal speed.
   *
   * @returns The configured interval.
   */
  get tickIntervalMs(): number {
    return this.state.tickIntervalMs;
  }

  /**
   * Advances the clock by exactly one tick. The pipeline calls this at slot 2; it does not check
   * the pause flag itself.
   *
   * @returns The new tick count.
   */
  advance(): number {
    if (this.state.tickCount >= Number.MAX_SAFE_INTEGER) {
      throw new GameTimeError("tick count would exceed the safe integer range");
    }
    this.state.tickCount += 1;
    return this.state.tickCount;
  }

  /**
   * Pauses ticking. Does nothing when already paused.
   */
  pause(): void {
    if (this.state.paused) {
      return;
    }
    this.state.paused = true;
    this.bus?.emit("game.paused", { tick: this.state.tickCount });
  }

  /**
   * Resumes ticking. Does nothing when not paused.
   */
  resume(): void {
    if (!this.state.paused) {
      return;
    }
    this.state.paused = false;
    this.bus?.emit("game.resumed", { tick: this.state.tickCount });
  }

  /**
   * Sets the speed; only the five {@link SpeedSetting} values are accepted.
   *
   * @param speed - Speed multiplier in permille.
   */
  setSpeed(speed: number): void {
    if (!isSpeedSetting(speed)) {
      throw new GameTimeError(
        `invalid speed ${String(speed)}; expected 250, 500, 1000, 2000 or 4000`,
      );
    }
    if (speed === this.state.speed) {
      return;
    }
    this.state.speed = speed;
    this.bus?.emit("game.speed.changed", { speed });
  }

  /**
   * Sets the real time per tick at normal speed; effective from the next scheduled tick.
   *
   * @param tickIntervalMs - Integer between 1 and {@link maxTickIntervalMs}.
   */
  setTickIntervalMs(tickIntervalMs: number): void {
    if (
      !Number.isSafeInteger(tickIntervalMs) ||
      tickIntervalMs < 1 ||
      tickIntervalMs > maxTickIntervalMs
    ) {
      throw new GameTimeError(
        `invalid tick interval ${String(tickIntervalMs)}; expected an integer in 1..${maxTickIntervalMs}`,
      );
    }
    this.state.tickIntervalMs = tickIntervalMs;
  }

  /**
   * Real milliseconds until the next automatic tick at the current speed.
   *
   * @returns Delay in whole milliseconds.
   */
  realDelayMs(): number {
    return computeTickDelayMs(this.state.tickIntervalMs, this.state.speed);
  }

  /**
   * Whole game hours elapsed.
   *
   * @returns Elapsed hours.
   */
  toGameHours(): number {
    return toGameHours(this.state.tickCount);
  }

  /**
   * Zero-indexed day.
   *
   * @returns Day index.
   */
  toDay(): number {
    return toDay(this.state.tickCount);
  }

  /**
   * Zero-indexed week.
   *
   * @returns Week index.
   */
  toWeek(): number {
    return toWeek(this.state.tickCount);
  }

  /**
   * Zero-indexed year.
   *
   * @returns Year index.
   */
  toYear(): number {
    return toYear(this.state.tickCount);
  }

  /**
   * Position inside the current day.
   *
   * @returns A value in `0..ticksPerDay-1`.
   */
  tickOfDay(): number {
    return tickOfDay(this.state.tickCount);
  }

  /**
   * Serializes the clock.
   *
   * @returns A copy of the state, ready for JSON.
   */
  serialize(): GameTimeState {
    return { ...this.state };
  }

  /**
   * Replaces the clock with a validated saved state. On any problem it throws and leaves the
   * current state untouched; no defaults are substituted. No events are emitted.
   *
   * @param saved - Parsed JSON of a {@link GameTimeState}.
   */
  restore(saved: JsonValue): void {
    const parsed = gameTimeStateSchema.safeParse(saved);
    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ");
      throw new GameTimeError(`invalid saved time state: ${problems}`);
    }
    this.state = { ...parsed.data };
  }
}
