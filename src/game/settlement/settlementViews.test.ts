import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { MilestoneKind } from "../content/contentTypes";
import { GameEngine } from "../engine/GameEngine";
import { recordMilestone } from "./recordMilestone";
import { buildMilestoneViews, buildSettlementProgressView } from "./settlementViews";
import { createSettlementWorld } from "./testSettlementWorld";

describe("buildSettlementProgressView", () => {
  it("is null without a game", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(buildSettlementProgressView(engine)).toBeNull();
  });

  // @covers 027:FR-001 027:FR-006
  it("shows the tier, its noun, the next tier's checklist and the counters", () => {
    const world = createSettlementWorld();
    world.addSettlers(6);
    const view = buildSettlementProgressView(world.engine);
    expect(view).toMatchObject({
      tier: "hamlet",
      settlementNoun: "hamlet",
      tierReachedAtTick: { hamlet: 0 },
      nextTier: "village",
      nextSettlementNoun: "village",
      milestones: [],
      evaluations: 0,
      lastEvaluationTick: null,
    });
    expect(view?.requirements.map((entry) => [entry.kind, entry.current, entry.target])).toEqual([
      ["population", 6, 8],
      ["dwellings_at_level", 0, 4],
      ["active_zone", 0, 1],
    ]);
  });
});

describe("buildMilestoneViews", () => {
  // @covers 027:FR-019
  it("lists all seven milestones and marks the reached ones", () => {
    const world = createSettlementWorld();
    expect(buildMilestoneViews(world.engine)).toHaveLength(7);
    recordMilestone(world.engine, MilestoneKind.FirstMarket, [4]);
    const rows = buildMilestoneViews(world.engine);
    expect(rows.filter((row) => row.reached)).toEqual([
      { milestone: "first-market", reached: true, tick: 0, subjectIds: [4] },
    ]);
    expect(rows[0]).toEqual({
      milestone: "throne-room-established",
      reached: false,
      tick: null,
      subjectIds: [],
    });
  });

  it("shows every milestone unreached without a game", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(buildMilestoneViews(engine).every((row) => !row.reached)).toBe(true);
  });
});
