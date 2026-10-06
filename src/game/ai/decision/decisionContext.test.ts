import { describe, expect, it } from "vitest";
import { adjustNeed } from "../needs/needAccess";
import { createAiWorld } from "../testAiWorld";
import { buildDecisionContext, WealthClass, wealthClassOf } from "./decisionContext";

// @covers 013:FR-009 013:FR-010 013:FR-011 013:SC-003
describe("wealthClassOf", () => {
  it("classifies by the thresholds of the content constants (poor < 50, wealthy > 500)", () => {
    expect(wealthClassOf(0, 50, 500)).toBe(WealthClass.Poor);
    expect(wealthClassOf(49, 50, 500)).toBe(WealthClass.Poor);
    expect(wealthClassOf(50, 50, 500)).toBe(WealthClass.Modest);
    expect(wealthClassOf(500, 50, 500)).toBe(WealthClass.Modest);
    expect(wealthClassOf(501, 50, 500)).toBe(WealthClass.Wealthy);
  });
});

describe("buildDecisionContext", () => {
  it("collects needs with rank and critical flags, mood, relationships and wealth", () => {
    const world = createAiWorld();
    const baker = world.spawn("baker", 0);
    adjustNeed(baker, "hunger", -65_000);
    const context = buildDecisionContext(world.engine.content, baker, 12);
    expect(context.entityId).toBe(baker.id);
    expect(context.tick).toBe(12);
    expect(context.needCount).toBe(6);
    expect(context.needs.map((need) => need.needId)).toEqual([
      "comfort",
      "faith",
      "hunger",
      "rest",
      "safety",
      "social",
    ]);
    const hunger = context.needs.find((need) => need.needId === "hunger");
    expect(hunger).toEqual({
      needId: "hunger",
      valueMilli: 15_000,
      criticalMilli: 20_000,
      critical: true,
      rank: 0,
    });
    expect(context.needs.find((need) => need.needId === "faith")?.rank).toBe(5);
    expect(context.moodMilli).toBe(50_000);
    expect(context.riskSuccessPermille).toBe(500);
    expect(context.relationships).toEqual({ count: 0, meanAffinityMilli: 0 });
    expect(context.coins).toBe(20);
    expect(context.wealth).toBe(WealthClass.Poor);
  });

  it("re-reads wealth every time", () => {
    const world = createAiWorld();
    const baker = world.spawn("baker", 0);
    const inventory = baker.components["Inventory"] as {
      slots: { materialId: string; quantity: number }[];
    };
    const coins = inventory.slots.find((slot) => slot.materialId === "silver_penny");
    if (coins) coins.quantity = 600;
    expect(buildDecisionContext(world.engine.content, baker, 1).wealth).toBe(WealthClass.Wealthy);
  });

  it("copes with entities that have no mood, inventory or needs", () => {
    const world = createAiWorld();
    const board = world.engine.store.spawn("job_board");
    const context = buildDecisionContext(world.engine.content, board, 1);
    expect(context.needs).toEqual([]);
    expect(context.moodMilli).toBe(50_000);
    expect(context.coins).toBe(0);
  });
});
