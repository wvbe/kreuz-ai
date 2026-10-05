import { describe, expect, it } from "vitest";
import { commandLogSchema } from "./CommandLog";

describe("commandLogSchema", () => {
  it("accepts a log and rejects broken entries", () => {
    const entry = {
      commandId: 1,
      tick: 0,
      appliedTick: null,
      command: { kind: "step", ticks: 2 },
    };
    expect(commandLogSchema.safeParse([entry]).success).toBe(true);
    expect(commandLogSchema.safeParse([]).success).toBe(true);
    expect(commandLogSchema.safeParse([{ ...entry, command: { ticks: 2 } }]).success).toBe(false);
    expect(commandLogSchema.safeParse([{ ...entry, tick: -1 }]).success).toBe(false);
    expect(commandLogSchema.safeParse([{ ...entry, extra: 1 }]).success).toBe(false);
    expect(commandLogSchema.safeParse({}).success).toBe(false);
  });
});
