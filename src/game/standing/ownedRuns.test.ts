import { describe, expect, it } from "vitest";
import { getCrierService } from "../crier/crierServiceRegistry";
import { requireBoard } from "../jobs/jobBoards";
import { findOrder } from "../production/productionQueries";
import { OrderStatus } from "../production/productionTypes";
import {
  applyRun,
  pruneRuns,
  queueRun,
  runStatus,
  runWithdrawnReason,
  withdrawable,
  withdrawRun,
} from "./ownedRuns";
import { getStandingService } from "./standingServiceRegistry";
import { RunStatus } from "./standingTypes";
import { createStandingWorld } from "./testStandingWorld";

function readyWorld() {
  const world = createStandingWorld({ width: 20, height: 20 });
  world.userBoard();
  world.throneRoom(5, 5);
  world.steward(2);
  world.spawn("sawmill", 30);
  return world;
}

// Queues runs for a fresh order and delivers the first `delivered` of them.
function withRuns(count: number, delivered: number) {
  const world = readyWorld();
  const id = world.standing();
  const order = world.orderOf(id);
  const runs = [];
  for (let index = 0; index < count; index += 1) {
    const run = queueRun(world.engine, order, world.boardId);
    if (run === null) {
      throw new Error("no run");
    }
    runs.push(run);
  }
  for (const run of runs.slice(0, delivered)) {
    expect(applyRun(world.engine, run.runId)).toBe(true);
  }
  return { world, id, order, runs };
}

describe("queueRun", () => {
  // @covers 026:FR-009 026:FR-018
  it("creates a pending add with a Steward-origin update on the board", () => {
    const { world, runs } = withRuns(2, 0);
    expect(runs.map((run) => run.runId)).toEqual([1, 2]);
    expect(runs[0]).toMatchObject({ boardId: world.boardId, updateId: 1, productionOrderId: null });
    expect(getCrierService(world.engine).find(1)?.origin).toBe("Steward");
    expect(getStandingService(world.engine).state.nextRunId).toBe(3);
    expect(runStatus(world.engine, runs[0] as (typeof runs)[number])).toBe(RunStatus.PendingAdd);
  });

  it("leaves no run behind when the board refuses the update", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const id = world.standing();
    const run = queueRun(world.engine, world.orderOf(id), world.boardId);
    expect(run).toBeNull();
    expect(getStandingService(world.engine).state.runs).toEqual([]);
  });
});

describe("applyRun", () => {
  // @covers 026:FR-012
  it("turns a run into a production order of one craft with the order's priority", () => {
    const { world, runs, order } = withRuns(1, 1);
    order.priority = 77;
    const run = getStandingService(world.engine).state.runs[0];
    expect(run).toMatchObject({ updateId: null });
    const located = findOrder(world.engine, run?.productionOrderId ?? 0);
    expect(located?.order).toMatchObject({
      recipeId: "saw_oak_planks",
      quantity: 1,
      status: OrderStatus.Active,
    });
    expect(runStatus(world.engine, runs[0] as (typeof runs)[number])).toBe(RunStatus.Open);
  });

  it("drops the run and refuses when no order can be made", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.userBoard();
    const id = world.standing();
    const run = queueRun(world.engine, world.orderOf(id), world.boardId);
    expect(applyRun(world.engine, (run as NonNullable<typeof run>).runId)).toBe(false);
    expect(getStandingService(world.engine).state.runs).toEqual([]);
    expect(applyRun(world.engine, 99)).toBe(false);
  });
});

describe("runStatus", () => {
  // @covers 026:FR-009
  it("is Claimed while a craft of the order runs and Open otherwise", () => {
    const { world, runs } = withRuns(2, 2);
    world.claim((runs[0] as (typeof runs)[number]).runId);
    expect(runStatus(world.engine, runs[0] as (typeof runs)[number])).toBe(RunStatus.Claimed);
    expect(runStatus(world.engine, runs[1] as (typeof runs)[number])).toBe(RunStatus.Open);
  });

  it("is Claimed while the craft job is claimed by a crafter", () => {
    const { world, runs } = withRuns(1, 1);
    world.give(world.chest(31), "oak_log", 5);
    world.run(7);
    const located = findOrder(
      world.engine,
      getStandingService(world.engine).state.runs[0]?.productionOrderId ?? 0,
    );
    const postingId = located?.order.postingId ?? 0;
    const posting = requireBoard(world.engine, world.boardId).data.postings.find(
      (entry) => entry.id === postingId,
    );
    expect(posting).toBeDefined();
    if (posting !== undefined) {
      posting.status = "claimed" as typeof posting.status;
    }
    expect(runStatus(world.engine, runs[0] as (typeof runs)[number])).toBe(RunStatus.Claimed);
  });
});

describe("withdrawable and withdrawRun", () => {
  // @covers 026:FR-009
  it("lists pending adds first, then open runs, newest first, never claimed ones", () => {
    const { world, id, runs } = withRuns(5, 3);
    world.claim((runs[0] as (typeof runs)[number]).runId);
    expect(withdrawable(world.engine, id).map((run) => run.runId)).toEqual([5, 4, 3, 2]);
  });

  // @covers 026:FR-018
  it("takes a pending add off the crier's queue and abandons its update", () => {
    const { world, runs } = withRuns(1, 0);
    const abandoned = world.record("jobboard.update.abandoned");
    expect(withdrawRun(world.engine, runs[0] as (typeof runs)[number])).toBe(true);
    world.run(1);
    expect(abandoned).toEqual([
      { updateId: 1, boardId: world.boardId, reason: runWithdrawnReason },
    ]);
    expect(getStandingService(world.engine).state.runs).toEqual([]);
    expect(getCrierService(world.engine).updates()).toEqual([]);
  });

  // @covers 026:FR-018
  it("cancels the production order of an open run and refuses a claimed one", () => {
    const { world, runs } = withRuns(2, 2);
    world.claim((runs[0] as (typeof runs)[number]).runId);
    expect(withdrawRun(world.engine, runs[0] as (typeof runs)[number])).toBe(false);
    const open = runs[1] as (typeof runs)[number];
    const orderId = getStandingService(world.engine).state.runs[1]?.productionOrderId ?? 0;
    expect(withdrawRun(world.engine, open)).toBe(true);
    expect(findOrder(world.engine, orderId)?.order.status).toBe(OrderStatus.Cancelled);
    expect(getStandingService(world.engine).state.runs).toHaveLength(1);
  });
});

describe("pruneRuns", () => {
  it("drops finished and vanished runs and keeps the rest", () => {
    const { world, runs } = withRuns(4, 3);
    world.finish((runs[0] as (typeof runs)[number]).runId);
    const missing = getStandingService(world.engine).state.runs[1];
    if (missing !== undefined) {
      missing.productionOrderId = 9999;
    }
    expect(pruneRuns(world.engine)).toBe(2);
    expect(getStandingService(world.engine).state.runs.map((run) => run.runId)).toEqual([3, 4]);
  });

  it("drops a pending add whose update was abandoned and keeps a cancelled order whose craft runs", () => {
    const { world, runs } = withRuns(3, 2);
    getCrierService(world.engine).remove((runs[2] as (typeof runs)[number]).updateId ?? 0);
    world.claim((runs[0] as (typeof runs)[number]).runId);
    const located = findOrder(
      world.engine,
      getStandingService(world.engine).state.runs[0]?.productionOrderId ?? 0,
    );
    if (located !== null) {
      located.order.status = OrderStatus.Cancelled;
    }
    expect(pruneRuns(world.engine)).toBe(1);
    expect(getStandingService(world.engine).state.runs.map((run) => run.runId)).toEqual([1, 2]);
  });
});
