import { describe, expect, it } from "vitest";
import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext } from "../behavior/behaviorTypes";
import type { Entity } from "../ecs/Entity";
import {
  claimJob,
  claimJobId,
  jobsAvailable,
  jobsAvailableId,
  registerJobHandlers,
} from "./jobBehavior";
import { requireBoard } from "./jobBoards";
import { visitTaskType } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";
import type { JobTestWorld } from "./testJobWorld";

function behaviorContext(world: JobTestWorld, entity: Entity): BehaviorContext {
  return {
    entityId: entity.id,
    entity,
    tick: world.engine.time.tickCount,
    params: {},
    store: world.engine.store,
    bus: world.engine.bus,
  };
}

// @covers 017:FR-002
describe("handler ids", () => {
  it("are the ids the basic_needs tree names", () => {
    expect(jobsAvailableId).toBe("jobs_available");
    expect(claimJobId).toBe("claim_job");
    const world = createJobWorld();
    expect(world.engine.behaviorHandlers.hasCondition(jobsAvailableId)).toBe(true);
    expect(world.engine.behaviorHandlers.hasAction(claimJobId)).toBe(true);
    expect(() => registerJobHandlers(world.engine)).toThrow();
  });
});

describe("jobsAvailable", () => {
  it("is true only while a running board has an open posting with an executor", () => {
    const world = createJobWorld();
    expect(jobsAvailable(world.engine)).toBe(NodeStatus.Failure);
    world.postFell(15);
    expect(jobsAvailable(world.engine)).toBe(NodeStatus.Success);
    requireBoard(world.engine, world.boardId).data.pausedByPlayer = true;
    expect(jobsAvailable(world.engine)).toBe(NodeStatus.Failure);
  });
});

describe("claimJob", () => {
  it("enqueues a board visit at job priority for an idle worker", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 55, noAiOverride);
    world.postFell(15);
    expect(claimJob(world.engine, behaviorContext(world, worker))).toBe(NodeStatus.Success);
    const tasks = world.engine.tasks.getQueue(worker.id)?.tasks ?? [];
    expect(tasks.map((task) => [task.type, task.priority])).toEqual([[visitTaskType, 50]]);
  });

  it("fails when nothing can be claimed or the worker already has a job-level task", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 55, noAiOverride);
    expect(claimJob(world.engine, behaviorContext(world, worker))).toBe(NodeStatus.Failure);
    world.postFell(15);
    expect(claimJob(world.engine, behaviorContext(world, worker))).toBe(NodeStatus.Success);
    expect(claimJob(world.engine, behaviorContext(world, worker))).toBe(NodeStatus.Failure);
    const board = world.engine.store.require(world.boardId);
    expect(claimJob(world.engine, behaviorContext(world, board))).toBe(NodeStatus.Failure);
  });
});
