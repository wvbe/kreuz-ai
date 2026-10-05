import { describe, expect, it } from "vitest";
import { EventBus } from "../engine/EventBus";
import type { GameEvent, JsonValue } from "../engine/EventBus";
import {
  GameTime,
  GameTimeError,
  SpeedSetting,
  computeTickDelayMs,
  daysPerYear,
  defaultTickIntervalMs,
  hourOfDay,
  isSpeedSetting,
  maxTickIntervalMs,
  tickOfDay,
  ticksPerDay,
  ticksPerHour,
  toDay,
  toGameHours,
  toMonth,
  toWeek,
  toYear,
} from "./GameTime";

function recordEvents(bus: EventBus): GameEvent[] {
  const seen: GameEvent[] = [];
  bus.subscribe("game.**", (_payload, event) => {
    seen.push(event);
  });
  return seen;
}

describe("calendar constants and helpers", () => {
  it("pins 12 ticks per hour, 288 per day and a 336 day year", () => {
    expect(ticksPerHour).toBe(12);
    expect(ticksPerDay).toBe(288);
    expect(daysPerYear).toBe(336);
  });

  it("derives hours, days, weeks, months, years from the tick only", () => {
    expect(toGameHours(0)).toBe(0);
    expect(toGameHours(11)).toBe(0);
    expect(toGameHours(12)).toBe(1);
    expect(toDay(287)).toBe(0);
    expect(toDay(288)).toBe(1);
    expect(toWeek(288 * 7 - 1)).toBe(0);
    expect(toWeek(288 * 7)).toBe(1);
    expect(toMonth(288 * 28)).toBe(1);
    expect(toYear(288 * 336 - 1)).toBe(0);
    expect(toYear(288 * 336)).toBe(1);
    expect(tickOfDay(288 * 3 + 5)).toBe(5);
    expect(hourOfDay(288 * 3 + 5)).toBe(0);
    expect(hourOfDay(288 * 3 + 12 * 13 + 1)).toBe(13);
  });

  it("stays exact near the end of the safe integer range", () => {
    const tick = Number.MAX_SAFE_INTEGER;
    expect(toDay(tick) * ticksPerDay + tickOfDay(tick)).toBe(tick);
  });
});

describe("isSpeedSetting", () => {
  it("accepts exactly the five speeds", () => {
    for (const speed of [250, 500, 1000, 2000, 4000]) {
      expect(isSpeedSetting(speed)).toBe(true);
    }
    for (const bad of [0, -1, 3, 1500, Number.NaN, 1000.5]) {
      expect(isSpeedSetting(bad)).toBe(false);
    }
  });
});

describe("computeTickDelayMs", () => {
  it("matches the spec 001 interval table", () => {
    expect(computeTickDelayMs(6250, SpeedSetting.Normal)).toBe(6250);
    expect(computeTickDelayMs(6250, SpeedSetting.Double)).toBe(3125);
    expect(computeTickDelayMs(6250, SpeedSetting.Quadruple)).toBe(1562);
    expect(computeTickDelayMs(6250, SpeedSetting.Half)).toBe(12500);
    expect(computeTickDelayMs(6250, SpeedSetting.Quarter)).toBe(25000);
  });
});

describe("GameTime", () => {
  it("starts at tick 0, running, normal speed, 6250 ms", () => {
    const time = new GameTime();
    expect(time.serialize()).toEqual({
      tickCount: 0,
      paused: false,
      speed: 1000,
      tickIntervalMs: defaultTickIntervalMs,
    });
    expect(time.tickCount).toBe(0);
    expect(time.paused).toBe(false);
    expect(time.speed).toBe(SpeedSetting.Normal);
    expect(time.tickIntervalMs).toBe(6250);
  });

  it("advance adds exactly one tick and derives calendar values", () => {
    const time = new GameTime();
    for (let tick = 0; tick < 1000; tick += 1) {
      expect(time.advance()).toBe(tick + 1);
    }
    expect(time.tickCount).toBe(1000);
    expect(time.toDay()).toBe(3);
    expect(time.tickOfDay()).toBe(1000 - 864);
    expect(time.toGameHours()).toBe(83);
    expect(time.toWeek()).toBe(0);
    expect(time.toYear()).toBe(0);
  });

  it("advance refuses to leave the safe integer range", () => {
    const time = new GameTime();
    time.restore({
      tickCount: Number.MAX_SAFE_INTEGER,
      paused: false,
      speed: 1000,
      tickIntervalMs: 6250,
    });
    expect(() => time.advance()).toThrow(GameTimeError);
  });

  it("pause and resume emit events once and are idempotent", () => {
    const bus = new EventBus();
    const seen = recordEvents(bus);
    const time = new GameTime(bus);
    time.advance();
    time.pause();
    time.pause();
    expect(time.paused).toBe(true);
    time.resume();
    time.resume();
    expect(time.paused).toBe(false);
    bus.processQueue();
    expect(seen.map((event) => event.name)).toEqual(["game.paused", "game.resumed"]);
    expect(seen[0]?.payload).toEqual({ tick: 1 });
  });

  it("setSpeed accepts the five speeds and rejects everything else unchanged", () => {
    const bus = new EventBus();
    const seen = recordEvents(bus);
    const time = new GameTime(bus);
    for (const speed of [250, 500, 2000, 4000, 1000]) {
      time.setSpeed(speed);
      expect(time.speed).toBe(speed);
    }
    time.setSpeed(1000);
    bus.processQueue();
    expect(seen.map((event) => event.payload)).toEqual([
      { speed: 250 },
      { speed: 500 },
      { speed: 2000 },
      { speed: 4000 },
      { speed: 1000 },
    ]);
    for (const bad of [0, -1, 3, Number.NaN, 1500]) {
      expect(() => time.setSpeed(bad)).toThrow(GameTimeError);
      expect(time.speed).toBe(1000);
    }
  });

  it("setTickIntervalMs validates integers within bounds", () => {
    const time = new GameTime();
    time.setTickIntervalMs(100);
    expect(time.tickIntervalMs).toBe(100);
    time.setSpeed(2000);
    expect(time.realDelayMs()).toBe(50);
    for (const bad of [0, -5, 1.5, Number.NaN, maxTickIntervalMs + 1]) {
      expect(() => time.setTickIntervalMs(bad)).toThrow(GameTimeError);
    }
    expect(time.tickIntervalMs).toBe(100);
  });

  it("round-trips through JSON (500 hours at 2x paused)", () => {
    const time = new GameTime();
    time.restore({ tickCount: 6000, paused: true, speed: 2000, tickIntervalMs: 6250 });
    const json = JSON.stringify(time.serialize());
    const clone = new GameTime();
    clone.restore(JSON.parse(json) as JsonValue);
    expect(clone.serialize()).toEqual(time.serialize());
    expect(JSON.stringify(clone.serialize())).toBe(json);
    expect(clone.toGameHours()).toBe(500);
  });

  it("restore throws on invalid state and keeps the current state", () => {
    const time = new GameTime();
    time.advance();
    const before = time.serialize();
    const base = { tickCount: 5, paused: false, speed: 1000, tickIntervalMs: 6250 };
    const bad: JsonValue[] = [
      { ...base, tickCount: -1 },
      { ...base, speed: 3 },
      { ...base, tickCount: 1.5 },
      { ...base, tickIntervalMs: 0 },
      { tickCount: 5, paused: false, speed: 1000 },
      { ...base, extra: 1 },
      { ...base, paused: "no" },
      null,
      "text",
    ];
    for (const value of bad) {
      expect(() => time.restore(value)).toThrow(GameTimeError);
    }
    expect(time.serialize()).toEqual(before);
  });

  it("two clocks given the same operations end identical", () => {
    const left = new GameTime();
    const right = new GameTime();
    for (const time of [left, right]) {
      time.setSpeed(500);
      time.advance();
      time.pause();
      time.resume();
      time.advance();
    }
    expect(JSON.stringify(left.serialize())).toBe(JSON.stringify(right.serialize()));
  });
});
