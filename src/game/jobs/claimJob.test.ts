import { describe, expect, it } from "vitest";
import { claimBestPosting, findBoardToVisit, rankPostings, reachCostsOf } from "./claimJob";
import { requireBoard } from "./jobBoards";
import { claimPosting, postJob } from "./jobPostings";
import { getJobService } from "./jobServiceRegistry";
import { EligibilityKind, PostingStatus } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";

// @covers 017:FR-002 017:FR-007 017:SC-004
describe("reachCostsOf", () => {
  it("maps every reachable cell to its path cost, 0 for the own cell", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 55, noAiOverride);
    const costs = reachCostsOf(world.engine, worker);
    expect(costs?.get(55)).toBe(0);
    expect(costs?.get(56)).toBe(10);
    expect(costs?.size).toBe(100);
  });

  it("is null for an entity without a position", () => {
    const world = createJobWorld();
    const board = world.engine.store.require(world.boardId);
    delete board.components["Position"];
    expect(reachCostsOf(world.engine, board)).toBeNull();
  });
});

describe("rankPostings", () => {
  it("orders by priority, then urgency, then path cost, then id", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 55, noAiOverride);
    const far = world.postFell(99);
    const near = world.postFell(56);
    const nearTie = world.postFell(54);
    const urgent = world.postFell(98, { urgent: true });
    const important = world.postFell(97, { priority: 80 });
    const costs = reachCostsOf(world.engine, worker);
    const ranked = rankPostings(world.engine, worker, world.boardId, 0, costs ?? new Map());
    expect(ranked.map((entry) => entry.postingId)).toEqual([
      important.id,
      urgent.id,
      near.id,
      nearTie.id,
      far.id,
    ]);
    expect(ranked[2]).toMatchObject({ priority: 30, urgent: false, pathCost: 15 });
  });

  it("carries the familiarity bucket of the job type skill", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 55, noAiOverride);
    world.postFell(56);
    const skills = worker.components["Skills"] as { values: { [skillId: string]: number } };
    skills.values["woodcutting"] = 37_000;
    const costs = reachCostsOf(world.engine, worker) ?? new Map();
    expect(rankPostings(world.engine, worker, world.boardId, 0, costs)[0]?.familiarity).toBe(3);
  });

  it("skips claimed, backed-off, ineligible, other-map and handler-less postings and paused boards", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 55, noAiOverride);
    const other = world.spawn("peasant", 56, noAiOverride);
    const taken = world.postFell(60);
    claimPosting(world.engine, taken.id, other.id, 0);
    const backedOff = world.postFell(61);
    getJobService(world.engine).addBackoff(worker.id, backedOff.id, 100);
    world.postFell(62, {
      eligibility: [{ kind: EligibilityKind.MinSkill, skillId: "woodcutting", level: 50 }],
    });
    const good = world.postFell(63);
    const costs = reachCostsOf(world.engine, worker) ?? new Map();
    expect(
      rankPostings(world.engine, worker, world.boardId, 10, costs).map((entry) => entry.postingId),
    ).toEqual([good.id]);
    expect(
      rankPostings(world.engine, worker, world.boardId, 100, costs).map((entry) => entry.postingId),
    ).toEqual([good.id, backedOff.id]);
    requireBoard(world.engine, world.boardId).data.postings[3] = {
      ...good,
      jobTypeId: "farm.tend",
    };
    expect(
      rankPostings(world.engine, worker, world.boardId, 100, costs).map((entry) => entry.postingId),
    ).toEqual([backedOff.id]);
    requireBoard(world.engine, world.boardId).data.pausedByPlayer = true;
    expect(rankPostings(world.engine, worker, world.boardId, 100, costs)).toEqual([]);
    expect(rankPostings(world.engine, worker, 99, 100, costs)).toEqual([]);
  });
});

describe("findBoardToVisit", () => {
  it("picks the nearest board that has work for the worker", () => {
    const world = createJobWorld({ boardCell: 0 });
    const nearBoard = world.spawn("job_board", 59);
    const worker = world.spawn("peasant", 55, noAiOverride);
    expect(findBoardToVisit(world.engine, worker, 0)).toBeNull();
    world.postFell(70);
    expect(findBoardToVisit(world.engine, worker, 0)).toBe(world.boardId);
    world.engine.maps.require(world.mapId).setTerrain(71, "forest_oak");
    postJob(
      world.engine,
      nearBoard.id,
      {
        jobTypeId: "fell.trees",
        target: { mapId: world.mapId, cellIndex: 71, entityId: null, materialId: null },
      },
      0,
    );
    expect(findBoardToVisit(world.engine, worker, 0)).toBe(nearBoard.id);
    requireBoard(world.engine, nearBoard.id).data.pausedBySystem = true;
    expect(findBoardToVisit(world.engine, worker, 0)).toBe(world.boardId);
  });
});

describe("claimBestPosting", () => {
  it("claims the best posting and returns null when nothing is left", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 55, noAiOverride);
    const low = world.postFell(56);
    const high = world.postFell(57, { priority: 90 });
    const claimed = claimBestPosting(world.engine, worker, world.boardId, 0);
    expect(claimed?.id).toBe(high.id);
    expect(claimed?.status).toBe(PostingStatus.Claimed);
    expect(claimBestPosting(world.engine, worker, world.boardId, 0)?.id).toBe(low.id);
    expect(claimBestPosting(world.engine, worker, world.boardId, 0)).toBeNull();
  });
});
