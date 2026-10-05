import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { isBoardPaused, offeredPostings, requireBoard } from "./jobBoards";
import { JobError } from "./JobError";
import { pauseBoard, resumeBoard } from "./boardPause";
import { PauseSource } from "./jobTypes";
import { createJobWorld } from "./testJobWorld";

describe("pauseBoard and resumeBoard", () => {
  it("pause one source at a time; resuming one never lifts the other", () => {
    const world = createJobWorld();
    const posting = world.postFell(15);
    const { data } = requireBoard(world.engine, world.boardId);
    expect(offeredPostings(data).map((entry) => entry.id)).toEqual([posting.id]);
    expect(pauseBoard(world.engine, world.boardId, PauseSource.Player)).toBe(true);
    expect(pauseBoard(world.engine, world.boardId, PauseSource.Player)).toBe(false);
    expect(pauseBoard(world.engine, world.boardId, PauseSource.System)).toBe(true);
    expect(offeredPostings(data)).toEqual([]);
    expect(resumeBoard(world.engine, world.boardId, PauseSource.System)).toBe(true);
    expect(isBoardPaused(data)).toBe(true);
    expect(data.pausedByPlayer).toBe(true);
    expect(resumeBoard(world.engine, world.boardId, PauseSource.Player)).toBe(true);
    expect(resumeBoard(world.engine, world.boardId, PauseSource.Player)).toBe(false);
    expect(isBoardPaused(data)).toBe(false);
    expect(offeredPostings(data).map((entry) => entry.id)).toEqual([posting.id]);
  });

  it("queues jobboard.paused and jobboard.resumed with the source", () => {
    const world = createJobWorld();
    const seen: { name: string; payload: JsonValue }[] = [];
    world.engine.bus.subscribe("jobboard.*", (payload, event) =>
      seen.push({ name: event.name, payload }),
    );
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    resumeBoard(world.engine, world.boardId, PauseSource.Player);
    pauseBoard(world.engine, world.boardId, PauseSource.System);
    world.run(1);
    expect(seen).toEqual([
      { name: "jobboard.paused", payload: { boardId: world.boardId, source: "Player" } },
      { name: "jobboard.resumed", payload: { boardId: world.boardId, source: "Player" } },
      { name: "jobboard.paused", payload: { boardId: world.boardId, source: "System" } },
    ]);
  });

  it("throws UnknownBoard for entities that are no board", () => {
    const world = createJobWorld();
    expect(() => pauseBoard(world.engine, 1, PauseSource.Player)).toThrow(JobError);
    expect(() => resumeBoard(world.engine, 1, PauseSource.Player)).toThrow(JobError);
  });
});
