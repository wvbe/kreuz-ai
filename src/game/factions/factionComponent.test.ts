import { describe, expect, it } from "vitest";
import { factionComponent, factionDataSchema } from "./factionComponent";

// @covers 021:FR-001 021:FR-014
describe("factionComponent", () => {
  it("defaults to an unnamed political faction without leader or standing", () => {
    expect(factionComponent.name).toBe("Faction");
    expect(factionComponent.defaults()).toEqual({
      contentId: null,
      name: "",
      factionType: "political",
      leaderTitle: "",
      disposition: "none",
      leaderId: null,
      standing: [],
      seat: null,
    });
  });

  it("round trips a seat and rejects a malformed one", () => {
    const base = factionComponent.defaults();
    const seated = { ...base, seat: { mapId: 1, cellIndex: 77 } };
    expect(factionDataSchema.parse(JSON.parse(JSON.stringify(seated)))).toEqual(seated);
    expect(factionDataSchema.safeParse({ ...base, seat: { mapId: 0, cellIndex: 1 } }).success).toBe(
      false,
    );
    expect(
      factionDataSchema.safeParse({ ...base, seat: { mapId: 1, cellIndex: -1 } }).success,
    ).toBe(false);
  });

  it("round trips JSON with a standing list", () => {
    const data = {
      ...factionComponent.defaults(),
      leaderId: 4,
      standing: [
        { factionId: 2, value: -100, tradeAgreement: false },
        { factionId: 9, value: 100, tradeAgreement: true },
      ],
    };
    expect(factionDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects out-of-range, fractional, unsorted or duplicate standing and unknown fields", () => {
    const base = factionComponent.defaults();
    const entry = (factionId: number, value: number) => ({
      factionId,
      value,
      tradeAgreement: false,
    });
    expect(factionDataSchema.safeParse({ ...base, standing: [entry(2, 101)] }).success).toBe(false);
    expect(factionDataSchema.safeParse({ ...base, standing: [entry(2, 0.5)] }).success).toBe(false);
    expect(
      factionDataSchema.safeParse({ ...base, standing: [entry(5, 1), entry(3, 1)] }).success,
    ).toBe(false);
    expect(
      factionDataSchema.safeParse({ ...base, standing: [entry(3, 1), entry(3, 2)] }).success,
    ).toBe(false);
    expect(factionDataSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(factionDataSchema.safeParse({ ...base, leaderId: 0 }).success).toBe(false);
  });
});
