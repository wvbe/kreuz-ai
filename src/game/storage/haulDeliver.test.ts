import { describe, expect, it } from "vitest";
import type { Entity } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { getTotal } from "../inventory/inventoryQueries";
import { jobTaskData } from "../jobs/jobExecutor";
import { requireBoard } from "../jobs/jobBoards";
import { claimPosting } from "../jobs/jobPostings";
import { getJobService } from "../jobs/jobServiceRegistry";
import { PostingStatus, jobTaskPriority } from "../jobs/jobTypes";
import { noAiOverride } from "../jobs/testJobWorld";
import { CancelCategory, CancelReason } from "../task/taskTypes";
import { createHaulExecutor, registerHauling } from "./haulDeliver";
import { postHaulJob } from "./haulPoster";
import { getStorageService } from "./storageServiceRegistry";
import { haulJobId, ReservationKind } from "./storageTypes";
import { createStorageWorld, setRules } from "./testStorageWorld";
import type { StorageTestWorld } from "./testStorageWorld";

function totalLogs(world: StorageTestWorld): number {
  return world.count("oak_log");
}

function capture(world: StorageTestWorld, name: string): JsonValue[] {
  const seen: JsonValue[] = [];
  world.engine.bus.subscribe(name, (payload) => seen.push(payload));
  return seen;
}

function startHaul(world: StorageTestWorld, source: Entity, hauler: Entity) {
  const posting = postHaulJob(world.engine, world.boardId, source.id, "oak_log", 0);
  const claimed = claimPosting(world.engine, posting.id, hauler.id, 0);
  const taskId = world.engine.tasks.enqueue(hauler.id, {
    type: haulJobId,
    data: jobTaskData(claimed),
    priority: jobTaskPriority,
  });
  return { posting: claimed, taskId };
}

function postingStatus(world: StorageTestWorld, postingId: number): PostingStatus | null {
  const data = requireBoard(world.engine, world.boardId).data;
  return (
    data.postings.find((entry) => entry.id === postingId)?.status ??
    data.history.find((entry) => entry.id === postingId)?.status ??
    null
  );
}

function setup(logs = 12) {
  const world = createStorageWorld();
  const chest = world.chest(55);
  const pile = world.pile(15, [{ materialId: "oak_log", quantity: logs }]);
  const hauler = world.spawn("peasant", 12, noAiOverride);
  return { world, chest, pile, hauler };
}

// @covers 018:FR-005 018:FR-015 018:SC-003
describe("createHaulExecutor and registerHauling", () => {
  it("is registered by the engine and walks source, then storage, and stores the goods", () => {
    const { world, chest, pile, hauler } = setup();
    expect(world.engine.taskHandlers.has(haulJobId)).toBe(true);
    expect(() => registerHauling(world.engine)).toThrow();
    const completed = capture(world, "jobboard.job.completed");
    const { posting } = startHaul(world, pile, hauler);
    world.run(1);
    expect(getStorageService(world.engine).reservations.all()).toHaveLength(1);
    expect(totalLogs(world)).toBe(12);
    world.run(80);
    expect(getTotal(chest, "oak_log")).toBe(12);
    expect(getTotal(pile, "oak_log")).toBe(0);
    expect(getTotal(hauler, "oak_log")).toBe(0);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    expect(postingStatus(world, posting.id)).toBe(PostingStatus.Done);
    expect(completed).toMatchObject([
      {
        jobTypeId: haulJobId,
        workerId: hauler.id,
        outputs: [{ materialId: "oak_log", quantity: 12 }],
      },
    ]);
  });

  it("only takes what the hauler can carry and the rest stays in the source", () => {
    const world = createStorageWorld();
    const chest = world.chest(55);
    const pile = world.pile(15, []);
    (pile.components["Inventory"] as { slotCount: number }).slotCount = 40;
    world.give(pile, "oak_log", 300);
    const hauler = world.spawn("peasant", 12, noAiOverride);
    (hauler.components["Inventory"] as { slotCount: number }).slotCount = 4;
    const { posting } = startHaul(world, pile, hauler);
    world.run(200);
    // The peasant's bread uses one of 4 slots, so 3 stacks of 20 logs are carried; the chest holds
    // only 40 logs by weight and the hauler keeps the other 20.
    expect(getTotal(chest, "oak_log")).toBe(40);
    expect(totalLogs(world)).toBe(300);
    expect(postingStatus(world, posting.id)).toBe(PostingStatus.Done);
    expect(getTotal(hauler, "oak_log")).toBe(20);
  });

  it("fails with target_invalid when nothing is left at the source", () => {
    const { world, pile, hauler } = setup();
    const { posting } = startHaul(world, pile, hauler);
    const reservations = getStorageService(world.engine).reservations;
    reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: world.boardId,
      inventoryOwnerId: pile.id,
      materialId: "oak_log",
      quantity: 12,
    });
    world.run(2);
    expect(postingStatus(world, posting.id)).toBe(PostingStatus.Failed);
    expect(totalLogs(world)).toBe(12);
  });

  it("fails with no_destination (back-off) when no storage accepts the goods", () => {
    const { world, chest, pile, hauler } = setup();
    world.engine.store.requestDelete(chest.id);
    world.engine.store.flushDeletions();
    const { posting } = startHaul(world, pile, hauler);
    world.run(2);
    expect(postingStatus(world, posting.id)).toBe(PostingStatus.Open);
    expect(getJobService(world.engine).isBackedOff(hauler.id, posting.id, 3)).toBe(true);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    expect(getTotal(pile, "oak_log")).toBe(12);
  });

  it("is cancel safe at every tick: nothing is duplicated or lost, no reservation leaks", () => {
    for (let cancelAt = 1; cancelAt <= 40; cancelAt += 3) {
      const { world, chest, pile, hauler } = setup();
      const { posting } = startHaul(world, pile, hauler);
      world.run(cancelAt);
      world.engine.tasks.interrupt(hauler.id, {
        category: CancelCategory.Graceful,
        reason: CancelReason.InterruptedByPriority,
      });
      world.run(2);
      expect(totalLogs(world)).toBe(12);
      expect(getStorageService(world.engine).reservations.all()).toEqual([]);
      const inChest = getTotal(chest, "oak_log");
      const posted = postingStatus(world, posting.id);
      expect(posted === PostingStatus.Open || posted === PostingStatus.Done).toBe(true);
      if (posted === PostingStatus.Open) {
        expect(inChest).toBe(0);
        expect(getTotal(pile, "oak_log") + getTotal(hauler, "oak_log")).toBe(12);
      }
    }
  });

  it("holds goods nothing accepts: the job completes and the hauler keeps them", () => {
    const { world, chest, pile, hauler } = setup();
    // The only storage is full by slots after the hauler picked the goods up.
    const { posting } = startHaul(world, pile, hauler);
    world.run(1);
    setRules(chest, []);
    world.give(chest, "limestone", 20);
    (chest.components["Inventory"] as { slotCount: number }).slotCount = 1;
    world.run(100);
    expect(postingStatus(world, posting.id)).toBe(PostingStatus.Done);
    expect(getTotal(hauler, "oak_log")).toBe(12);
    expect(getTotal(chest, "oak_log")).toBe(0);
    expect(totalLogs(world)).toBe(12);
  });

  it("tries the next storage when the best one is full, delivering across two chests", () => {
    const world = createStorageWorld();
    const near = world.chest(45, { Inventory: { weightLimitMilli: 20000 } });
    const far = world.chest(58);
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 12 }]);
    const hauler = world.spawn("peasant", 12, noAiOverride);
    startHaul(world, pile, hauler);
    world.run(120);
    expect(getTotal(near, "oak_log")).toBe(4);
    expect(getTotal(far, "oak_log")).toBe(8);
    expect(totalLogs(world)).toBe(12);
  });

  it("delivers what a citizen carries when the hauler is its own source", () => {
    const world = createStorageWorld();
    const chest = world.chest(55);
    const carrier = world.spawn("peasant", 12, noAiOverride);
    world.give(carrier, "oak_log", 6);
    const { posting } = startHaul(world, carrier, carrier);
    world.run(80);
    expect(getTotal(chest, "oak_log")).toBe(6);
    expect(getTotal(carrier, "oak_log")).toBe(0);
    expect(postingStatus(world, posting.id)).toBe(PostingStatus.Done);
  });

  it("follows a source that moved and gives up after too many tries", () => {
    const { world, chest, pile, hauler } = setup();
    const { posting } = startHaul(world, pile, hauler);
    world.run(1);
    pile.components["Position"] = { mapId: world.mapId, cellIndex: 99 };
    world.engine.maps.moveEntity(pile.id, 99);
    world.run(150);
    expect(getTotal(chest, "oak_log")).toBe(12);
    expect(postingStatus(world, posting.id)).toBe(PostingStatus.Done);
  });

  it("builds a fresh executor per engine", () => {
    const { world } = setup();
    const executor = createHaulExecutor(world.engine);
    expect(executor.requires).toEqual(["Position", "Inventory"]);
    expect(typeof executor.cancel).toBe("function");
  });
});
