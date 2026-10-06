import { describe, expect, it } from "vitest";
import { formatMilestones, formatTier, formatUnlocks } from "./formatSettlement";

const progress = {
  tier: "hamlet",
  settlementNoun: "hamlet",
  tierReachedAtTick: { hamlet: 0 },
  nextTier: "village",
  nextSettlementNoun: "village",
  requirements: [
    { met: false, current: 6, target: 8, label: "population 6/8" },
    { met: true, current: 1, target: 1, label: "active throne_room zone 1/1" },
  ],
  milestones: [{ milestone: "throne-room-established" }],
  evaluations: 14,
  lastEvaluationTick: 4032,
};

describe("formatTier", () => {
  it("shows the tier, the checklist of the next tier and the counters", () => {
    expect(formatTier(progress)).toEqual([
      "tier: hamlet (a hamlet); reached: hamlet at tick 0",
      "next tier: village (a village) needs:",
      "  [ ] population 6/8",
      "  [x] active throne_room zone 1/1",
      "evaluated 14 time(s), last at tick 4032; milestones reached: 1",
    ]);
  });

  it("says so at the highest tier and shows a dash before the first evaluation", () => {
    const lines = formatTier({
      ...progress,
      tier: "chartered_town",
      tierReachedAtTick: { hamlet: 0, village: 288 },
      nextTier: null,
      nextSettlementNoun: null,
      requirements: [],
      lastEvaluationTick: null,
    });
    expect(lines[0]).toBe(
      "tier: chartered_town (a hamlet); reached: hamlet at tick 0, village at tick 288",
    );
    expect(lines[1]).toBe("this is the highest tier");
    expect(lines[2]).toContain("last at tick -");
  });

  it("returns nothing for a foreign view", () => {
    expect(formatTier(null)).toEqual([]);
    expect(formatTier({ tier: 3 })).toEqual([]);
  });
});

describe("formatUnlocks", () => {
  it("marks locked entries with the lock text and unlocked ones plainly", () => {
    const rows = [
      {
        contentKind: "furniture",
        contentId: "oven",
        name: "Oven",
        unlockTier: "village",
        unlocked: false,
        lockText: "Unlocks at Village",
      },
      {
        contentKind: "zone_type",
        contentId: "stockpile",
        name: "Stockpile",
        unlockTier: "hamlet",
        unlocked: true,
        lockText: null,
      },
    ];
    expect(formatUnlocks(rows)).toEqual([
      "LOCKED   furniture oven (Oven) needs village: Unlocks at Village",
      "unlocked zone_type stockpile (Stockpile) needs hamlet",
    ]);
  });

  it("notes an empty list and ignores a foreign view", () => {
    expect(formatUnlocks([])).toEqual(["nothing matches"]);
    expect(formatUnlocks("no")).toEqual([]);
  });
});

describe("formatMilestones", () => {
  it("shows the tick and subjects of reached milestones and not yet for the rest", () => {
    expect(
      formatMilestones([
        { milestone: "throne-room-established", reached: true, tick: 3268, subjectIds: [63] },
        { milestone: "first-market", reached: false, tick: null, subjectIds: [] },
        { milestone: "first-trade-agreement", reached: true, tick: 5, subjectIds: [] },
      ]),
    ).toEqual([
      "throne-room-established: reached at tick 3268 (#63)",
      "first-market: not yet",
      "first-trade-agreement: reached at tick 5",
    ]);
  });

  it("ignores a foreign view", () => {
    expect(formatMilestones({})).toEqual([]);
  });
});
