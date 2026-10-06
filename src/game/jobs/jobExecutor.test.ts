import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { continueStep, doneStep, failStep } from "../task/stepResults";
import { CancelCategory, CancelReason, TaskStatus, WaitKind } from "../task/taskTypes";
import type { StepResult } from "../task/taskTypes";
import { childCompleted, jobTaskData, registerJobType } from "./jobExecutor";
import type { JobExecutor } from "./jobExecutor";
import { requireBoard } from "./jobBoards";
import { cancelPosting, claimPosting, postJob } from "./jobPostings";
import { getJobService } from "./jobServiceRegistry";
import { PostingStatus, jobTaskPriority, postingGoneReason, targetInvalidReason } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";
import type { JobTestWorld } from "./testJobWorld";

// `farm.tend` is a content job type without a built-in executor, so tests can register their own.
const testJobType = "farm.tend";

function setup(executor: JobExecutor) {
  const world = createJobWorld();
  registerJobType(world.engine, testJobType, executor);
  const worker = world.spawn("peasant", 55, noAiOverride);
  const posting = postJob(
    world.engine,
    world.boardId,
    {
      jobTypeId: testJobType,
      target: { mapId: world.mapId, cellIndex: 15, entityId: null, materialId: null },
      wage: 2,
    },
    0,
  );
  const claimed = claimPosting(world.engine, posting.id, worker.id, 0);
  const taskId = world.engine.tasks.enqueue(worker.id, {
    type: testJobType,
    data: jobTaskData(claimed),
    priority: jobTaskPriority,
  });
  return { world, worker, posting: claimed, taskId };
}

function capture(world: JobTestWorld, name: string): JsonValue[] {
  const seen: JsonValue[] = [];
  world.engine.bus.subscribe(name, (payload) => seen.push(payload));
  return seen;
}

function outcomeOf(world: JobTestWorld, workerId: number): [string, string | null] | null {
  const entry = world.engine.tasks.getQueue(workerId)?.history.at(-1);
  return entry === undefined ? null : [entry.outcome, entry.reason];
}

const instant: JobExecutor = {
  start: () => doneStep(),
  step: () => doneStep(),
  complete: () => [{ materialId: "wheat", quantity: 2 }],
};

// @covers 017:FR-004 017:FR-006 017:FR-015
describe("jobTaskData", () => {
  it("carries the posting and claim ids", () => {
    const { posting } = setup(instant);
    expect(jobTaskData(posting)).toEqual({ postingId: posting.id, claimId: 1 });
  });
});

describe("registerJobType", () => {
  it("completes the posting, pays, and emits completed and skill.work.completed once", () => {
    const { world, worker, posting } = setup(instant);
    const completed = capture(world, "jobboard.job.completed");
    const skill = capture(world, "skill.work.completed");
    world.run(2);
    expect(completed).toEqual([
      {
        boardId: world.boardId,
        postingId: posting.id,
        claimId: 1,
        jobTypeId: testJobType,
        workerId: worker.id,
        wage: 2,
        outputs: [{ materialId: "wheat", quantity: 2 }],
      },
    ]);
    expect(skill).toEqual([{ entityId: worker.id, skillId: "farming" }]);
    expect(outcomeOf(world, worker.id)).toEqual([TaskStatus.Completed, null]);
    expect(requireBoard(world.engine, world.boardId).data.history[0]?.status).toBe(
      PostingStatus.Done,
    );
  });

  it("fails the posting for good when complete reports an invalid target", () => {
    const { world, worker, posting } = setup({ ...instant, complete: () => null });
    const completed = capture(world, "jobboard.job.completed");
    world.run(2);
    expect(completed).toEqual([]);
    expect(outcomeOf(world, worker.id)).toEqual([TaskStatus.Failed, targetInvalidReason]);
    const finished = requireBoard(world.engine, world.boardId).data.history[0];
    expect(finished).toMatchObject({
      id: posting.id,
      status: PostingStatus.Failed,
      reason: targetInvalidReason,
    });
  });

  it("releases the claim with a back-off when a step fails", () => {
    const failing: JobExecutor = {
      start: (): StepResult => continueStep(),
      step: () => failStep("boom"),
    };
    const { world, worker, posting } = setup(failing);
    const abandoned = capture(world, "jobboard.job.abandoned");
    world.run(3);
    expect(abandoned).toEqual([
      {
        boardId: world.boardId,
        postingId: posting.id,
        claimId: 1,
        entityId: worker.id,
        reason: "boom",
      },
    ]);
    const live = requireBoard(world.engine, world.boardId).data.postings[0];
    expect(live?.status).toBe(PostingStatus.Open);
    expect(
      getJobService(world.engine).isBackedOff(worker.id, posting.id, world.engine.time.tickCount),
    ).toBe(true);
    expect(outcomeOf(world, worker.id)).toEqual([TaskStatus.Failed, "boom"]);
  });

  it("fails the posting when the executor itself reports target_invalid", () => {
    const { world, posting } = setup({
      start: () => failStep(targetInvalidReason),
      step: () => doneStep(),
    });
    world.run(2);
    expect(requireBoard(world.engine, world.boardId).data.history[0]).toMatchObject({
      id: posting.id,
      status: PostingStatus.Failed,
    });
  });

  it("fails the task with posting_gone when the posting was cancelled", () => {
    const waiting: JobExecutor = { start: () => continueStep(), step: () => continueStep() };
    const { world, worker, posting } = setup(waiting);
    world.run(1);
    cancelPosting(world.engine, posting.id, "player", world.engine.time.tickCount);
    world.run(1);
    expect(outcomeOf(world, worker.id)).toEqual([TaskStatus.Failed, postingGoneReason]);
    expect(getJobService(world.engine).backoffs()).toEqual([]);
  });

  it("releases the claim without a back-off when the task is interrupted", () => {
    const waiting: JobExecutor = { start: () => continueStep(), step: () => continueStep() };
    const { world, worker, posting } = setup(waiting);
    world.run(1);
    world.engine.tasks.interrupt(worker.id, {
      category: CancelCategory.Graceful,
      reason: CancelReason.InterruptedByPriority,
    });
    world.run(1);
    const live = requireBoard(world.engine, world.boardId).data.postings[0];
    expect(live).toMatchObject({ id: posting.id, status: PostingStatus.Open });
    expect(getJobService(world.engine).backoffs()).toEqual([]);
  });

  it("backs the worker off when the task is cancelled as unreachable", () => {
    const waiting: JobExecutor = { start: () => continueStep(), step: () => continueStep() };
    const { world, worker, posting } = setup(waiting);
    world.run(1);
    world.engine.tasks.interrupt(worker.id, {
      category: CancelCategory.Graceful,
      reason: CancelReason.Unreachable,
    });
    world.run(1);
    expect(getJobService(world.engine).backoffs()).toHaveLength(1);
    expect(getJobService(world.engine).backoffs()[0]?.postingId).toBe(posting.id);
  });
});

describe("executor cancel hook", () => {
  it("runs before the claim is released with the cancel token", () => {
    const seen: string[] = [];
    const waiting: JobExecutor = {
      start: () => continueStep(),
      step: () => continueStep(),
      cancel: (_context, _record, token) => seen.push(token.reason),
    };
    const { world, worker, posting } = setup(waiting);
    world.run(1);
    world.engine.tasks.interrupt(worker.id, {
      category: CancelCategory.Graceful,
      reason: CancelReason.PlayerCancel,
    });
    world.run(1);
    expect(seen).toEqual([CancelReason.PlayerCancel]);
    const live = requireBoard(world.engine, world.boardId).data.postings[0];
    expect(live).toMatchObject({ id: posting.id, status: PostingStatus.Open });
  });
});

describe("childCompleted", () => {
  it("reads the outcome of a child wake", () => {
    const base = {
      id: 1,
      type: "x",
      priority: 1,
      status: TaskStatus.Running,
      phase: "",
      data: null,
      parentId: null,
      waitFor: null,
      createdTick: 0,
      token: null,
    };
    expect(
      childCompleted({
        ...base,
        wake: { kind: WaitKind.ChildTask, data: { outcome: TaskStatus.Completed } },
      }),
    ).toBe(true);
    expect(
      childCompleted({
        ...base,
        wake: { kind: WaitKind.ChildTask, data: { outcome: TaskStatus.Failed } },
      }),
    ).toBe(false);
    expect(childCompleted({ ...base, wake: null })).toBe(false);
  });
});
