import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { queueBoardUpdate } from "./boardUpdates";
import { deliverTaskOf } from "./crierQueries";
import { getCrierService } from "./crierServiceRegistry";
import {
  BoardChangeKind,
  CrierStatus,
  DeliveryMethod,
  UpdateOrigin,
  deliverTaskType,
} from "./crierTypes";
import { dispatchCriers, recoverCriers } from "./dispatchCriers";
import { createCrierWorld } from "./testCrierWorld";
import type { CrierTestWorld } from "./testCrierWorld";
import { townCrierComponent } from "./townCrierComponent";
import { requireBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import type { EntityId } from "../ecs/Entity";

function post(world: CrierTestWorld, cellIndex = 15) {
  return queueBoardUpdate(
    world.engine,
    world.boardId,
    {
      kind: BoardChangeKind.Add,
      jobTypeId: "fell.trees",
      mapId: world.mapId,
      cellIndex,
      entityId: null,
      materialId: null,
      priority: null,
      urgent: false,
      wage: null,
    },
    UpdateOrigin.Player,
  );
}

function postOn(world: CrierTestWorld, boardId: EntityId) {
  return queueBoardUpdate(
    world.engine,
    boardId,
    {
      kind: BoardChangeKind.Add,
      jobTypeId: "fell.trees",
      mapId: world.mapId,
      cellIndex: 15,
      entityId: null,
      materialId: null,
      priority: null,
      urgent: false,
      wage: null,
    },
    UpdateOrigin.Player,
  );
}

function listen(world: CrierTestWorld, name: string): JsonValue[] {
  const seen: JsonValue[] = [];
  world.engine.bus.subscribe(name, (payload) => seen.push(payload));
  return seen;
}

describe("dispatchCriers", () => {
  it("sends the nearest free crier with every waiting update of the board", () => {
    const world = createCrierWorld();
    const far = world.spawnCrier(99);
    const near = world.spawnCrier(22);
    const dispatched = listen(world, "towncrier.dispatched");
    post(world);
    post(world, 16);
    dispatchCriers(world.engine, 4);
    expect(getComponent(near, townCrierComponent)).toEqual({
      status: CrierStatus.Traveling,
      boardQueue: [world.boardId],
      carrying: [1, 2],
    });
    expect(getComponent(far, townCrierComponent)?.status).toBe(CrierStatus.Available);
    expect(getCrierService(world.engine).find(1)).toMatchObject({
      crierId: near.id,
      dispatchedTick: 4,
    });
    expect(deliverTaskOf(world.engine, near.id)).toMatchObject({ type: deliverTaskType });
    world.run(1);
    expect(dispatched).toEqual([{ crierId: near.id, boardIds: [world.boardId] }]);
  });

  it("leaves updates waiting when no crier is free and sends the next one for new changes", () => {
    const world = createCrierWorld();
    const only = world.spawnCrier(22);
    post(world);
    dispatchCriers(world.engine, 1);
    post(world, 16);
    dispatchCriers(world.engine, 2);
    expect(getCrierService(world.engine).find(2)?.crierId).toBeNull();
    const second = world.spawnCrier(33);
    dispatchCriers(world.engine, 3);
    expect(getCrierService(world.engine).find(2)?.crierId).toBe(second.id);
    expect(getComponent(only, townCrierComponent)?.carrying).toEqual([1]);
  });

  it("does nothing without criers and abandons updates of a board that is gone", () => {
    const world = createCrierWorld();
    const abandoned = listen(world, "jobboard.update.abandoned");
    post(world);
    dispatchCriers(world.engine, 1);
    expect(getCrierService(world.engine).find(1)?.crierId).toBeNull();
    world.spawnCrier(22);
    world.engine.store.requestDelete(world.boardId);
    world.engine.store.flushDeletions();
    dispatchCriers(world.engine, 2);
    world.run(1);
    expect(abandoned).toEqual([{ updateId: 1, boardId: world.boardId, reason: "board_gone" }]);
  });
});

describe("dispatchCriers with a Notice Post", () => {
  it("sends one crier to the post with the updates of every board it serves", () => {
    const world = createCrierWorld({ width: 20, height: 20 });
    const second = world.spawn("job_board", 5);
    requireBoard(world.engine, second.id).data.mode = JobBoardMode.UserManaged;
    const crier = world.spawnCrier(250);
    const post = world.spawn("chest", 200);
    getCrierService(world.engine).setRouter(() => ({
      destinationId: post.id,
      via: DeliveryMethod.NoticePost,
    }));
    postOn(world, world.boardId);
    postOn(world, second.id);
    dispatchCriers(world.engine, 4);
    expect(getComponent(crier, townCrierComponent)).toEqual({
      status: CrierStatus.Traveling,
      boardQueue: [post.id],
      carrying: [1, 2],
    });
    expect(deliverTaskOf(world.engine, crier.id)?.data).toEqual({ boardId: post.id });
  });
});

describe("recoverCriers", () => {
  it("gives a walking crier a new task when its walk was interrupted", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(22);
    post(world);
    dispatchCriers(world.engine, 1);
    const task = deliverTaskOf(world.engine, crier.id);
    if (task !== undefined) {
      world.engine.tasks.cancel(crier.id, task.id);
    }
    world.run(1);
    recoverCriers(world.engine);
    expect(deliverTaskOf(world.engine, crier.id)).toBeDefined();
    expect(getComponent(crier, townCrierComponent)?.status).toBe(CrierStatus.Traveling);
  });

  it("frees a crier whose load is gone and cancels its stale walk", () => {
    const world = createCrierWorld();
    const crier = world.spawnCrier(22);
    post(world);
    dispatchCriers(world.engine, 1);
    getCrierService(world.engine).remove(1);
    recoverCriers(world.engine);
    expect(getComponent(crier, townCrierComponent)).toEqual({
      status: CrierStatus.Available,
      boardQueue: [],
      carrying: [],
    });
    world.run(2);
    expect(deliverTaskOf(world.engine, crier.id)).toBeUndefined();
  });
});
