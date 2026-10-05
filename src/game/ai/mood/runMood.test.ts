import { describe, expect, it } from "vitest";
import type { Entity } from "../../ecs/Entity";
import { createAiWorld } from "../testAiWorld";
import { adjustNeed } from "../needs/needAccess";
import { addMoodInfluenceTo, updateMood } from "./runMood";

type MoodView = { valueMilli: number; influences: { source: string; deltaMilli: number }[] };

function moodOf(entity: Entity): MoodView {
  return entity.components["Mood"] as MoodView;
}

describe("addMoodInfluenceTo", () => {
  it("adds an influence to an entity with Mood", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    addMoodInfluenceTo(farmer, "test", 4000, 50, 1);
    expect(moodOf(farmer).influences).toEqual([
      { source: "test", deltaMilli: 4000, untilTick: 50 },
    ]);
  });

  it("ignores entities without Mood", () => {
    const world = createAiWorld();
    const board = world.engine.store.spawn("job_board");
    expect(() => addMoodInfluenceTo(board, "test", 1, 5, 1)).not.toThrow();
  });
});

describe("updateMood", () => {
  it("moves mood towards the mean need level", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    updateMood(world.engine, farmer, 1);
    // gap 30000 (80000 - 50000) * 5% = 1500
    expect(moodOf(farmer).valueMilli).toBe(51_500);
  });

  it("is pulled down by unmet needs and by negative influences", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    for (const need of ["hunger", "rest", "safety", "social", "comfort", "faith"]) {
      adjustNeed(farmer, need, -60_000);
    }
    updateMood(world.engine, farmer, 1);
    expect(moodOf(farmer).valueMilli).toBe(48_500);
    addMoodInfluenceTo(farmer, "bad", -20_000, 100, 1);
    updateMood(world.engine, farmer, 2);
    expect(moodOf(farmer).valueMilli).toBeLessThan(48_500);
  });

  it("drops influences after their last tick", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    addMoodInfluenceTo(farmer, "short", 5000, 3, 1);
    updateMood(world.engine, farmer, 3);
    expect(moodOf(farmer).influences).toHaveLength(1);
    updateMood(world.engine, farmer, 4);
    expect(moodOf(farmer).influences).toEqual([]);
  });

  it("ignores entities without Mood and treats missing Needs as neutral", () => {
    const world = createAiWorld();
    const board = world.engine.store.spawn("job_board");
    expect(() => updateMood(world.engine, board, 1)).not.toThrow();
    const farmer = world.spawn("farmer", 0);
    delete farmer.components["Needs"];
    updateMood(world.engine, farmer, 1);
    expect(moodOf(farmer).valueMilli).toBe(50_000);
  });
});
