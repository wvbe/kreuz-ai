import { describe, expect, it } from "vitest";
import { describeActivity, describeReason, humanizeId, isEntitySubject } from "./reasonText";

describe("reasonText", () => {
  it("humanizes ids", () => {
    expect(humanizeId("oak_plank")).toBe("oak plank");
    expect(humanizeId("fell.trees")).toBe("fell trees");
  });

  it("writes the missing input sentence", () => {
    expect(
      describeReason({
        kind: "MissingInput",
        params: { materialId: "flour", required: 1, available: 0, noProducer: true },
      }),
    ).toBe("Missing input: flour (needs 1, has 0; nothing produces it)");
  });

  it("falls back to words for an unknown kind and drops false params", () => {
    expect(describeReason({ kind: "SomethingNew", params: { zoneId: 4, flag: false } })).toBe(
      "Something new (zoneId 4)",
    );
    expect(describeReason({ kind: "Paused", params: {} })).toBe("Paused by the player");
  });

  it("describes activities and tells entity subjects from orders", () => {
    expect(describeActivity({ kind: "Working", params: { jobTypeId: "fell.trees" } })).toBe(
      "Working (jobTypeId fell trees)",
    );
    expect(isEntitySubject({ kind: "Workstation", id: 3 })).toBe(true);
    expect(isEntitySubject({ kind: "ProductionOrder", id: 1 })).toBe(false);
  });
});
