import { describe, expect, it } from "vitest";
import type { Entity } from "../ecs/Entity";
import type { TaskRecord } from "../task/taskTypes";
import { TaskStatus } from "../task/taskTypes";
import { buildNeedsView, describeCurrentAction } from "./aiViews";
import { adjustNeed } from "./needs/needAccess";
import { createAiWorld } from "./testAiWorld";

function task(
  id: number,
  type: string,
  priority: number,
  data: TaskRecord["data"],
  extra: Partial<TaskRecord> = {},
): TaskRecord {
  return {
    id,
    type,
    priority,
    status: TaskStatus.Running,
    phase: "go",
    data,
    parentId: null,
    waitFor: null,
    wake: null,
    createdTick: 0,
    token: null,
    ...extra,
  };
}

function withTasks(tasks: TaskRecord[]): Entity {
  return { id: 1, prototype: "farmer", components: { TaskQueue: { tasks, history: [] } } };
}

describe("describeCurrentAction", () => {
  it("is idle without tasks or a queue", () => {
    expect(describeCurrentAction(withTasks([]))).toBe("idle");
    expect(describeCurrentAction({ id: 1, prototype: "x", components: {} })).toBe("idle");
  });

  it("describes the highest-priority top-level task", () => {
    expect(
      describeCurrentAction(
        withTasks([
          task(1, "move", 10, { mapId: 1, target: 77 }),
          task(2, "ai.idle", 5, { ticks: 4 }),
        ]),
      ),
    ).toBe("move to cell 77");
    expect(describeCurrentAction(withTasks([task(1, "ai.idle", 10, { ticks: 4 })]))).toBe(
      "stand around",
    );
  });

  it("describes satisfy tasks by plan and ignores child tasks", () => {
    const eat = task(2, "ai.satisfy", 100, {
      plan: { kind: "consume", materialId: "bread", needId: "hunger" },
    });
    const sleep = task(3, "ai.satisfy", 100, { plan: { kind: "sleep", needId: "rest" } });
    const child = task(4, "move", 100, { target: 5 }, { parentId: 2 });
    expect(describeCurrentAction(withTasks([task(1, "move", 10, { target: 9 }), eat, child]))).toBe(
      "consume bread for hunger (go)",
    );
    expect(describeCurrentAction(withTasks([sleep]))).toBe("sleep for rest (go)");
  });

  it("falls back to type and phase for other tasks and tolerates odd data", () => {
    expect(describeCurrentAction(withTasks([task(1, "craft.produce", 5, null)]))).toBe(
      "craft.produce (go)",
    );
    expect(describeCurrentAction(withTasks([task(1, "move", 5, null)]))).toBe("move to cell ?");
    expect(describeCurrentAction(withTasks([task(1, "ai.satisfy", 5, {})]))).toBe(
      "consume ? for ? (go)",
    );
  });
});

describe("buildNeedsView", () => {
  it("summarises needs, mood, health, role, wealth and the current action", () => {
    const world = createAiWorld();
    const baker = world.spawn("baker", 0);
    adjustNeed(baker, "hunger", -65_000);
    const view = buildNeedsView(world.engine, baker);
    expect(view?.entityId).toBe(baker.id);
    expect(view?.needs.find((need) => need.needId === "hunger")).toEqual({
      needId: "hunger",
      name: "Hunger",
      valueMilli: 15_000,
      percent: 15,
      critical: true,
    });
    expect(view?.needs.find((need) => need.needId === "rest")?.critical).toBe(false);
    expect(view?.moodMilli).toBe(50_000);
    expect(view?.riskSuccessPermille).toBe(500);
    expect(view?.healthMilli).toBe(100_000);
    expect(view?.role).toBe("worker");
    expect(view?.priorityOrder[0]).toBe("hunger");
    expect(view?.coins).toBe(20);
    expect(view?.wealth).toBe("poor");
    expect(view?.action).toBe("idle");
  });

  it("is null for entities without Needs and tolerates a missing Mood or Health", () => {
    const world = createAiWorld();
    expect(buildNeedsView(world.engine, world.engine.store.spawn("job_board"))).toBeNull();
    const farmer = world.spawn("farmer", 0);
    delete farmer.components["Mood"];
    delete farmer.components["Health"];
    const view = buildNeedsView(world.engine, farmer);
    expect(view?.moodMilli).toBe(50_000);
    expect(view?.healthMilli).toBe(0);
  });
});
