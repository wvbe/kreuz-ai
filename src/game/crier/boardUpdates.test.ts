import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { requireBoard } from "../jobs/jobBoards";
import { JobError, JobErrorKind } from "../jobs/JobError";
import { JobBoardMode } from "../jobs/jobTypes";
import {
  abandonUpdate,
  applyBoardUpdate,
  cancelBoardUpdate,
  cancelledByPlayerReason,
  detachFromCrier,
  queueBoardUpdate,
} from "./boardUpdates";
import { getCrierService } from "./crierServiceRegistry";
import { BoardChangeKind, CrierStatus, DeliveryMethod, UpdateOrigin } from "./crierTypes";
import type { BoardChange } from "./crierTypes";
import { createCrierWorld } from "./testCrierWorld";
import type { CrierTestWorld } from "./testCrierWorld";
import { getComponent } from "../ecs/Entity";
import { townCrierComponent } from "./townCrierComponent";

function listen(world: CrierTestWorld, name: string): JsonValue[] {
  const seen: JsonValue[] = [];
  world.engine.bus.subscribe(name, (payload) => seen.push(payload));
  return seen;
}

function add(
  world: CrierTestWorld,
  cellIndex = 15,
): Extract<BoardChange, { kind: BoardChangeKind.Add }> {
  return {
    kind: BoardChangeKind.Add,
    jobTypeId: "fell.trees",
    mapId: world.mapId,
    cellIndex,
    entityId: null,
    materialId: null,
    priority: 70,
    urgent: false,
    wage: 5,
  };
}

function kindOf(action: () => object): JobErrorKind | null {
  try {
    action();
  } catch (failure) {
    return failure instanceof JobError ? failure.kind : null;
  }
  return null;
}

// @covers 017:FR-008 017:FR-009 017:FR-010 017:FR-013 017:FR-015
describe("queueBoardUpdate", () => {
  it("queues a change, leaves the board alone and announces it", () => {
    const world = createCrierWorld();
    const queued = listen(world, "jobboard.update.queued");
    const update = queueBoardUpdate(world.engine, world.boardId, add(world), UpdateOrigin.Player);
    expect(update).toMatchObject({ updateId: 1, boardId: world.boardId, crierId: null });
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    world.run(1);
    expect(queued).toEqual([{ updateId: 1, boardId: world.boardId, origin: "Player" }]);
  });

  it("rejects a system-managed board, an unknown job type and a posting that is not there", () => {
    const world = createCrierWorld();
    expect(
      kindOf(() =>
        queueBoardUpdate(
          world.engine,
          world.boardId,
          { ...add(world), jobTypeId: "nope" },
          UpdateOrigin.Player,
        ),
      ),
    ).toBe(JobErrorKind.UnknownJobType);
    expect(
      kindOf(() =>
        queueBoardUpdate(
          world.engine,
          world.boardId,
          { kind: BoardChangeKind.Remove, postingId: 3 },
          UpdateOrigin.Player,
        ),
      ),
    ).toBe(JobErrorKind.UnknownPosting);
    requireBoard(world.engine, world.boardId).data.mode = JobBoardMode.SystemManaged;
    expect(
      kindOf(() => queueBoardUpdate(world.engine, world.boardId, add(world), UpdateOrigin.Player)),
    ).toBe(JobErrorKind.BoardNotUserManaged);
    expect(getCrierService(world.engine).updates()).toEqual([]);
  });
});

describe("applyBoardUpdate", () => {
  it("posts, modifies and removes, then reports the delivery method", () => {
    const world = createCrierWorld();
    const applied = listen(world, "jobboard.update.applied");
    const addId = queueBoardUpdate(
      world.engine,
      world.boardId,
      add(world),
      UpdateOrigin.Player,
    ).updateId;
    expect(applyBoardUpdate(world.engine, addId, DeliveryMethod.TownCrier)).toBe(true);
    const posting = requireBoard(world.engine, world.boardId).data.postings[0];
    expect(posting).toMatchObject({ priority: 70, wage: 5 });
    const modifyId = queueBoardUpdate(
      world.engine,
      world.boardId,
      { kind: BoardChangeKind.Modify, postingId: posting?.id ?? 0, priority: 10, wage: null },
      UpdateOrigin.Player,
    ).updateId;
    applyBoardUpdate(world.engine, modifyId, DeliveryMethod.NoticePost);
    expect(requireBoard(world.engine, world.boardId).data.postings[0]).toMatchObject({
      priority: 10,
      wage: 5,
    });
    const removeId = queueBoardUpdate(
      world.engine,
      world.boardId,
      { kind: BoardChangeKind.Remove, postingId: posting?.id ?? 0 },
      UpdateOrigin.Player,
    ).updateId;
    applyBoardUpdate(world.engine, removeId, DeliveryMethod.BellTower);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    world.run(1);
    expect(applied.map((entry) => (entry as { via: string }).via)).toEqual([
      "TownCrier",
      "NoticePost",
      "BellTower",
    ]);
    expect(getCrierService(world.engine).updates()).toEqual([]);
    expect(applyBoardUpdate(world.engine, addId, DeliveryMethod.TownCrier)).toBe(false);
  });

  it("abandons an update whose posting finished meanwhile (change_rejected)", () => {
    const world = createCrierWorld();
    const abandoned = listen(world, "jobboard.update.abandoned");
    const first = queueBoardUpdate(world.engine, world.boardId, add(world), UpdateOrigin.Player);
    applyBoardUpdate(world.engine, first.updateId, DeliveryMethod.TownCrier);
    const posting = requireBoard(world.engine, world.boardId).data.postings[0];
    const modify = queueBoardUpdate(
      world.engine,
      world.boardId,
      { kind: BoardChangeKind.Modify, postingId: posting?.id ?? 0, priority: 1, wage: null },
      UpdateOrigin.Player,
    );
    requireBoard(world.engine, world.boardId).data.postings = [];
    expect(applyBoardUpdate(world.engine, modify.updateId, DeliveryMethod.TownCrier)).toBe(false);
    world.run(1);
    expect(abandoned).toEqual([
      { updateId: modify.updateId, boardId: world.boardId, reason: "change_rejected" },
    ]);
  });

  it("abandons an update when the board is gone", () => {
    const world = createCrierWorld();
    const abandoned = listen(world, "jobboard.update.abandoned");
    const update = queueBoardUpdate(world.engine, world.boardId, add(world), UpdateOrigin.Player);
    world.engine.store.requestDelete(world.boardId);
    world.engine.store.flushDeletions();
    expect(applyBoardUpdate(world.engine, update.updateId, DeliveryMethod.TownCrier)).toBe(false);
    world.run(1);
    expect(abandoned).toEqual([
      { updateId: update.updateId, boardId: world.boardId, reason: "board_gone" },
    ]);
  });
});

describe("abandonUpdate and cancelBoardUpdate", () => {
  it("drops the update and frees the crier that carried only it", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(55);
    const update = queueBoardUpdate(world.engine, world.boardId, add(world), UpdateOrigin.Player);
    getCrierService(world.engine).assign([update.updateId], crier.id, 1, 50);
    const data = getComponent(crier, townCrierComponent);
    if (data !== undefined) {
      data.status = CrierStatus.Traveling;
      data.carrying = [update.updateId];
      data.boardQueue = [world.boardId];
    }
    expect(abandonUpdate(world.engine, update.updateId, "because")).toBe(true);
    expect(abandonUpdate(world.engine, update.updateId, "because")).toBe(false);
    expect(getComponent(crier, townCrierComponent)).toEqual({
      status: CrierStatus.Available,
      boardQueue: [],
      carrying: [],
    });
  });

  it("cancels a pending update with the player reason and fails for an unknown one", () => {
    const world = createCrierWorld();
    const abandoned = listen(world, "jobboard.update.abandoned");
    const update = queueBoardUpdate(world.engine, world.boardId, add(world), UpdateOrigin.Player);
    cancelBoardUpdate(world.engine, update.updateId);
    world.run(1);
    expect(abandoned).toEqual([
      { updateId: update.updateId, boardId: world.boardId, reason: cancelledByPlayerReason },
    ]);
    expect(kindOf(() => ({ done: cancelBoardUpdate(world.engine, update.updateId) }))).toBe(
      JobErrorKind.UnknownUpdate,
    );
  });
});

describe("detachFromCrier", () => {
  it("keeps a crier busy while it still carries another update", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(55);
    const data = getComponent(crier, townCrierComponent);
    if (data !== undefined) {
      data.status = CrierStatus.Traveling;
      data.carrying = [1, 2];
      data.boardQueue = [world.boardId];
    }
    detachFromCrier(world.engine, crier.id, 1);
    expect(getComponent(crier, townCrierComponent)?.carrying).toEqual([2]);
    expect(getComponent(crier, townCrierComponent)?.status).toBe(CrierStatus.Traveling);
    detachFromCrier(world.engine, crier.id, 2);
    expect(getComponent(crier, townCrierComponent)?.status).toBe(CrierStatus.Available);
    detachFromCrier(world.engine, 9999, 1);
  });
});

describe("Steward runs", () => {
  it("queues a run on a user-managed board and starts it through the applier on delivery", () => {
    const world = createCrierWorld();
    const started: number[] = [];
    getCrierService(world.engine).setRunApplier((runId) => {
      started.push(runId);
      return true;
    });
    const update = queueBoardUpdate(
      world.engine,
      world.boardId,
      { kind: BoardChangeKind.Run, runId: 4 },
      UpdateOrigin.Steward,
    );
    expect(update.changes).toEqual([{ kind: BoardChangeKind.Run, runId: 4 }]);
    expect(applyBoardUpdate(world.engine, update.updateId, DeliveryMethod.BellTower)).toBe(true);
    expect(started).toEqual([4]);
    expect(getCrierService(world.engine).find(update.updateId)).toBeNull();
  });

  it("abandons the update when the run can no longer start", () => {
    const world = createCrierWorld();
    getCrierService(world.engine).setRunApplier(() => false);
    const abandoned = listen(world, "jobboard.update.abandoned");
    const update = queueBoardUpdate(
      world.engine,
      world.boardId,
      { kind: BoardChangeKind.Run, runId: 4 },
      UpdateOrigin.Steward,
    );
    expect(applyBoardUpdate(world.engine, update.updateId, DeliveryMethod.TownCrier)).toBe(false);
    world.run(1);
    expect(abandoned).toEqual([
      { updateId: update.updateId, boardId: world.boardId, reason: "change_rejected" },
    ]);
  });
});
