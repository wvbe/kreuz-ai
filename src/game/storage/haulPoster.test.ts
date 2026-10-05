import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { getTotal } from "../inventory/inventoryQueries";
import { requireBoard } from "../jobs/jobBoards";
import { claimPosting } from "../jobs/jobPostings";
import { pauseBoard } from "../jobs/boardPause";
import { PauseSource, PostingStatus } from "../jobs/jobTypes";
import { noAiOverride } from "../jobs/testJobWorld";
import {
  findLooseGoods,
  haulableMaterialIds,
  nearestRunningBoard,
  postHaulJob,
  postHaulJobs,
  releaseOrphanedHaulReservations,
} from "./haulPoster";
import { getStorageService } from "./storageServiceRegistry";
import { haulJobId, haulPosterIntervalTicks, ReservationKind } from "./storageTypes";
import { createStorageWorld } from "./testStorageWorld";

function capture(world: ReturnType<typeof createStorageWorld>, name: string): JsonValue[] {
  const seen: JsonValue[] = [];
  world.engine.bus.subscribe(name, (payload) => seen.push(payload));
  return seen;
}

function haulPostings(world: ReturnType<typeof createStorageWorld>) {
  return requireBoard(world.engine, world.boardId).data.postings.filter(
    (posting) => posting.jobTypeId === haulJobId,
  );
}

describe("haulableMaterialIds", () => {
  it("is the outputs of the job types (logs, wheat), not personal belongings", () => {
    const world = createStorageWorld();
    const ids = haulableMaterialIds(world.engine);
    expect(ids).toContain("oak_log");
    expect(ids).toContain("wheat");
    expect(ids).not.toContain("bread");
    expect(ids).not.toContain("nails");
  });
});

describe("findLooseGoods", () => {
  it("lists pile contents and haulable citizen goods, minus reservations and carriers busy hauling", () => {
    const world = createStorageWorld();
    const pile = world.pile(15, [
      { materialId: "oak_log", quantity: 6 },
      { materialId: "bread", quantity: 2 },
    ]);
    const carrier = world.spawn("peasant", 12, noAiOverride);
    world.give(carrier, "oak_log", 4);
    expect(findLooseGoods(world.engine)).toEqual([
      { entityId: pile.id, materialId: "bread", quantity: 2 },
      { entityId: pile.id, materialId: "oak_log", quantity: 6 },
      { entityId: carrier.id, materialId: "oak_log", quantity: 4 },
    ]);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: carrier.id,
      inventoryOwnerId: pile.id,
      materialId: "oak_log",
      quantity: 5,
    });
    expect(findLooseGoods(world.engine)[1]).toMatchObject({ materialId: "oak_log", quantity: 1 });
  });

  it("ignores chests and a citizen's own bread", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    world.give(chest, "oak_log", 3);
    world.spawn("peasant", 12, noAiOverride);
    expect(findLooseGoods(world.engine)).toEqual([]);
  });
});

describe("nearestRunningBoard", () => {
  it("finds the nearest reachable board and skips a paused one", () => {
    const world = createStorageWorld();
    const pile = world.pile(55, [{ materialId: "oak_log", quantity: 1 }]);
    const near = world.spawn("job_board", 56);
    expect(nearestRunningBoard(world.engine, pile)).toBe(near.id);
    pauseBoard(world.engine, near.id, PauseSource.Player);
    expect(nearestRunningBoard(world.engine, pile)).toBe(world.boardId);
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    expect(nearestRunningBoard(world.engine, pile)).toBeNull();
  });
});

describe("postHaulJob", () => {
  it("posts a haul.deliver job naming the source cell, entity and material", () => {
    const world = createStorageWorld();
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    const posting = postHaulJob(world.engine, world.boardId, pile.id, "oak_log", 0);
    expect(posting).toMatchObject({
      jobTypeId: haulJobId,
      status: PostingStatus.Open,
      target: { mapId: world.mapId, cellIndex: 15, entityId: pile.id, materialId: "oak_log" },
    });
  });

  it("refuses a source without a position", () => {
    const world = createStorageWorld();
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    world.engine.store.removeComponent(pile.id, { name: "Position" });
    expect(() => postHaulJob(world.engine, world.boardId, pile.id, "oak_log", 0)).toThrow(
      /no position/,
    );
  });
});

describe("postHaulJobs", () => {
  it("posts one job per loose good when a storage accepts it, only on the interval", () => {
    const world = createStorageWorld();
    world.chest(55);
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    expect(postHaulJobs(world.engine, 1)).toEqual([]);
    const created = postHaulJobs(world.engine, haulPosterIntervalTicks);
    expect(created).toHaveLength(1);
    expect(haulPostings(world)[0]?.target.entityId).toBe(pile.id);
    // never twice for the same goods
    expect(postHaulJobs(world.engine, 2 * haulPosterIntervalTicks)).toEqual([]);
  });

  it("posts on the nearest running board and skips paused ones", () => {
    const world = createStorageWorld({ boardCell: 0 });
    world.chest(55);
    world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    pauseBoard(world.engine, world.boardId, PauseSource.System);
    expect(postHaulJobs(world.engine, haulPosterIntervalTicks)).toEqual([]);
    expect(haulPostings(world)).toHaveLength(0);
  });

  it("reports goods without a destination once, then posts when a storage appears", () => {
    const world = createStorageWorld();
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    const events = capture(world, "storage.no-compatible-destination");
    expect(postHaulJobs(world.engine, haulPosterIntervalTicks)).toEqual([]);
    world.engine.bus.processQueue();
    expect(events).toEqual([{ entityId: pile.id, materialId: "oak_log", quantity: 6 }]);
    expect(getStorageService(world.engine).isReported(pile.id, "oak_log")).toBe(true);
    postHaulJobs(world.engine, 2 * haulPosterIntervalTicks);
    world.engine.bus.processQueue();
    expect(events).toHaveLength(1);
    world.chest(55);
    expect(postHaulJobs(world.engine, 3 * haulPosterIntervalTicks)).toHaveLength(1);
    expect(getStorageService(world.engine).isReported(pile.id, "oak_log")).toBe(false);
  });

  it("withdraws open postings whose goods are gone or have no destination any more", () => {
    const world = createStorageWorld();
    const chest = world.chest(55);
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    const other = world.pile(16, [{ materialId: "oak_log", quantity: 2 }]);
    postHaulJobs(world.engine, haulPosterIntervalTicks);
    expect(haulPostings(world)).toHaveLength(2);
    world.engine.store.requestDelete(chest.id);
    world.engine.store.flushDeletions();
    world.engine.store.requestDelete(other.id);
    world.engine.store.flushDeletions();
    postHaulJobs(world.engine, 2 * haulPosterIntervalTicks);
    const board = requireBoard(world.engine, world.boardId).data;
    expect(board.postings.filter((posting) => posting.jobTypeId === haulJobId)).toEqual([]);
    expect(board.history.map((posting) => posting.reason)).toEqual(
      expect.arrayContaining(["source_gone", "no_destination"]),
    );
    expect(pile.id).toBeGreaterThan(0);
  });

  it("leaves claimed postings alone and removes emptied piles", () => {
    const world = createStorageWorld();
    world.chest(55);
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    const worker = world.spawn("peasant", 12, noAiOverride);
    postHaulJobs(world.engine, haulPosterIntervalTicks);
    const posting = haulPostings(world)[0];
    claimPosting(world.engine, posting?.id ?? 0, worker.id, 1);
    postHaulJobs(world.engine, 2 * haulPosterIntervalTicks);
    expect(haulPostings(world)[0]?.status).toBe(PostingStatus.Claimed);
    const emptied = world.pile(20, []);
    postHaulJobs(world.engine, 3 * haulPosterIntervalTicks);
    world.engine.store.flushDeletions();
    expect(world.engine.store.has(emptied.id)).toBe(false);
    expect(world.engine.store.has(pile.id)).toBe(true);
    expect(getTotal(pile, "oak_log")).toBe(6);
  });

  it("does nothing between the intervals", () => {
    const world = createStorageWorld();
    world.chest(55);
    world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    expect(postHaulJobs(world.engine, 1)).toEqual([]);
  });
});

describe("releaseOrphanedHaulReservations", () => {
  it("releases haul reservations whose holder has no haul task, keeps other kinds", () => {
    const world = createStorageWorld();
    const pile = world.pile(15, [{ materialId: "oak_log", quantity: 6 }]);
    const worker = world.spawn("peasant", 12, noAiOverride);
    const reservations = getStorageService(world.engine).reservations;
    reservations.reserve({
      kind: ReservationKind.Haul,
      holderId: worker.id,
      inventoryOwnerId: pile.id,
      materialId: "oak_log",
      quantity: 2,
    });
    reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: worker.id,
      inventoryOwnerId: pile.id,
      materialId: "oak_log",
      quantity: 2,
    });
    expect(releaseOrphanedHaulReservations(world.engine)).toBe(1);
    expect(reservations.all().map((entry) => entry.kind)).toEqual([ReservationKind.Lock]);
  });
});
