import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { PostingStatus } from "../jobs/jobTypes";
import type { JobPosting } from "../jobs/jobTypes";
import { noAiOverride } from "../jobs/testJobWorld";
import { TaskStatus } from "../task/taskTypes";
import type { TaskContext } from "../task/taskTypes";
import { storeGatheredOutputs } from "./storeGatheredOutputs";
import { createGatheringWorld } from "./testGatheringWorld";

function taskContextOf(engine: GameEngine, entity: Entity): TaskContext {
  return {
    entityId: entity.id,
    entity,
    tick: engine.time.tickCount,
    task: {
      id: 1,
      type: "farm.harvest",
      priority: 50,
      status: TaskStatus.Running,
      phase: "work",
      data: null,
      parentId: null,
      waitFor: null,
      wake: null,
      createdTick: 0,
      token: null,
    },
    store: engine.store,
    bus: engine.bus,
    spawnChild: () => 0,
  };
}

function postingOf(): JobPosting {
  return {
    id: 1,
    boardId: 2,
    jobTypeId: "farm.harvest",
    target: { mapId: 1, cellIndex: 1, entityId: null, materialId: null },
    priority: 50,
    urgent: false,
    wage: 0,
    posterFactionId: null,
    eligibility: [],
    status: PostingStatus.Claimed,
    claimId: 1,
    claimantId: null,
    createdTick: 0,
    claimedTick: 0,
    finishedTick: null,
    reason: null,
  };
}

describe("storeGatheredOutputs", () => {
  it("stores the amounts without a bonus for an unskilled worker", () => {
    const world = createGatheringWorld();
    const worker = world.spawn("peasant", 5, {
      ...noAiOverride,
      Skills: { values: { farming: 0 } },
    });
    const jobType = world.engine.content.jobs.require("farm.harvest");
    const stored = storeGatheredOutputs(
      world.engine,
      taskContextOf(world.engine, worker),
      { posting: postingOf(), jobType },
      [{ materialId: "wheat", quantity: 4 }],
    );
    expect(stored).toEqual([{ materialId: "wheat", quantity: 4 }]);
    expect(getTotal(worker, "wheat")).toBe(4);
  });

  it("adds the farming output bonus of a master to the first amount", () => {
    const world = createGatheringWorld();
    const worker = world.spawn("peasant", 5, {
      ...noAiOverride,
      Skills: { values: { farming: 100_000 } },
    });
    const jobType = world.engine.content.jobs.require("farm.harvest");
    const stored = storeGatheredOutputs(
      world.engine,
      taskContextOf(world.engine, worker),
      { posting: postingOf(), jobType },
      [{ materialId: "wheat", quantity: 4 }],
    );
    expect(stored[0]?.quantity).toBeGreaterThan(4);
  });

  it("stores what fits and leaves out amounts that do not fit", () => {
    const world = createGatheringWorld();
    const worker = world.spawn("peasant", 5, { ...noAiOverride, Inventory: { slotCount: 1 } });
    world.give(worker, "bread", 1);
    const jobType = world.engine.content.jobs.require("farm.harvest");
    const stored = storeGatheredOutputs(
      world.engine,
      taskContextOf(world.engine, worker),
      { posting: postingOf(), jobType },
      [{ materialId: "wheat", quantity: 4 }],
    );
    expect(stored).toEqual([]);
  });
});
