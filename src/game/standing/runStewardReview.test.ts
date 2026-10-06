import { describe, expect, it } from "vitest";
import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import { getBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import { getJobService } from "../jobs/jobServiceRegistry";
import { getCrierService } from "../crier/crierServiceRegistry";
import { dismissSteward } from "./steward";
import { runStatus } from "./ownedRuns";
import { runStewardReview } from "./runStewardReview";
import { getStandingService } from "./standingServiceRegistry";
import { audienceTaskType, RunStatus } from "./standingTypes";
import { createStandingWorld } from "./testStandingWorld";
import type { StandingTestWorld } from "./testStandingWorld";

// A world where a review can run: a throne room, a Steward, a user-managed board, a sawmill (the
// recipe of the default order) and a chest for the stock.
function readyWorld(): StandingTestWorld {
  const world = createStandingWorld({ width: 20, height: 20 });
  world.userBoard();
  world.throneRoom(5, 5);
  world.steward(2);
  world.spawn("sawmill", 30);
  return world;
}

function runsOf(world: StandingTestWorld, orderId: number) {
  return getStandingService(world.engine).runsOf(orderId);
}

describe("runStewardReview", () => {
  it("starts restocking at the threshold and queues the runs the deficit needs (US1)", () => {
    const world = readyWorld();
    const chest = world.chest(31);
    world.give(chest, "oak_plank", 14);
    const id = world.standing();
    const started = world.record("standing-order.restock.started");
    const completed = world.record("steward.review.completed");
    world.runToReview();
    expect(world.orderOf(id).restocking).toBe(true);
    expect(runsOf(world, id)).toHaveLength(3);
    expect(runsOf(world, id).every((run) => run.updateId !== null)).toBe(true);
    world.run(1);
    expect(started).toEqual([{ orderId: id, stock: 14, target: 20 }]);
    expect(completed).toEqual([
      { tick: 72, ordersEvaluated: 1, postingsQueued: 3, withdrawalsQueued: 0 },
    ]);
  });

  it("posts nothing while the stock is above the threshold or at the target (US2.1)", () => {
    const world = readyWorld();
    const chest = world.chest(31);
    world.give(chest, "oak_plank", 17);
    const id = world.standing();
    world.runToReview();
    expect(world.orderOf(id).restocking).toBe(false);
    expect(runsOf(world, id)).toEqual([]);
    world.give(chest, "oak_plank", 5);
    world.run(288);
    expect(runsOf(world, id)).toEqual([]);
  });

  it("restocks at the threshold exactly (inclusive) and caps the runs at maxOpenRunsPerOrder (US2.6)", () => {
    const world = readyWorld();
    world.give(world.chest(31), "oak_plank", 15);
    const id = world.standing();
    world.runToReview();
    expect(world.orderOf(id).restocking).toBe(true);
    expect(runsOf(world, id)).toHaveLength(3);
    const empty = createStandingWorld({ width: 20, height: 20 });
    empty.userBoard();
    empty.throneRoom(5, 5);
    empty.steward(2);
    empty.spawn("sawmill", 30);
    const wide = empty.standing({ targetQuantity: 100, restockThreshold: 90 });
    empty.runToReview();
    expect(runsOf(empty, wide)).toHaveLength(empty.engine.content.constants.maxOpenRunsPerOrder);
  });

  it("queues nothing more while a restocking order already owns the runs its deficit needs (US2.3)", () => {
    const world = readyWorld();
    const chest = world.chest(31);
    world.give(chest, "oak_plank", 14);
    const id = world.standing();
    world.runToReview();
    expect(runsOf(world, id)).toHaveLength(3);
    world.give(chest, "oak_plank", 4);
    runStewardReview(world.engine, 100);
    expect(runsOf(world, id)).toHaveLength(1);
    runStewardReview(world.engine, 101);
    expect(runsOf(world, id)).toHaveLength(1);
  });

  it("is satisfied at the target and withdraws what no crafter has, the claimed run finishes (US2.4)", () => {
    const world = readyWorld();
    world.crier(1);
    const chest = world.chest(31);
    const id = world.standing();
    world.runToReview();
    world.run(150);
    expect(runsOf(world, id)).toHaveLength(5);
    const claimedRun = (runsOf(world, id)[0] as ReturnType<typeof runsOf>[number]).runId;
    world.claim(claimedRun);
    world.give(chest, "oak_plank", 20);
    const satisfied = world.record("standing-order.satisfied");
    const completed = world.record("steward.review.completed");
    runStewardReview(world.engine, world.engine.time.tickCount + 1);
    world.engine.bus.processQueue();
    expect(satisfied).toEqual([{ orderId: id, stock: 20 }]);
    expect(world.orderOf(id).restocking).toBe(false);
    expect(runsOf(world, id).map((run) => run.runId)).toEqual([claimedRun]);
    expect(runStatus(world.engine, runsOf(world, id)[0] as ReturnType<typeof runsOf>[number])).toBe(
      RunStatus.Claimed,
    );
    expect(completed[0]).toMatchObject({ withdrawalsQueued: 4, postingsQueued: 0 });
  });

  it("withdraws pending adds before open runs, newest first, and never a claimed run (US2.5)", () => {
    const world = readyWorld();
    world.crier(1);
    const chest = world.chest(31);
    const id = world.standing({ targetQuantity: 6, restockThreshold: 4 });
    world.runToReview();
    world.run(150);
    const first = runsOf(world, id).map((run) => run.runId);
    expect(first).toEqual([1, 2, 3]);
    world.claim(1);
    // Two more runs wait on a crier that has not delivered yet: pending adds.
    const order = world.orderOf(id);
    order.targetQuantity = 12;
    order.restockThreshold = 10;
    runStewardReview(world.engine, 300);
    expect(runsOf(world, id).map((run) => run.runId)).toEqual([1, 2, 3, 4, 5]);
    world.give(chest, "oak_plank", 4);
    order.targetQuantity = 6;
    order.restockThreshold = 4;
    runStewardReview(world.engine, 301);
    // Stock 4 needs 1 run: the claimed run stays, the pending adds go first (5, 4), then the open
    // runs newest first (3, 2): only the claimed one is left.
    expect(runsOf(world, id).map((run) => run.runId)).toEqual([1]);
  });

  it("skips the review without a Steward and keeps the runs (US3.1)", () => {
    const world = readyWorld();
    const skipped = world.record("steward.review.skipped");
    const id = world.standing();
    world.runToReview();
    expect(runsOf(world, id).length).toBeGreaterThan(0);
    const before = runsOf(world, id).length;
    dismissSteward(world.engine);
    world.run(288);
    world.run(1);
    expect(skipped).toEqual([{ tick: 360, reason: "NoSteward" }]);
    expect(runsOf(world, id)).toHaveLength(before);
  });

  it("skips the review without an active throne room (US3.2)", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.userBoard();
    world.steward(2);
    world.spawn("sawmill", 30);
    const skipped = world.record("steward.review.skipped");
    const id = world.standing();
    world.runToReview();
    world.run(1);
    expect(skipped).toEqual([{ tick: 72, reason: "NoSeatOfGovernment" }]);
    expect(runsOf(world, id)).toEqual([]);
    expect(getStandingService(world.engine).state.lastReviewTick).toBeNull();
  });

  it("sends the Steward to an audience, once per review (US3.5)", () => {
    const world = readyWorld();
    const stewardId = getStandingService(world.engine).state.stewardEntityId as number;
    world.standing();
    world.runToReview();
    const tasks = world.engine.tasks.getQueue(stewardId)?.tasks ?? [];
    expect(tasks.filter((task) => task.type === audienceTaskType)).toHaveLength(1);
    runStewardReview(world.engine, 80);
    const again = world.engine.tasks.getQueue(stewardId)?.tasks ?? [];
    expect(again.filter((task) => task.type === audienceTaskType)).toHaveLength(1);
  });

  it("evaluates orders by priority, highest first, then by id (FR-011)", () => {
    const world = readyWorld();
    world.spawn("grinding_mill", 32);
    world.standing({ materialId: "oak_plank", priority: 40 });
    world.standing({
      materialId: "flour",
      recipeId: "grind_flour",
      priority: 90,
      targetQuantity: 8,
      restockThreshold: 4,
    });
    world.standing({ materialId: "bread", priority: 90, targetQuantity: 8, restockThreshold: 4 });
    const started = world.record("standing-order.restock.started") as { orderId: number }[];
    world.runToReview();
    world.run(1);
    expect(started.map((entry) => entry.orderId)).toEqual([2, 3, 1]);
  });

  it("withdraws the runs of a paused order and posts none (edge case)", () => {
    const world = readyWorld();
    const id = world.standing();
    world.runToReview();
    expect(runsOf(world, id)).toHaveLength(5);
    world.command("PauseStandingOrder", { orderId: id });
    const completed = world.record("steward.review.completed");
    runStewardReview(world.engine, 100);
    world.run(1);
    expect(runsOf(world, id)).toEqual([]);
    expect(completed[0]).toMatchObject({ ordersEvaluated: 0, withdrawalsQueued: 5 });
  });

  it("withdraws and reports nothing for a zone order whose zone was deleted (US5.4)", () => {
    const world = readyWorld();
    const zoneId = world.zone("stockpile", [60]);
    const id = world.standing({ scope: { zoneId } });
    world.runToReview();
    expect(runsOf(world, id).length).toBeGreaterThan(0);
    world.command("DeleteZone", { zoneId });
    world.run(2);
    runStewardReview(world.engine, 300);
    expect(runsOf(world, id)).toEqual([]);
  });

  it("moves unclaimed runs when the resolved board changes (FR-019)", () => {
    const world = readyWorld();
    const id = world.standing({ targetQuantity: 6, restockThreshold: 4 });
    world.runToReview();
    expect(new Set(runsOf(world, id).map((run) => run.boardId))).toEqual(new Set([world.boardId]));
    const nearer = world.spawn("job_board", 2 * 20 + 6);
    const found = getBoard(world.engine, nearer.id);
    if (found !== null) {
      found.data.mode = JobBoardMode.UserManaged;
    }
    const completed = world.record("steward.review.completed");
    runStewardReview(world.engine, world.engine.time.tickCount + 1);
    world.engine.bus.processQueue();
    expect(runsOf(world, id)).toHaveLength(3);
    expect(new Set(runsOf(world, id).map((run) => run.boardId))).toEqual(new Set([nearer.id]));
    expect(completed[0]).toMatchObject({ postingsQueued: 3, withdrawalsQueued: 3 });
  });

  it("posts nothing while the recipe is locked by the tier (spec edge case)", () => {
    const recipes = bundledContentFiles[ContentFile.Recipes];
    const content = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.Recipes]: [
        ...(Array.isArray(recipes) ? recipes : []),
        {
          id: "smelt_ingot",
          name: "Smelt ingot",
          inputs: [{ materialId: "iron_ore", quantity: 2 }],
          outputs: [{ materialId: "iron_ingot", quantity: 1 }],
          durationTicks: 30,
          workstationTag: "workbench",
          unlockTier: "village",
        },
      ],
    });
    const world = createStandingWorld({ width: 20, height: 20, content });
    world.userBoard();
    world.throneRoom(5, 5);
    world.steward(2);
    world.spawn("workbench", 30);
    const id = world.standing({
      materialId: "iron_ingot",
      recipeId: "smelt_ingot",
      targetQuantity: 6,
    });
    getJobService(world.engine).setTierSource(() => "hamlet");
    world.runToReview();
    expect(runsOf(world, id)).toEqual([]);
    expect(world.orderOf(id).restocking).toBe(false);
    expect(getCrierService(world.engine).updates()).toEqual([]);
  });

  it("posts nothing when no user-managed board can be reached (US4)", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.throneRoom(5, 5);
    world.steward(2);
    world.spawn("sawmill", 30);
    const id = world.standing();
    world.runToReview();
    expect(world.orderOf(id).restocking).toBe(true);
    expect(runsOf(world, id)).toEqual([]);
  });
});
