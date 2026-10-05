import { describe, expect, it } from "vitest";
import { adjustNeed } from "../needs/needAccess";
import { createAiWorld } from "../testAiWorld";
import { isDueForDecision, runAiDecisions } from "./runAiDecisions";

describe("isDueForDecision", () => {
  it("is true for an entity with a tree and an empty queue", () => {
    const world = createAiWorld();
    expect(isDueForDecision(world.engine, world.spawn("farmer", 0))).toBe(true);
  });

  it("is false for entities without a behavior tree or a task queue", () => {
    const world = createAiWorld();
    expect(
      isDueForDecision(world.engine, world.spawn("farmer", 0, { AiState: { treeId: null } })),
    ).toBe(false);
    expect(isDueForDecision(world.engine, world.engine.store.spawn("job_board"))).toBe(false);
  });

  it("leaves an entity alone while it has a task at need priority or above", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    world.engine.tasks.enqueue(farmer.id, { type: "ai.idle", data: { ticks: 5 }, priority: 100 });
    adjustNeed(farmer, "hunger", -65_000);
    expect(isDueForDecision(world.engine, farmer)).toBe(false);
  });

  it("lets a critical need interrupt a job-priority task but not an ordinary day", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    world.engine.tasks.enqueue(farmer.id, { type: "ai.idle", data: { ticks: 5 }, priority: 50 });
    expect(isDueForDecision(world.engine, farmer)).toBe(false);
    adjustNeed(farmer, "hunger", -65_000);
    expect(isDueForDecision(world.engine, farmer)).toBe(true);
  });

  it("wakes an idle entity only when a need is critical", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    world.engine.tasks.enqueue(farmer.id, { type: "ai.idle", data: { ticks: 5 }, priority: 10 });
    expect(isDueForDecision(world.engine, farmer)).toBe(false);
    adjustNeed(farmer, "hunger", -65_000);
    expect(isDueForDecision(world.engine, farmer)).toBe(true);
  });
});

describe("runAiDecisions", () => {
  it("decides for due entities in ascending id order and enqueues tasks", () => {
    const world = createAiWorld();
    const first = world.spawn("farmer", 0);
    world.spawn("farmer", 1, { AiState: { treeId: null } });
    const third = world.spawn("peasant", 2);
    const decided = runAiDecisions(world.engine, 1);
    expect(decided).toEqual([first.id, third.id]);
    expect(world.engine.tasks.getQueue(first.id)?.tasks).toHaveLength(1);
    expect(world.engine.tasks.getQueue(third.id)?.tasks).toHaveLength(1);
    expect(runAiDecisions(world.engine, 2)).toEqual([]);
  });

  it("redirects a wandering settler to a critical need within a tick (SC-005)", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 44);
    world.run(3);
    expect(world.engine.tasks.getQueue(farmer.id)?.tasks.length).toBeGreaterThan(0);
    adjustNeed(world.engine.store.require(farmer.id), "hunger", -80_000);
    world.run(1);
    const history = world.engine.tasks.getQueue(farmer.id)?.history ?? [];
    expect(
      history.some((entry) => entry.type === "ai.satisfy" && entry.outcome === "Completed"),
    ).toBe(true);
    const hunger = (
      world.engine.store.require(farmer.id).components["Needs"] as {
        values: { needId: string; valueMilli: number }[];
      }
    ).values.find((value) => value.needId === "hunger");
    expect(hunger?.valueMilli).toBeGreaterThan(20_000);
  });
});
