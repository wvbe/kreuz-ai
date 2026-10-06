import { describe, expect, it } from "vitest";
import {
  settlementChronicleComponent,
  settlementChronicleSchema,
} from "./settlementChronicleComponent";

describe("settlementChronicleComponent", () => {
  it("defaults to an empty chronicle whose next moment id is 1", () => {
    expect(settlementChronicleComponent.defaults()).toEqual({
      moments: [],
      finest: [],
      nextMomentId: 1,
    });
  });

  it("accepts moments and finest-holder entries and rejects unknown fields", () => {
    const data = {
      moments: [
        {
          momentId: 1,
          tick: 10,
          kind: "tier_reached",
          prominence: "major",
          entityId: null,
          nameSnapshot: null,
          params: { tier: "village", previousTier: "hamlet" },
        },
      ],
      finest: [{ skillId: "baking", entityId: 8, level: 40, sinceTick: 5, lastAnnouncedTick: 5 }],
      nextMomentId: 2,
    };
    expect(settlementChronicleSchema.safeParse(data).success).toBe(true);
    expect(settlementChronicleSchema.safeParse({ ...data, extra: true }).success).toBe(false);
    expect(settlementChronicleSchema.safeParse({ ...data, nextMomentId: 0 }).success).toBe(false);
  });
});
