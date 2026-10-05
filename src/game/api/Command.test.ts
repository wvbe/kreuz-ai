import { describe, expect, it } from "vitest";
import { SpeedSetting } from "../time/GameTime";
import {
  CommandKind,
  emptyPayloadSchema,
  loadGamePayloadSchema,
  maxStepTicks,
  newGamePayloadSchema,
  saveGamePayloadSchema,
  setSpeedPayloadSchema,
  setTickIntervalPayloadSchema,
  stepPayloadSchema,
} from "./Command";
import type { Command } from "./Command";

describe("CommandKind", () => {
  it("has unique kebab-case values", () => {
    const values = Object.values(CommandKind);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe("kernel payload schemas", () => {
  it("accepts well-formed payloads", () => {
    expect(newGamePayloadSchema.safeParse({}).success).toBe(true);
    expect(newGamePayloadSchema.safeParse({ options: { seed: 5, extra: "x" } }).success).toBe(true);
    expect(loadGamePayloadSchema.safeParse({ save: "{}" }).success).toBe(true);
    expect(saveGamePayloadSchema.safeParse({ timestamp: "2026-01-01T00:00:00Z" }).success).toBe(
      true,
    );
    expect(emptyPayloadSchema.safeParse({}).success).toBe(true);
    expect(setSpeedPayloadSchema.safeParse({ speed: SpeedSetting.Double }).success).toBe(true);
    expect(setTickIntervalPayloadSchema.safeParse({ tickIntervalMs: 100 }).success).toBe(true);
    expect(stepPayloadSchema.safeParse({ ticks: maxStepTicks }).success).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(newGamePayloadSchema.safeParse({ options: 3 }).success).toBe(false);
    expect(newGamePayloadSchema.safeParse({ options: { seed: 1.5 } }).success).toBe(false);
    expect(loadGamePayloadSchema.safeParse({ save: "" }).success).toBe(false);
    expect(emptyPayloadSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(setSpeedPayloadSchema.safeParse({ speed: 3 }).success).toBe(false);
    expect(setTickIntervalPayloadSchema.safeParse({ tickIntervalMs: 0 }).success).toBe(false);
    expect(stepPayloadSchema.safeParse({ ticks: 0 }).success).toBe(false);
    expect(stepPayloadSchema.safeParse({ ticks: maxStepTicks + 1 }).success).toBe(false);
    expect(stepPayloadSchema.safeParse({ ticks: 1.5 }).success).toBe(false);
  });

  it("types commands as a discriminated union", () => {
    const command: Command = { kind: CommandKind.Step, ticks: 3 };
    if (command.kind === CommandKind.Step) {
      expect(command.ticks).toBe(3);
    }
  });
});
