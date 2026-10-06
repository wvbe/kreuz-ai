import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { requireBoard } from "../jobs/jobBoards";
import { positionComponent } from "../map/positionComponent";
import { createDeliverTask } from "./createDeliverTask";
import { deliverTaskOf } from "./crierQueries";
import { getCrierService } from "./crierServiceRegistry";
import { CrierStatus, DeliveryMethod, deliverTaskType } from "./crierTypes";
import { createCrierWorld } from "./testCrierWorld";
import type { CrierTestWorld } from "./testCrierWorld";
import { townCrierComponent } from "./townCrierComponent";

function listen(world: CrierTestWorld, name: string): JsonValue[] {
  const seen: JsonValue[] = [];
  world.engine.bus.subscribe(name, (payload) => seen.push(payload));
  return seen;
}

function postFrom(world: CrierTestWorld, cell: number): number {
  const result = world.command("PostJob", {
    boardId: world.boardId,
    jobTypeId: "fell.trees",
    mapId: world.mapId,
    cellIndex: cell,
  }) as { updateId: number };
  return result.updateId;
}

describe("createDeliverTask", () => {
  it("is the handler of towncrier.deliver and needs a position", () => {
    const world = createCrierWorld();
    const handler = createDeliverTask(world.engine);
    expect(handler.type).toBe(deliverTaskType);
    expect(handler.requires).toEqual(["Position"]);
  });

  it("walks to the board, applies the update on arrival and is free again", () => {
    const world = createCrierWorld({ boardCell: 0 });
    const crier = world.spawnCrier(99);
    const applied = listen(world, "jobboard.update.applied");
    postFrom(world, 15);
    world.run(1);
    expect(requireBoard(world.engine, world.boardId).data.postings).toEqual([]);
    expect(getComponent(crier, townCrierComponent)?.status).toBe(CrierStatus.Traveling);
    let ticks = 0;
    while (requireBoard(world.engine, world.boardId).data.postings.length === 0 && ticks < 200) {
      world.run(1);
      ticks += 1;
    }
    expect(requireBoard(world.engine, world.boardId).data.postings).toHaveLength(1);
    expect(ticks).toBeGreaterThan(5);
    expect(getComponent(crier, positionComponent)?.cellIndex).toBe(0);
    world.run(2);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ boardId: world.boardId, via: "TownCrier" });
    expect(getComponent(crier, townCrierComponent)).toEqual({
      status: CrierStatus.Available,
      boardQueue: [],
      carrying: [],
    });
    expect(deliverTaskOf(world.engine, crier.id)).toBeUndefined();
  });

  it("applies at once when the crier already stands on the board", () => {
    const world = createCrierWorld({ boardCell: 0 });
    world.spawnCrier(0);
    postFrom(world, 15);
    world.run(2);
    expect(requireBoard(world.engine, world.boardId).data.postings).toHaveLength(1);
  });

  it("travel time grows with the distance to the board", () => {
    const arrival = (cell: number): number => {
      const world = createCrierWorld({ boardCell: 0 });
      world.spawnCrier(cell);
      postFrom(world, 15);
      let ticks = 0;
      while (requireBoard(world.engine, world.boardId).data.postings.length === 0 && ticks < 300) {
        world.run(1);
        ticks += 1;
      }
      return ticks;
    };
    expect(arrival(99)).toBeGreaterThan(arrival(22));
  });

  it("abandons the load when the board is deleted on the way and the crier is free again", () => {
    const world = createCrierWorld({ boardCell: 0 });
    const crier = world.spawnCrier(99);
    const abandoned = listen(world, "jobboard.update.abandoned");
    postFrom(world, 15);
    world.run(3);
    world.engine.store.requestDelete(world.boardId);
    world.run(3);
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({ reason: "board_gone" });
    expect(getComponent(crier, townCrierComponent)?.status).toBe(CrierStatus.Available);
  });

  it("walks to a Notice Post that serves the board and applies the update there", () => {
    const world = createCrierWorld({ boardCell: 0, width: 30, height: 30 });
    const post = world.spawn("chest", 400);
    getCrierService(world.engine).setRouter(() => ({
      destinationId: post.id,
      via: DeliveryMethod.NoticePost,
    }));
    const crier = world.spawnCrier(405);
    const applied = listen(world, "jobboard.update.applied");
    postFrom(world, 15);
    world.run(1);
    expect(getComponent(crier, townCrierComponent)?.boardQueue).toEqual([post.id]);
    world.run(60);
    expect(requireBoard(world.engine, world.boardId).data.postings).toHaveLength(1);
    expect(getComponent(crier, positionComponent)?.cellIndex).toBe(400);
    expect(applied[0]).toMatchObject({ boardId: world.boardId, via: "NoticePost" });
    expect(getComponent(crier, townCrierComponent)?.status).toBe(CrierStatus.Available);
  });

  it("hands the update back to the queue when the Notice Post vanishes on the way", () => {
    const world = createCrierWorld({ boardCell: 0, width: 30, height: 30 });
    const post = world.spawn("chest", 400);
    const service = getCrierService(world.engine);
    service.setRouter(() =>
      world.engine.store.get(post.id) === undefined
        ? null
        : { destinationId: post.id, via: DeliveryMethod.NoticePost },
    );
    const crier = world.spawnCrier(899);
    const abandoned = listen(world, "jobboard.update.abandoned");
    postFrom(world, 15);
    world.run(3);
    world.engine.store.requestDelete(post.id);
    world.run(3);
    expect(abandoned).toEqual([]);
    world.run(600);
    expect(getComponent(crier, townCrierComponent)?.status).toBe(CrierStatus.Available);
    expect(requireBoard(world.engine, world.boardId).data.postings).toHaveLength(1);
  });
});
