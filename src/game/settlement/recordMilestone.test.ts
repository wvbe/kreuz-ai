import { describe, expect, it } from "vitest";
import { MilestoneKind } from "../content/contentTypes";
import { recordMilestone } from "./recordMilestone";
import { createSettlementWorld } from "./testSettlementWorld";

describe("recordMilestone", () => {
  // @covers 027:FR-020 027:FR-025
  it("records a milestone once with its tick and subjects and queues the event", () => {
    const world = createSettlementWorld();
    world.engine.runTicks(5);
    expect(recordMilestone(world.engine, MilestoneKind.FirstMarket, [12])).toBe(true);
    world.engine.runTicks(1);
    expect(world.progress().milestones).toEqual([
      { milestone: "first-market", tick: 5, subjectIds: [12] },
    ]);
    expect(world.milestoneEvents).toEqual([
      { milestone: "first-market", tick: 5, subjectIds: [12] },
    ]);
  });

  it("is idempotent: a second record changes and emits nothing", () => {
    const world = createSettlementWorld();
    expect(recordMilestone(world.engine, MilestoneKind.FirstMarket, [12])).toBe(true);
    expect(recordMilestone(world.engine, MilestoneKind.FirstMarket, [13])).toBe(false);
    world.engine.runTicks(1);
    expect(world.progress().milestones).toHaveLength(1);
    expect(world.milestoneEvents).toHaveLength(1);
    expect(world.progress().milestones[0]?.subjectIds).toEqual([12]);
  });
});
