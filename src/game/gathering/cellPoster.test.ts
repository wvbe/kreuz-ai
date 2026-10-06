import { describe, expect, it } from "vitest";
import { pauseBoard } from "../jobs/boardPause";
import { activePostingsOfType } from "../jobs/jobBoards";
import { claimPosting } from "../jobs/jobPostings";
import { PauseSource } from "../jobs/jobTypes";
import { noAiOverride } from "../jobs/testJobWorld";
import { postCellJobs } from "./cellPoster";
import { gatheringMaxActivePostings, gatheringPosterIntervalTicks } from "./gatheringTypes";
import { createGatheringWorld } from "./testGatheringWorld";

const jobTypeId = "mine.ore";

function oreWorld() {
  const world = createGatheringWorld();
  for (const cell of [11, 12, 13, 14, 15, 16, 17]) {
    world.terrain(cell, "iron_ore_deposit");
  }
  return world;
}

const isOre = (map: { terrainAt: (cell: number) => string }, cell: number): boolean =>
  map.terrainAt(cell) === "iron_ore_deposit";

describe("postCellJobs", () => {
  it("posts the nearest candidates, only on the interval and up to the active limit", () => {
    const world = oreWorld();
    expect(postCellJobs(world.engine, 1, { jobTypeId, isCandidate: isOre })).toEqual([]);
    const created = postCellJobs(world.engine, gatheringPosterIntervalTicks, {
      jobTypeId,
      isCandidate: isOre,
    });
    expect(created).toHaveLength(gatheringMaxActivePostings);
    expect(
      activePostingsOfType(world.engine, jobTypeId).map((posting) => posting.target.cellIndex),
    ).toEqual([11, 12, 13, 14]);
    expect(
      postCellJobs(world.engine, 2 * gatheringPosterIntervalTicks, {
        jobTypeId,
        isCandidate: isOre,
      }),
    ).toEqual([]);
  });

  it("honours maxActive and never posts a cell twice", () => {
    const world = oreWorld();
    const options = { jobTypeId, isCandidate: isOre, maxActive: 2 };
    expect(postCellJobs(world.engine, 12, options)).toHaveLength(2);
    expect(postCellJobs(world.engine, 24, options)).toEqual([]);
    const first = activePostingsOfType(world.engine, jobTypeId)[0];
    const worker = world.spawn("peasant", 5, noAiOverride);
    if (first !== undefined) {
      claimPosting(world.engine, first.id, worker.id, 24);
    }
    expect(postCellJobs(world.engine, 36, { ...options, maxActive: 3 })).toHaveLength(1);
    const cells = activePostingsOfType(world.engine, jobTypeId).map(
      (posting) => posting.target.cellIndex,
    );
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).toEqual([11, 12, 13]);
  });

  it("posts nothing on a paused board or when no cell qualifies", () => {
    const world = oreWorld();
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    expect(postCellJobs(world.engine, 12, { jobTypeId, isCandidate: isOre })).toEqual([]);
    const empty = createGatheringWorld();
    expect(postCellJobs(empty.engine, 12, { jobTypeId, isCandidate: isOre })).toEqual([]);
  });
});
