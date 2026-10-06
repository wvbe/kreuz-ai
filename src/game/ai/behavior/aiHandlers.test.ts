import { describe, expect, it } from "vitest";
import { NodeStatus } from "../../behavior/behaviorTypes";
import type { BehaviorContext } from "../../behavior/behaviorTypes";
import type { Entity } from "../../ecs/Entity";
import type { JsonValue } from "../../engine/EventBus";
import type { TaskQueueData } from "../../task/taskTypes";
import { taskQueueComponent } from "../../task/taskQueueComponent";
import { AiTaskPriority } from "../aiTypes";
import { adjustNeed } from "../needs/needAccess";
import { createAiWorld, removeItems } from "../testAiWorld";
import type { AiTestWorld } from "../testAiWorld";
import {
  anyNeedBelowCritical,
  anyNeedBelowCriticalId,
  idleWander,
  idleWanderId,
  registerAiHandlers,
  satisfyCriticalNeed,
  satisfyCriticalNeedId,
} from "./aiHandlers";

const noAi = { AiState: { treeId: null } };

function behaviorContext(world: AiTestWorld, entity: Entity): BehaviorContext {
  return {
    entityId: entity.id,
    entity,
    tick: world.engine.time.tickCount,
    params: {},
    store: world.engine.store,
    bus: world.engine.bus,
  };
}

function tasksOf(
  world: AiTestWorld,
  entity: Entity,
): { type: string; priority: number; data: JsonValue }[] {
  const queue = world.engine.tasks.getQueue(entity.id);
  return (queue?.tasks ?? []).map((task) => ({
    type: task.type,
    priority: task.priority,
    data: task.data,
  }));
}

// @covers 013:FR-003 013:FR-011 013:FR-012
describe("handler ids", () => {
  it("are the ids the v0 behavior trees name", () => {
    expect(anyNeedBelowCriticalId).toBe("any_need_below_critical");
    expect(satisfyCriticalNeedId).toBe("satisfy_critical_need");
    expect(idleWanderId).toBe("idle_wander");
  });
});

describe("registerAiHandlers", () => {
  it("registers the condition and the actions with the engine (once)", () => {
    const world = createAiWorld();
    const handlers = world.engine.behaviorHandlers;
    expect(handlers.hasCondition("any_need_below_critical")).toBe(true);
    expect(handlers.hasAction("satisfy_critical_need")).toBe(true);
    expect(handlers.hasAction("idle_wander")).toBe(true);
    expect(() => registerAiHandlers(world.engine)).toThrow();
  });
});

describe("anyNeedBelowCritical", () => {
  it("succeeds exactly while a need is at or below its threshold", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0, noAi);
    expect(anyNeedBelowCritical(world.engine, behaviorContext(world, farmer))).toBe(
      NodeStatus.Failure,
    );
    adjustNeed(farmer, "faith", -50_000);
    expect(anyNeedBelowCritical(world.engine, behaviorContext(world, farmer))).toBe(
      NodeStatus.Success,
    );
  });
});

describe("satisfyCriticalNeed", () => {
  it("enqueues an ai.satisfy task for the critical need at priority Need", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0, noAi);
    adjustNeed(farmer, "hunger", -65_000);
    const status = satisfyCriticalNeed(world.engine, behaviorContext(world, farmer));
    expect(status).toBe(NodeStatus.Success);
    const tasks = tasksOf(world, farmer);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.type).toBe("ai.satisfy");
    expect(tasks[0]?.priority).toBe(AiTaskPriority.Need);
    expect(JSON.stringify(tasks[0]?.data)).toContain('"needId":"hunger"');
  });

  it("fails and enqueues nothing without a critical need or without any plan", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0, noAi);
    expect(satisfyCriticalNeed(world.engine, behaviorContext(world, farmer))).toBe(
      NodeStatus.Failure,
    );
    removeItems(world, farmer.id, "bread");
    const empty = world.engine.store.require(farmer.id);
    adjustNeed(empty, "hunger", -65_000);
    expect(satisfyCriticalNeed(world.engine, behaviorContext(world, empty))).toBe(
      NodeStatus.Failure,
    );
    expect(tasksOf(world, empty)).toEqual([]);
  });

  it("serves the most important need first: workers hunger, guards rest before hunger", () => {
    const world = createAiWorld();
    const worker = world.spawn("farmer", 0, noAi);
    adjustNeed(worker, "hunger", -65_000);
    adjustNeed(worker, "rest", -65_000);
    satisfyCriticalNeed(world.engine, behaviorContext(world, worker));
    expect(JSON.stringify(tasksOf(world, worker)[0]?.data)).toContain('"needId":"hunger"');

    const guard = world.spawn("farmer", 1, noAi);
    guard.components["Skills"] = { values: { combat: 60_000 } };
    adjustNeed(guard, "hunger", -65_000);
    adjustNeed(guard, "rest", -65_000);
    satisfyCriticalNeed(world.engine, behaviorContext(world, guard));
    expect(JSON.stringify(tasksOf(world, guard)[0]?.data)).toContain('"needId":"rest"');
  });

  it("lets an emergency (need at zero) beat the role order and collapses into sleep", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0, noAi);
    adjustNeed(farmer, "hunger", -65_000);
    adjustNeed(farmer, "rest", -80_000);
    satisfyCriticalNeed(world.engine, behaviorContext(world, farmer));
    const task = tasksOf(world, farmer)[0];
    expect(JSON.stringify(task?.data)).toContain('"needId":"rest"');
    expect(task?.priority).toBe(AiTaskPriority.Collapse);
  });

  it("falls through to a satisfiable need when the top one has no source", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0, noAi);
    removeItems(world, farmer.id, "bread");
    const empty = world.engine.store.require(farmer.id);
    adjustNeed(empty, "hunger", -65_000);
    adjustNeed(empty, "rest", -65_000);
    expect(satisfyCriticalNeed(world.engine, behaviorContext(world, empty))).toBe(
      NodeStatus.Success,
    );
    expect(JSON.stringify(tasksOf(world, empty)[0]?.data)).toContain('"needId":"rest"');
  });
});

describe("idleWander", () => {
  it("does nothing while the entity has a task", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0, noAi);
    world.engine.tasks.enqueue(farmer.id, { type: "ai.idle", data: { ticks: 3 } });
    expect(idleWander(world.engine, behaviorContext(world, farmer))).toBe(NodeStatus.Success);
    expect(tasksOf(world, farmer)).toHaveLength(1);
  });

  it("enqueues an idle-priority stand or move task, both kinds over time", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 44, noAi);
    const types = new Set<string>();
    for (let round = 0; round < 40; round += 1) {
      const queue = farmer.components["TaskQueue"] as TaskQueueData;
      queue.tasks.length = 0;
      idleWander(world.engine, behaviorContext(world, farmer));
      const tasks = tasksOf(world, farmer);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.priority).toBe(AiTaskPriority.Idle);
      types.add(tasks[0]?.type ?? "");
    }
    expect([...types].sort()).toEqual(["ai.idle", "move"]);
  });

  it("makes the same choices for the same seed", () => {
    const run = (): string[] => {
      const world = createAiWorld({ seed: 11 });
      const farmer = world.spawn("farmer", 44, noAi);
      const out: string[] = [];
      for (let round = 0; round < 15; round += 1) {
        (farmer.components["TaskQueue"] as TaskQueueData).tasks.length = 0;
        idleWander(world.engine, behaviorContext(world, farmer));
        out.push(JSON.stringify(tasksOf(world, farmer)[0]));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("stands still when nowhere is reachable and ignores entities without a queue", () => {
    const world = createAiWorld({ width: 1, height: 1 });
    const farmer = world.spawn("farmer", 0, noAi);
    for (let round = 0; round < 10; round += 1) {
      (farmer.components["TaskQueue"] as TaskQueueData).tasks.length = 0;
      idleWander(world.engine, behaviorContext(world, farmer));
      expect(tasksOf(world, farmer)[0]?.type).toBe("ai.idle");
    }
    const board = world.engine.store.spawn("job_board");
    expect(idleWander(world.engine, behaviorContext(world, board))).toBe(NodeStatus.Success);
    expect(taskQueueComponent.name).toBe("TaskQueue");
  });
});
