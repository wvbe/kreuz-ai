import { describe, expect, it } from "vitest";
import { storeUpTo } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import {
  fellLowWoodStock,
  fellMaxActivePostings,
  fellPosterIntervalTicks,
  fellTreesJobId,
  postFellJobs,
  registerFellTrees,
  woodStock,
} from "./fellTrees";
import { requireBoard } from "./jobBoards";
import { claimPosting } from "./jobPostings";
import { jobTaskData } from "./jobExecutor";
import { PostingStatus, jobTaskPriority } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";

describe("woodStock", () => {
  it("adds the logs of every inventory in the world", () => {
    const world = createJobWorld();
    const first = world.spawn("peasant", 5, noAiOverride);
    const second = world.spawn("peasant", 6, noAiOverride);
    expect(woodStock(world.engine)).toBe(0);
    const context = { materials: world.engine.materials, actor: null };
    storeUpTo(context, first, "oak_log", 4);
    storeUpTo(context, second, "oak_log", 3);
    expect(woodStock(world.engine)).toBe(7);
  });
});

describe("postFellJobs", () => {
  function forestWorld() {
    const world = createJobWorld({ boardCell: 0 });
    const map = world.engine.maps.require(world.mapId);
    for (const cell of [11, 12, 13, 14, 15, 16, 17]) {
      map.setTerrain(cell, "forest_oak");
    }
    return world;
  }

  it("posts the nearest forest cells up to the active limit, only on the interval", () => {
    const world = forestWorld();
    expect(postFellJobs(world.engine, 1)).toEqual([]);
    const created = postFellJobs(world.engine, fellPosterIntervalTicks);
    expect(created).toHaveLength(fellMaxActivePostings);
    const cells = requireBoard(world.engine, world.boardId).data.postings.map(
      (posting) => posting.target.cellIndex,
    );
    expect(cells).toEqual([11, 12, 13, 14]);
    expect(postFellJobs(world.engine, 2 * fellPosterIntervalTicks)).toEqual([]);
  });

  it("never posts the same cell twice and continues with the next ones", () => {
    const world = forestWorld();
    postFellJobs(world.engine, 0);
    const first = requireBoard(world.engine, world.boardId).data.postings[0];
    expect(first).toBeDefined();
    const worker = world.spawn("peasant", 5, noAiOverride);
    if (first !== undefined) {
      claimPosting(world.engine, first.id, worker.id, 0);
      world.engine.maps.require(world.mapId).setTerrain(first.target.cellIndex, "grassland");
    }
    requireBoard(world.engine, world.boardId).data.postings.splice(0, 1);
    const created = postFellJobs(world.engine, fellPosterIntervalTicks);
    expect(created).toHaveLength(1);
    const cells = requireBoard(world.engine, world.boardId).data.postings.map(
      (posting) => posting.target.cellIndex,
    );
    expect(cells).toEqual([12, 13, 14, 15]);
  });

  it("stops while the wood stock is high or the board is paused", () => {
    const world = forestWorld();
    const holder = world.spawn("peasant", 5, noAiOverride);
    storeUpTo(
      { materials: world.engine.materials, actor: null },
      holder,
      "oak_log",
      fellLowWoodStock,
    );
    expect(getTotal(holder, "oak_log")).toBe(fellLowWoodStock);
    expect(postFellJobs(world.engine, 0)).toEqual([]);
    const inventory = holder.components["Inventory"] as { slots: { materialId: string }[] };
    inventory.slots = [];
    requireBoard(world.engine, world.boardId).data.pausedByPlayer = true;
    expect(postFellJobs(world.engine, 0)).toEqual([]);
    requireBoard(world.engine, world.boardId).data.pausedByPlayer = false;
    expect(postFellJobs(world.engine, 0)).toHaveLength(fellMaxActivePostings);
  });

  it("posts nothing without forest in reach", () => {
    const world = createJobWorld();
    expect(postFellJobs(world.engine, 0)).toEqual([]);
  });
});

describe("registerFellTrees", () => {
  it("registers the task type of the job", () => {
    const world = createJobWorld();
    expect(world.engine.taskHandlers.has(fellTreesJobId)).toBe(true);
    expect(() => registerFellTrees(world.engine)).toThrow();
  });

  it("clears the cell and gives the worker the logs when the work is done", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(6);
    const claimed = claimPosting(world.engine, posting.id, worker.id, 0);
    world.engine.tasks.enqueue(worker.id, {
      type: fellTreesJobId,
      data: jobTaskData(claimed),
      priority: jobTaskPriority,
    });
    world.run(40);
    expect(world.engine.maps.require(world.mapId).terrainAt(6)).toBe("grassland");
    expect(getTotal(worker, "oak_log")).toBe(3);
    expect(requireBoard(world.engine, world.boardId).data.history[0]?.status).toBe(
      PostingStatus.Done,
    );
  });

  it("fails the posting when the cell is no longer forest", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(6);
    const claimed = claimPosting(world.engine, posting.id, worker.id, 0);
    world.engine.tasks.enqueue(worker.id, {
      type: fellTreesJobId,
      data: jobTaskData(claimed),
      priority: jobTaskPriority,
    });
    world.run(3);
    world.engine.maps.require(world.mapId).setTerrain(6, "grassland");
    world.run(40);
    expect(requireBoard(world.engine, world.boardId).data.history[0]).toMatchObject({
      status: PostingStatus.Failed,
      reason: "target_invalid",
    });
    expect(getTotal(worker, "oak_log")).toBe(0);
  });
});
