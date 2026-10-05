import { describe, expect, it } from "vitest";
import { healthComponent, healthDataSchema } from "./healthComponent";

describe("healthComponent", () => {
  it("defaults to full health", () => {
    expect(healthComponent.name).toBe("Health");
    expect(healthComponent.defaults()).toEqual({ valueMilli: 100_000 });
  });

  it("round trips JSON and rejects out of range values", () => {
    expect(healthDataSchema.parse(JSON.parse(JSON.stringify({ valueMilli: 42_000 })))).toEqual({
      valueMilli: 42_000,
    });
    expect(healthDataSchema.safeParse({ valueMilli: -1 }).success).toBe(false);
    expect(healthDataSchema.safeParse({ valueMilli: 100_001 }).success).toBe(false);
    expect(healthDataSchema.safeParse({ valueMilli: 1, extra: true }).success).toBe(false);
  });
});
