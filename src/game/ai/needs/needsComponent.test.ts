import { describe, expect, it } from "vitest";
import { needsComponent, needsDataSchema } from "./needsComponent";

describe("needsComponent", () => {
  it("defaults to no needs", () => {
    expect(needsComponent.name).toBe("Needs");
    expect(needsComponent.defaults()).toEqual({ values: [] });
  });

  it("round trips JSON", () => {
    const data = {
      values: [
        { needId: "hunger", valueMilli: 80_000 },
        { needId: "rest", valueMilli: 0 },
      ],
    };
    expect(needsDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects unsorted or duplicate ids, out of range and non-integer values", () => {
    const hunger = { needId: "hunger", valueMilli: 1 };
    const rest = { needId: "rest", valueMilli: 1 };
    expect(needsDataSchema.safeParse({ values: [rest, hunger] }).success).toBe(false);
    expect(needsDataSchema.safeParse({ values: [hunger, hunger] }).success).toBe(false);
    expect(
      needsDataSchema.safeParse({ values: [{ needId: "hunger", valueMilli: 100_001 }] }).success,
    ).toBe(false);
    expect(
      needsDataSchema.safeParse({ values: [{ needId: "hunger", valueMilli: 1.5 }] }).success,
    ).toBe(false);
    expect(needsDataSchema.safeParse({ values: [], extra: 1 }).success).toBe(false);
  });
});
