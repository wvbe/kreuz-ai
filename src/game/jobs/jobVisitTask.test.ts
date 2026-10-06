import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { TaskStatus } from "../task/taskTypes";
import { requireBoard } from "./jobBoards";
import { boardGoneReason, createVisitTask, visitTaskData } from "./jobVisitTask";
import { PostingStatus, jobTaskPriority, visitTaskType } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";

function visit(world: ReturnType<typeof createJobWorld>, workerId: number, boardId: number): void {
  world.engine.tasks.enqueue(workerId, {
    type: visitTaskType,
    data: visitTaskData(boardId),
    priority: jobTaskPriority,
  });
}

// @covers 017:FR-002 017:SC-001
describe("visitTaskData", () => {
  it("is the board id", () => {
    expect(visitTaskData(7)).toEqual({ boardId: 7 });
  });
});

describe("createVisitTask", () => {
  it("walks to the board, claims on arrival and enqueues the job task", () => {
    const world = createJobWorld({ boardCell: 0 });
    const worker = world.spawn("peasant", 3, noAiOverride);
    const posting = world.postFell(1);
    const claimed: JsonValue[] = [];
    world.engine.bus.subscribe("jobboard.job.claimed", (payload) => claimed.push(payload));
    visit(world, worker.id, world.boardId);
    world.run(1);
    expect(requireBoard(world.engine, world.boardId).data.postings[0]?.status).toBe(
      PostingStatus.Open,
    );
    world.run(5);
    const live = requireBoard(world.engine, world.boardId).data.postings[0];
    expect(live).toMatchObject({ status: PostingStatus.Claimed, claimantId: worker.id });
    expect(claimed).toHaveLength(1);
    const tasks = world.engine.tasks.getQueue(worker.id)?.tasks ?? [];
    expect(tasks.map((task) => task.type)).toEqual(["fell.trees"]);
    expect(tasks[0]?.priority).toBe(jobTaskPriority);
    expect(live?.id).toBe(posting.id);
  });

  it("claims at once when the worker already stands on the board", () => {
    const world = createJobWorld({ boardCell: 3 });
    const worker = world.spawn("peasant", 3, noAiOverride);
    world.postFell(1);
    visit(world, worker.id, world.boardId);
    world.run(1);
    expect(requireBoard(world.engine, world.boardId).data.postings[0]?.status).toBe(
      PostingStatus.Claimed,
    );
  });

  it("finishes quietly when nothing is left to claim", () => {
    const world = createJobWorld({ boardCell: 3 });
    const worker = world.spawn("peasant", 3, noAiOverride);
    visit(world, worker.id, world.boardId);
    world.run(2);
    const last = world.engine.tasks.getQueue(worker.id)?.history.at(-1);
    expect(last).toMatchObject({ type: visitTaskType, outcome: TaskStatus.Completed });
    expect(world.engine.tasks.getQueue(worker.id)?.tasks).toEqual([]);
  });

  it("fails with board_gone when the board is not there", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 3, noAiOverride);
    visit(world, worker.id, 99);
    world.run(2);
    expect(world.engine.tasks.getQueue(worker.id)?.history.at(-1)).toMatchObject({
      outcome: TaskStatus.Failed,
      reason: boardGoneReason,
    });
    expect(createVisitTask(world.engine).type).toBe(visitTaskType);
  });
});
