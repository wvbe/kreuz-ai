import { describe, expect, it } from "vitest";
import { BlockReason } from "../map/mapTypes";
import { requireBoard } from "./jobBoards";
import { registerJobType, jobTaskData } from "./jobExecutor";
import { claimPosting, postJob } from "./jobPostings";
import { getJobService } from "./jobServiceRegistry";
import { PostingStatus, approachFailedReason, jobTaskPriority } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";
import { createWorkAtLocationExecutor } from "./workAtLocation";

// `haul.deliver` has no built-in executor yet; skill id `hauling` (a speed bonus), so the worker's skill speeds it up.
const jobType = "haul.deliver";

function setup(targetCell: number, baseTicks = 10) {
  const world = createJobWorld();
  const completions: number[] = [];
  registerJobType(
    world.engine,
    jobType,
    createWorkAtLocationExecutor(world.engine, {
      baseTicks,
      complete: (_engine, context) => {
        completions.push(context.tick);
        return [];
      },
    }),
  );
  const worker = world.spawn("peasant", 55, noAiOverride);
  const posting = postJob(
    world.engine,
    world.boardId,
    {
      jobTypeId: jobType,
      target: { mapId: world.mapId, cellIndex: targetCell, entityId: null, materialId: null },
    },
    0,
  );
  const claimed = claimPosting(world.engine, posting.id, worker.id, 0);
  world.engine.tasks.enqueue(worker.id, {
    type: jobType,
    data: jobTaskData(claimed),
    priority: jobTaskPriority,
  });
  return { world, worker, posting: claimed, completions };
}

describe("createWorkAtLocationExecutor", () => {
  it("works in place for the base duration when the worker is already there", () => {
    const { world, completions, posting } = setup(55, 10);
    world.run(30);
    expect(completions).toHaveLength(1);
    expect(completions[0]).toBe(11);
    expect(requireBoard(world.engine, world.boardId).data.history[0]?.id).toBe(posting.id);
  });

  it("walks to the target first, then works", () => {
    const { world, worker, completions } = setup(58, 10);
    world.run(60);
    expect(completions).toHaveLength(1);
    expect((completions[0] ?? 0) > 11).toBe(true);
    expect((worker.components["Position"] as { cellIndex: number }).cellIndex).toBe(58);
  });

  it("shortens the work with the worker's skill (the duration comes from workDuration)", () => {
    const slow = setup(55, 40);
    const skilled = setup(55, 40);
    const skills = skilled.worker.components["Skills"] as { values: { [skill: string]: number } };
    skills.values["hauling"] = 100_000;
    slow.world.run(60);
    skilled.world.run(60);
    expect((skilled.completions[0] ?? 99) < (slow.completions[0] ?? 0)).toBe(true);
  });

  it("releases the claim with a back-off when the target cannot be reached", () => {
    const { world, worker, posting, completions } = setup(58, 10);
    world.engine.maps.require(world.mapId).setObstruction(58, BlockReason.Wall);
    world.run(5);
    expect(completions).toEqual([]);
    expect(requireBoard(world.engine, world.boardId).data.postings[0]?.status).toBe(
      PostingStatus.Open,
    );
    expect(
      getJobService(world.engine).isBackedOff(worker.id, posting.id, world.engine.time.tickCount),
    ).toBe(true);
    const failed = world.engine.tasks.getQueue(worker.id)?.history.at(-1);
    expect(failed?.reason).toBe(approachFailedReason);
  });
});
