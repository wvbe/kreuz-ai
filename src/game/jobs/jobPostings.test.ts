import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { SettlementTier } from "../content/contentTypes";
import { getTotal } from "../inventory/inventoryQueries";
import { getBalance } from "../inventory/inventoryMoney";
import { pauseBoard } from "./boardPause";
import { requireBoard } from "./jobBoards";
import { JobError, JobErrorKind } from "./JobError";
import {
  cancelPosting,
  claimPosting,
  completePosting,
  failPosting,
  modifyPosting,
  postJob,
  releasePosting,
  validatePostable,
} from "./jobPostings";
import { getJobService } from "./jobServiceRegistry";
import {
  EligibilityKind,
  PauseSource,
  PostingStatus,
  claimBackoffTicks,
  maxPostingHistory,
} from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";
import type { JobTestWorld } from "./testJobWorld";

function listen(world: JobTestWorld, name: string): JsonValue[] {
  const seen: JsonValue[] = [];
  world.engine.bus.subscribe(name, (payload) => seen.push(payload));
  return seen;
}

function kindOf(action: () => object): JobErrorKind | null {
  try {
    action();
  } catch (failure) {
    return failure instanceof JobError ? failure.kind : null;
  }
  return null;
}

// @covers 017:FR-003 017:FR-004 017:FR-006 017:FR-015 017:SC-002
describe("postJob", () => {
  it("creates an open posting with defaults, a counter id and a posted event", () => {
    const world = createJobWorld();
    const posted = listen(world, "jobboard.job.posted");
    const first = world.postFell(15);
    const second = world.postFell(16);
    world.run(1);
    expect([first.id, second.id]).toEqual([1, 2]);
    expect(first).toMatchObject({
      boardId: world.boardId,
      jobTypeId: "fell.trees",
      priority: 30,
      urgent: false,
      wage: 2,
      status: PostingStatus.Open,
      claimId: null,
      claimantId: null,
      posterFactionId: 1,
      eligibility: [
        { kind: EligibilityKind.AdultHumanoid },
        { kind: EligibilityKind.NotHostileToPoster },
      ],
    });
    expect(posted[0]).toEqual({ boardId: world.boardId, postingId: 1, jobTypeId: "fell.trees" });
    expect(requireBoard(world.engine, world.boardId).data.postings).toHaveLength(2);
  });

  it("takes overrides and clamps the priority", () => {
    const world = createJobWorld();
    const posting = world.postFell(15, {
      priority: 400,
      urgent: true,
      wage: 9,
      posterFactionId: null,
      eligibility: [],
    });
    expect(posting).toMatchObject({
      priority: 100,
      urgent: true,
      wage: 9,
      posterFactionId: null,
      eligibility: [],
    });
  });

  it("rejects unknown boards, job types, locked tiers and bad targets", () => {
    const world = createJobWorld();
    const target = { mapId: world.mapId, cellIndex: 15, entityId: null, materialId: null };
    expect(kindOf(() => postJob(world.engine, 1, { jobTypeId: "fell.trees", target }, 0))).toBe(
      JobErrorKind.UnknownBoard,
    );
    expect(
      kindOf(() => postJob(world.engine, world.boardId, { jobTypeId: "nope", target }, 0)),
    ).toBe(JobErrorKind.UnknownJobType);
    expect(
      kindOf(() =>
        postJob(
          world.engine,
          world.boardId,
          { jobTypeId: "fell.trees", target: { ...target, cellIndex: 5000 } },
          0,
        ),
      ),
    ).toBe(JobErrorKind.InvalidTarget);
    const real = world.engine.content.jobs.find("fell.trees");
    expect(real).toBeDefined();
    if (real !== undefined) {
      const spy = vi
        .spyOn(world.engine.content.jobs, "find")
        .mockReturnValue({ ...real, unlockTier: SettlementTier.CharteredTown });
      expect(
        kindOf(() => postJob(world.engine, world.boardId, { jobTypeId: "fell.trees", target }, 0)),
      ).toBe(JobErrorKind.ContentLocked);
      spy.mockRestore();
    }
  });
});

describe("claimPosting", () => {
  it("claims once: the second claimer gets InvalidStatus, the posting has one claimant", () => {
    const world = createJobWorld();
    const claimed = listen(world, "jobboard.job.claimed");
    const first = world.spawn("peasant", 5, noAiOverride);
    const second = world.spawn("peasant", 6, noAiOverride);
    const posting = world.postFell(15);
    const taken = claimPosting(world.engine, posting.id, first.id, 4);
    expect(taken).toMatchObject({
      status: PostingStatus.Claimed,
      claimantId: first.id,
      claimId: 1,
      claimedTick: 4,
    });
    expect(kindOf(() => claimPosting(world.engine, posting.id, second.id, 4))).toBe(
      JobErrorKind.InvalidStatus,
    );
    world.run(1);
    expect(claimed).toEqual([
      { boardId: world.boardId, postingId: posting.id, claimId: 1, entityId: first.id },
    ]);
  });

  it("refuses ineligible, backed-off and paused-board claims and unknown postings", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const strict = world.postFell(15, {
      eligibility: [{ kind: EligibilityKind.MinSkill, skillId: "woodcutting", level: 99 }],
    });
    expect(kindOf(() => claimPosting(world.engine, strict.id, worker.id, 0))).toBe(
      JobErrorKind.NotClaimable,
    );
    const open = world.postFell(16);
    getJobService(world.engine).addBackoff(worker.id, open.id, 50);
    expect(kindOf(() => claimPosting(world.engine, open.id, worker.id, 10))).toBe(
      JobErrorKind.NotClaimable,
    );
    expect(claimPosting(world.engine, open.id, worker.id, 50).claimantId).toBe(worker.id);
    const other = world.postFell(17);
    requireBoard(world.engine, world.boardId).data.pausedByPlayer = true;
    expect(kindOf(() => claimPosting(world.engine, other.id, worker.id, 50))).toBe(
      JobErrorKind.NotClaimable,
    );
    expect(kindOf(() => claimPosting(world.engine, 99, worker.id, 0))).toBe(
      JobErrorKind.UnknownPosting,
    );
    expect(kindOf(() => claimPosting(world.engine, other.id, 99, 0))).toBe(
      JobErrorKind.NotClaimable,
    );
  });
});

describe("releasePosting", () => {
  it("reopens the posting, emits abandoned and optionally backs the worker off", () => {
    const world = createJobWorld();
    const abandoned = listen(world, "jobboard.job.abandoned");
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15);
    claimPosting(world.engine, posting.id, worker.id, 3);
    expect(releasePosting(world.engine, posting.id, worker.id, "unreachable", 10, true)).toBe(true);
    const after = requireBoard(world.engine, world.boardId).data.postings[0];
    expect(after).toMatchObject({ status: PostingStatus.Open, claimId: null, claimantId: null });
    expect(getJobService(world.engine).isBackedOff(worker.id, posting.id, 10)).toBe(true);
    expect(
      getJobService(world.engine).isBackedOff(worker.id, posting.id, 10 + claimBackoffTicks),
    ).toBe(false);
    world.run(1);
    expect(abandoned).toEqual([
      {
        boardId: world.boardId,
        postingId: posting.id,
        claimId: 1,
        entityId: worker.id,
        reason: "unreachable",
      },
    ]);
  });

  it("does nothing for an entity that does not hold the claim", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const other = world.spawn("peasant", 6, noAiOverride);
    const posting = world.postFell(15);
    expect(releasePosting(world.engine, posting.id, worker.id, "x", 0, true)).toBe(false);
    claimPosting(world.engine, posting.id, worker.id, 0);
    expect(releasePosting(world.engine, posting.id, other.id, "x", 0, true)).toBe(false);
    expect(releasePosting(world.engine, 99, worker.id, "x", 0, true)).toBe(false);
    expect(getJobService(world.engine).backoffs()).toEqual([]);
  });
});

describe("completePosting", () => {
  it("archives as done, pays the wage and emits completed with worker and wage", () => {
    const world = createJobWorld();
    const completed = listen(world, "jobboard.job.completed");
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15, { wage: 5 });
    claimPosting(world.engine, posting.id, worker.id, 1);
    const coins = (): number =>
      getBalance({ materials: world.engine.materials, actor: null }, worker);
    const before = coins();
    const done = completePosting(
      world.engine,
      posting.id,
      worker.id,
      [{ materialId: "oak_log", quantity: 3 }],
      9,
    );
    expect(done).toMatchObject({ status: PostingStatus.Done, finishedTick: 9 });
    expect(coins() - before).toBe(5);
    const data = requireBoard(world.engine, world.boardId).data;
    expect(data.postings).toEqual([]);
    expect(data.history.map((entry) => entry.id)).toEqual([posting.id]);
    world.run(1);
    expect(completed).toEqual([
      {
        boardId: world.boardId,
        postingId: posting.id,
        claimId: 1,
        jobTypeId: "fell.trees",
        workerId: worker.id,
        wage: 5,
        outputs: [{ materialId: "oak_log", quantity: 3 }],
      },
    ]);
    expect(getTotal(worker, "oak_log")).toBe(0);
  });

  it("pays nothing for wage 0 and needs the claimant", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const other = world.spawn("peasant", 6, noAiOverride);
    const posting = world.postFell(15, { wage: 0 });
    expect(kindOf(() => completePosting(world.engine, posting.id, worker.id, [], 0))).toBe(
      JobErrorKind.InvalidStatus,
    );
    claimPosting(world.engine, posting.id, worker.id, 0);
    expect(kindOf(() => completePosting(world.engine, posting.id, other.id, [], 0))).toBe(
      JobErrorKind.InvalidStatus,
    );
    const context = { materials: world.engine.materials, actor: null };
    const before = getBalance(context, worker);
    completePosting(world.engine, posting.id, worker.id, [], 0);
    expect(getBalance(context, worker)).toBe(before);
  });

  it("keeps the history bounded", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    for (let index = 0; index < maxPostingHistory + 3; index += 1) {
      const posting = world.postFell(15 + index, { wage: 0 });
      claimPosting(world.engine, posting.id, worker.id, index);
      completePosting(world.engine, posting.id, worker.id, [], index);
    }
    const history = requireBoard(world.engine, world.boardId).data.history;
    expect(history).toHaveLength(maxPostingHistory);
    expect(history[0]?.id).toBe(4);
  });
});

describe("failPosting and cancelPosting", () => {
  it("archive an open or claimed posting with a reason and an event", () => {
    const world = createJobWorld();
    const failed = listen(world, "jobboard.job.failed");
    const cancelled = listen(world, "jobboard.job.cancelled");
    const worker = world.spawn("peasant", 5, noAiOverride);
    const first = world.postFell(15);
    const second = world.postFell(16);
    claimPosting(world.engine, second.id, worker.id, 0);
    expect(failPosting(world.engine, first.id, "target_invalid", 7)).toMatchObject({
      status: PostingStatus.Failed,
      reason: "target_invalid",
      finishedTick: 7,
    });
    expect(cancelPosting(world.engine, second.id, "player", 8)).toMatchObject({
      status: PostingStatus.Cancelled,
      reason: "player",
    });
    world.run(1);
    expect(failed).toEqual([
      {
        boardId: world.boardId,
        postingId: first.id,
        jobTypeId: "fell.trees",
        reason: "target_invalid",
      },
    ]);
    expect(cancelled).toHaveLength(1);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    expect(kindOf(() => cancelPosting(world.engine, first.id, "again", 9))).toBe(
      JobErrorKind.UnknownPosting,
    );
  });
});

describe("modifyPosting", () => {
  it("changes priority (clamped) and wage of an active posting and keeps the rest", () => {
    const world = createJobWorld();
    const posting = world.postFell(15);
    const changed = modifyPosting(world.engine, posting.id, { priority: 250, wage: 7 });
    expect(changed).toMatchObject({ priority: 100, wage: 7, status: PostingStatus.Open });
    expect(modifyPosting(world.engine, posting.id, {})).toMatchObject({ priority: 100, wage: 7 });
    expect(requireBoard(world.engine, world.boardId).data.postings[0]?.wage).toBe(7);
  });

  it("rejects a finished or unknown posting", () => {
    const world = createJobWorld();
    const posting = world.postFell(15);
    cancelPosting(world.engine, posting.id, "player", 3);
    expect(kindOf(() => modifyPosting(world.engine, posting.id, { wage: 1 }))).toBe(
      JobErrorKind.UnknownPosting,
    );
  });
});

describe("validatePostable", () => {
  const target = (world: JobTestWorld, cellIndex: number) => ({
    mapId: world.mapId,
    cellIndex,
    entityId: null,
    materialId: null,
  });

  it("accepts a known board job on the map and changes nothing", () => {
    const world = createJobWorld();
    expect(() => validatePostable(world.engine, "fell.trees", target(world, 5))).not.toThrow();
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
  });

  it("names the problem: unknown job type, cell off the map", () => {
    const world = createJobWorld();
    expect(kindOf(() => ({ done: validatePostable(world.engine, "nope", target(world, 5)) }))).toBe(
      JobErrorKind.UnknownJobType,
    );
    expect(
      kindOf(() => ({ done: validatePostable(world.engine, "fell.trees", target(world, 5000)) })),
    ).toBe(JobErrorKind.InvalidTarget);
  });
});

// @covers 017:FR-005 017:FR-006 017:SC-003
describe("recurring postings", () => {
  it("re-posts a recurring job with a fresh open slot when it completes", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15, { recurring: true, priority: 70 });
    claimPosting(world.engine, posting.id, worker.id, 1);
    completePosting(world.engine, posting.id, worker.id, [], 4);
    const open = requireBoard(world.engine, world.boardId).data.postings;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      status: PostingStatus.Open,
      claimId: null,
      claimantId: null,
      createdTick: 4,
      priority: 70,
      recurring: true,
      target: posting.target,
    });
    expect(open[0]?.id).toBeGreaterThan(posting.id);
  });

  it("never re-posts a one-time job, a cancelled or failed one, or on a paused board", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const once = world.postFell(15);
    claimPosting(world.engine, once.id, worker.id, 1);
    completePosting(world.engine, once.id, worker.id, [], 2);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    const cancelled = world.postFell(16, { recurring: true });
    cancelPosting(world.engine, cancelled.id, "player", 3);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    const paused = world.postFell(17, { recurring: true });
    claimPosting(world.engine, paused.id, worker.id, 4);
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    completePosting(world.engine, paused.id, worker.id, [], 5);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
  });
});
