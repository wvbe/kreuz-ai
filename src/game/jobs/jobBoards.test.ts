import { describe, expect, it } from "vitest";
import { JobError, JobErrorKind } from "./JobError";
import {
  activePostingsOfType,
  findPosting,
  getBoard,
  isBoardPaused,
  listBoards,
  offeredPostings,
  requireBoard,
} from "./jobBoards";
import { claimPosting } from "./jobPostings";
import { PostingStatus } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";

describe("job board queries", () => {
  it("lists boards ascending and finds one by id", () => {
    const world = createJobWorld();
    const second = world.spawn("job_board", 9);
    expect(listBoards(world.engine).map((board) => board.id)).toEqual([world.boardId, second.id]);
    expect(getBoard(world.engine, second.id)?.board.id).toBe(second.id);
    expect(getBoard(world.engine, 99)).toBeNull();
    expect(getBoard(world.engine, 1)).toBeNull();
  });

  it("requireBoard throws UnknownBoard for entities that are not boards", () => {
    const world = createJobWorld();
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    try {
      requireBoard(world.engine, 1);
      expect.unreachable();
    } catch (failure) {
      expect(failure).toBeInstanceOf(JobError);
      expect((failure as JobError).kind).toBe(JobErrorKind.UnknownBoard);
    }
  });

  it("isBoardPaused is true while either source holds a pause", () => {
    const world = createJobWorld();
    const { data } = requireBoard(world.engine, world.boardId);
    expect(isBoardPaused(data)).toBe(false);
    data.pausedBySystem = true;
    expect(isBoardPaused(data)).toBe(true);
    data.pausedBySystem = false;
    data.pausedByPlayer = true;
    expect(isBoardPaused(data)).toBe(true);
  });

  it("finds active postings on any board but not finished ones", () => {
    const world = createJobWorld();
    const posting = world.postFell(15);
    expect(findPosting(world.engine, posting.id)?.posting.id).toBe(posting.id);
    expect(findPosting(world.engine, 99)).toBeNull();
  });

  it("offers only open postings and nothing while paused", () => {
    const world = createJobWorld();
    const settler = world.spawn("peasant", 5, noAiOverride);
    const open = world.postFell(15);
    const taken = world.postFell(16);
    claimPosting(world.engine, taken.id, settler.id, 0);
    const { data } = requireBoard(world.engine, world.boardId);
    expect(offeredPostings(data).map((posting) => posting.id)).toEqual([open.id]);
    expect(data.postings.find((posting) => posting.id === taken.id)?.status).toBe(
      PostingStatus.Claimed,
    );
    data.pausedByPlayer = true;
    expect(offeredPostings(data)).toEqual([]);
  });

  it("lists active postings of one job type", () => {
    const world = createJobWorld();
    const first = world.postFell(15);
    const second = world.postFell(16);
    expect(activePostingsOfType(world.engine, "fell.trees").map((posting) => posting.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(activePostingsOfType(world.engine, "farm.sow")).toEqual([]);
  });
});
