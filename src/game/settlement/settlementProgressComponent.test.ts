import { describe, expect, it } from "vitest";
import { MilestoneKind, SettlementTier } from "../content/contentTypes";
import {
  settlementProgressComponent,
  settlementProgressSchema,
} from "./settlementProgressComponent";

describe("settlementProgressComponent", () => {
  // @covers 027:FR-002
  it("defaults to a Hamlet reached at tick 0 without milestones", () => {
    expect(settlementProgressComponent.defaults()).toEqual({
      tier: "hamlet",
      tierReachedAtTick: { hamlet: 0 },
      milestones: [],
      evaluations: 0,
      lastEvaluationTick: null,
    });
  });

  it("accepts a progressed record", () => {
    const data = {
      tier: SettlementTier.Village,
      tierReachedAtTick: { hamlet: 0, village: 864 },
      milestones: [{ milestone: MilestoneKind.FirstMarket, tick: 500, subjectIds: [9] }],
      evaluations: 3,
      lastEvaluationTick: 864,
    };
    expect(settlementProgressSchema.safeParse(data).success).toBe(true);
  });

  it("rejects unknown tiers, a current tier without a reach tick and repeated milestones", () => {
    const base = settlementProgressComponent.defaults();
    expect(
      settlementProgressSchema.safeParse({ ...base, tierReachedAtTick: { hamlet: 0, city: 5 } })
        .success,
    ).toBe(false);
    expect(settlementProgressSchema.safeParse({ ...base, tier: "village" }).success).toBe(false);
    const twice = { milestone: MilestoneKind.FirstMarket, tick: 1, subjectIds: [] };
    expect(
      settlementProgressSchema.safeParse({ ...base, milestones: [twice, twice] }).success,
    ).toBe(false);
    expect(settlementProgressSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
