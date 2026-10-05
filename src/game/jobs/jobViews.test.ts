import { describe, expect, it } from "vitest";
import { pauseBoard } from "./boardPause";
import {
  buildBoardSummaries,
  buildBoardSummary,
  buildBoardView,
  buildPostingView,
} from "./jobViews";
import { claimPosting, completePosting } from "./jobPostings";
import { JobBoardMode, PauseSource, PostingStatus } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";

describe("job views", () => {
  it("summarises boards with counts, position and pause flags", () => {
    const world = createJobWorld({ boardCell: 4 });
    const worker = world.spawn("peasant", 5, noAiOverride);
    const first = world.postFell(15);
    world.postFell(16);
    claimPosting(world.engine, first.id, worker.id, 0);
    pauseBoard(world.engine, world.boardId, PauseSource.System);
    expect(buildBoardSummaries(world.engine)).toEqual([
      {
        boardId: world.boardId,
        mapId: world.mapId,
        cellIndex: 4,
        mode: JobBoardMode.SystemManaged,
        paused: true,
        pausedByPlayer: false,
        pausedBySystem: true,
        open: 1,
        claimed: 1,
      },
    ]);
    expect(buildBoardSummary(world.engine, 1)).toBeNull();
  });

  it("returns copies of postings and history that cannot write through", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const done = world.postFell(15);
    world.postFell(16);
    claimPosting(world.engine, done.id, worker.id, 0);
    completePosting(world.engine, done.id, worker.id, [], 1);
    const view = buildBoardView(world.engine, world.boardId);
    expect(view?.postings.map((posting) => posting.jobTypeId)).toEqual(["fell.trees"]);
    expect(view?.history.map((posting) => posting.status)).toEqual([PostingStatus.Done]);
    const mutable = view?.postings[0] as { priority: number };
    mutable.priority = 1;
    expect(buildBoardView(world.engine, world.boardId)?.postings[0]?.priority).toBe(50);
    expect(buildBoardView(world.engine, 1)).toBeNull();
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("finds a posting while active and in the history, null otherwise", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15);
    expect(buildPostingView(world.engine, posting.id)).toMatchObject({
      boardId: world.boardId,
      active: true,
    });
    claimPosting(world.engine, posting.id, worker.id, 0);
    completePosting(world.engine, posting.id, worker.id, [], 1);
    expect(buildPostingView(world.engine, posting.id)).toMatchObject({
      active: false,
      posting: { status: PostingStatus.Done },
    });
    expect(buildPostingView(world.engine, 99)).toBeNull();
  });
});
