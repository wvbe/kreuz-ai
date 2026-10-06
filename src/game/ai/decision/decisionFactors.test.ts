import { describe, expect, it } from "vitest";
import { WealthClass } from "./decisionContext";
import type { DecisionContext, DecisionNeed } from "./decisionContext";
import {
  defaultDecisionFactors,
  emergencyFactor,
  emergencyScore,
  maxUrgencyScore,
  needBaseScore,
  priorityStepScore,
  urgencyFactor,
  wealthLuxuryFactor,
  wealthLuxuryScore,
} from "./decisionFactors";

function need(needId: string, valueMilli: number, rank: number): DecisionNeed {
  return { needId, valueMilli, criticalMilli: 20_000, critical: valueMilli <= 20_000, rank };
}

function context(needs: DecisionNeed[], wealth = WealthClass.Modest): DecisionContext {
  return {
    entityId: 1,
    tick: 1,
    needs,
    needCount: 6,
    moodMilli: 50_000,
    riskSuccessPermille: 500,
    relationships: { count: 0, meanAffinityMilli: 0 },
    coins: 0,
    wealth,
  };
}

// @covers 013:FR-010 013:FR-011 013:FR-014 013:SC-003 013:SC-011
describe("needBaseScore", () => {
  it("falls by one step per rank", () => {
    const subject = context([need("hunger", 10_000, 0), need("rest", 10_000, 1)]);
    expect(needBaseScore(subject, "hunger")).toBe(6 * priorityStepScore);
    expect(needBaseScore(subject, "rest")).toBe(5 * priorityStepScore);
    expect(needBaseScore(subject, "missing")).toBe(0);
  });
});

describe("urgencyFactor", () => {
  it("grows from 0 at the threshold to 999 at an empty need", () => {
    const subject = context([
      need("hunger", 20_000, 0),
      need("rest", 10_000, 1),
      need("faith", 0, 2),
    ]);
    const score = (needId: string): number =>
      urgencyFactor.score(subject, { id: needId, needId, base: 0 });
    expect(score("hunger")).toBe(0);
    expect(score("rest")).toBe(499);
    expect(score("faith")).toBe(maxUrgencyScore);
    expect(score("unknown")).toBe(0);
  });

  it("is 0 for candidates without a need", () => {
    expect(urgencyFactor.score(context([]), { id: "x", needId: null, base: 0 })).toBe(0);
  });
});

describe("emergencyFactor", () => {
  it("adds a large bonus for a need that is exactly zero", () => {
    const subject = context([need("hunger", 0, 0), need("rest", 1, 1)]);
    expect(emergencyFactor.score(subject, { id: "hunger", needId: "hunger", base: 0 })).toBe(
      emergencyScore,
    );
    expect(emergencyFactor.score(subject, { id: "rest", needId: "rest", base: 0 })).toBe(0);
  });
});

describe("wealthLuxuryFactor", () => {
  it("shifts luxury needs up for the wealthy and down for the poor", () => {
    const candidate = { id: "comfort", needId: "comfort", base: 0 };
    const base = [need("comfort", 10_000, 4)];
    expect(wealthLuxuryFactor.score(context(base, WealthClass.Wealthy), candidate)).toBe(
      wealthLuxuryScore,
    );
    expect(wealthLuxuryFactor.score(context(base, WealthClass.Poor), candidate)).toBe(
      -wealthLuxuryScore,
    );
    expect(wealthLuxuryFactor.score(context(base, WealthClass.Modest), candidate)).toBe(0);
  });

  it("does not touch basic needs or needless candidates", () => {
    const subject = context([need("hunger", 0, 0)], WealthClass.Wealthy);
    expect(wealthLuxuryFactor.score(subject, { id: "hunger", needId: "hunger", base: 0 })).toBe(0);
    expect(wealthLuxuryFactor.score(subject, { id: "x", needId: null, base: 0 })).toBe(0);
  });
});

describe("defaultDecisionFactors", () => {
  it("lists the three default factors by id", () => {
    expect(defaultDecisionFactors.map((factor) => factor.id)).toEqual([
      "urgency",
      "emergency",
      "wealth_luxury",
    ]);
  });
});
