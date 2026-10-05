import { describe, expect, it } from "vitest";
import { citizenComponent, citizenDataSchema } from "./citizenComponent";

describe("citizenComponent", () => {
  it("defaults to no factions and no home", () => {
    expect(citizenComponent.name).toBe("Citizen");
    expect(citizenComponent.defaults()).toEqual({
      factions: [],
      homeDwellingId: null,
      homeAssignedTick: 0,
    });
  });

  it("round trips JSON", () => {
    const data = { factions: [1, 7], homeDwellingId: 12, homeAssignedTick: 40 };
    expect(citizenDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects unsorted, duplicate and non-integer factions and unknown fields", () => {
    const base = citizenComponent.defaults();
    expect(citizenDataSchema.safeParse({ ...base, factions: [3, 1] }).success).toBe(false);
    expect(citizenDataSchema.safeParse({ ...base, factions: [2, 2] }).success).toBe(false);
    expect(citizenDataSchema.safeParse({ ...base, factions: [1.5] }).success).toBe(false);
    expect(citizenDataSchema.safeParse({ ...base, homeAssignedTick: -1 }).success).toBe(false);
    expect(citizenDataSchema.safeParse({ ...base, extra: true }).success).toBe(false);
  });
});
