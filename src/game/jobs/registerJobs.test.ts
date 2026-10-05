import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import type { GameEngine } from "../engine/GameEngine";
import { claimPosting } from "./jobPostings";
import { requireBoard } from "./jobBoards";
import { getJobService } from "./jobServiceRegistry";
import { JobBoardMode, PostingStatus } from "./jobTypes";
import { registerJobs } from "./registerJobs";
import { createJobWorld, noAiOverride } from "./testJobWorld";
import type { JobTestWorld } from "./testJobWorld";

function command(engine: GameEngine, kind: string, payload: JsonValue): JsonValue {
  const registration = engine.getCommandHandler(kind);
  if (registration === undefined) {
    throw new Error(`no command ${kind}`);
  }
  return registration.handler(payload, engine);
}

function query(engine: GameEngine, name: string, args: JsonValue): JsonValue {
  const registration = engine.getQuery(name);
  if (registration === undefined) {
    throw new Error(`no query ${name}`);
  }
  return registration.run(args, engine);
}

function target(world: JobTestWorld, cellIndex: number): JsonValue {
  return { boardId: world.boardId, jobTypeId: "fell.trees", mapId: world.mapId, cellIndex };
}

describe("registerJobs", () => {
  it("is idempotent and returns the engine's service", () => {
    const world = createJobWorld();
    expect(registerJobs(world.engine)).toBe(getJobService(world.engine));
  });

  it("gives the job_board prototype a JobBoard component", () => {
    const world = createJobWorld();
    expect(requireBoard(world.engine, world.boardId).data.mode).toBe(JobBoardMode.SystemManaged);
  });

  it("SetJobBoardPaused pauses and resumes as the player", () => {
    const world = createJobWorld();
    expect(
      command(world.engine, "SetJobBoardPaused", { boardId: world.boardId, paused: true }),
    ).toEqual({
      changed: true,
    });
    expect(requireBoard(world.engine, world.boardId).data.pausedByPlayer).toBe(true);
    expect(requireBoard(world.engine, world.boardId).data.pausedBySystem).toBe(false);
    command(world.engine, "SetJobBoardPaused", { boardId: world.boardId, paused: false });
    expect(requireBoard(world.engine, world.boardId).data.pausedByPlayer).toBe(false);
    expect(() => command(world.engine, "SetJobBoardPaused", { boardId: 1, paused: true })).toThrow(
      /not a job board/,
    );
  });

  it("PostCustomJob posts at once on any board", () => {
    const world = createJobWorld();
    world.forest(15);
    const result = command(world.engine, "PostCustomJob", {
      ...(target(world, 15) as object),
      priority: 80,
      urgent: true,
      wage: 7,
    });
    expect(result).toEqual({ postingId: 1 });
    expect(requireBoard(world.engine, world.boardId).data.postings[0]).toMatchObject({
      priority: 80,
      urgent: true,
      wage: 7,
      status: PostingStatus.Open,
    });
    expect(() =>
      command(world.engine, "PostCustomJob", {
        ...(target(world, 15) as object),
        jobTypeId: "nope",
      }),
    ).toThrow(/unknown/);
  });

  it("PostJob is only accepted on a user-managed board", () => {
    const world = createJobWorld();
    expect(() => command(world.engine, "PostJob", target(world, 15))).toThrow(/system-managed/);
    requireBoard(world.engine, world.boardId).data.mode = JobBoardMode.UserManaged;
    expect(command(world.engine, "PostJob", target(world, 15))).toEqual({ postingId: 1 });
  });

  it("answers job-boards, jobs-on and job", () => {
    const world = createJobWorld();
    const posting = world.postFell(15);
    const boards = query(world.engine, "job-boards", {}) as { boardId: number; open: number }[];
    expect(boards.map((board) => [board.boardId, board.open])).toEqual([[world.boardId, 1]]);
    const view = query(world.engine, "jobs-on", { boardId: world.boardId }) as {
      postings: { id: number }[];
    };
    expect(view.postings.map((entry) => entry.id)).toEqual([posting.id]);
    expect(query(world.engine, "jobs-on", { boardId: 1 })).toBeNull();
    expect(query(world.engine, "job", { postingId: posting.id })).toMatchObject({ active: true });
    expect(query(world.engine, "job", { postingId: 99 })).toBeNull();
  });

  it("releases the claims of a deleted worker and forgets its back-offs", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15);
    claimPosting(world.engine, posting.id, worker.id, 0);
    getJobService(world.engine).addBackoff(worker.id, 99, 500);
    world.engine.store.requestDelete(worker.id);
    world.run(2);
    expect(requireBoard(world.engine, world.boardId).data.postings[0]).toMatchObject({
      status: PostingStatus.Open,
      claimantId: null,
    });
    expect(getJobService(world.engine).backoffs()).toEqual([]);
  });

  it("drops expired back-offs while ticking", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15);
    getJobService(world.engine).addBackoff(worker.id, posting.id, 3);
    world.run(5);
    expect(getJobService(world.engine).backoffs()).toEqual([]);
  });
});
