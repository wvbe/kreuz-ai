import { describe, expect, it } from "vitest";
import { BlockedReasonKind } from "../../../game/status/statusTypes";
import {
  blockedReasonKinds,
  blockedReasonTitle,
  describeBlockedReason,
  humanizeId,
} from "./blockedReasonText";

describe("blockedReasonText", () => {
  it("lists exactly the engine's reason kinds in order", () => {
    expect([...blockedReasonKinds]).toEqual(Object.values(BlockedReasonKind));
  });

  it("writes a sentence for every kind", () => {
    for (const kind of blockedReasonKinds) {
      const text = describeBlockedReason({ kind, params: {}, causeRef: null });
      expect(text.length).toBeGreaterThan(5);
      expect(text.endsWith(".")).toBe(true);
    }
  });

  it("uses params and falls back for unknown kinds", () => {
    expect(
      describeBlockedReason({
        kind: "MissingInput",
        params: { materialId: "iron_ore" },
        causeRef: null,
      }),
    ).toBe("Missing iron ore.");
    expect(describeBlockedReason({ kind: "BrandNewKind", params: {}, causeRef: null })).toBe(
      "Brand new kind.",
    );
    expect(blockedReasonTitle("NoQualifiedWorker")).toBe("No qualified worker");
    expect(humanizeId("a-b_c")).toBe("a b c");
  });
});
