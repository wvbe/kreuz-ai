import { describe, expect, it } from "vitest";
import { getCrierService } from "../crier/crierServiceRegistry";
import { DeliveryMethod } from "../crier/crierTypes";
import { getBoard, requireBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import {
  activeBellTowers,
  listNoticePosts,
  noticePostRoute,
  ringBells,
  servingBell,
  servingPost,
} from "./deliveryRouting";
import { createStandingWorld } from "./testStandingWorld";
import type { StandingTestWorld } from "./testStandingWorld";

function world60(): StandingTestWorld {
  return createStandingWorld({ width: 60, height: 4, boardCell: 0 });
}

function boardAt(world: StandingTestWorld, cell: number): number {
  const board = world.spawn("job_board", cell);
  const found = getBoard(world.engine, board.id);
  if (found !== null) {
    found.data.mode = JobBoardMode.UserManaged;
  }
  return board.id;
}

function queueAdd(world: StandingTestWorld, boardId: number): void {
  world.command("PostJob", {
    boardId,
    jobTypeId: "fell.trees",
    mapId: world.mapId,
    cellIndex: 100,
  });
}

describe("listNoticePosts and servingPost", () => {
  it("lists the posts ascending by id", () => {
    const world = world60();
    const first = world.furniture(10, "notice_post");
    const second = world.furniture(30, "notice_post");
    world.furniture(40, "chest");
    expect(listNoticePosts(world.engine).map((post) => post.id)).toEqual([first.id, second.id]);
  });

  // @covers 026:FR-021
  it("serves a board within noticePostRadius hops and no board beyond it", () => {
    const world = world60();
    const board = boardAt(world, 20);
    const radius = world.engine.content.constants.noticePostRadius;
    const near = world.furniture(20 - radius, "notice_post");
    expect(servingPost(world.engine, board)).toBe(near.id);
    world.engine.store.requestDelete(near.id);
    world.run(1);
    world.furniture(20 - radius - 1, "notice_post");
    expect(servingPost(world.engine, board)).toBeNull();
  });

  it("prefers the nearer post and breaks ties by the lowest entity id", () => {
    const world = world60();
    const board = boardAt(world, 30);
    world.furniture(40, "notice_post");
    const tieLow = world.furniture(26, "notice_post");
    world.furniture(34, "notice_post");
    expect(servingPost(world.engine, board)).toBe(tieLow.id);
    const nearer = world.furniture(32, "notice_post");
    expect(servingPost(world.engine, board)).toBe(nearer.id);
  });

  it("passes over a post that no walker can connect to the board", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const board = boardAt(world, 5 * 20 + 5);
    for (const cell of [4 * 20 + 5, 6 * 20 + 5, 5 * 20 + 4, 5 * 20 + 6]) {
      world.spawn("wall", cell);
    }
    world.run(1);
    world.furniture(5 * 20 + 9, "notice_post");
    expect(servingPost(world.engine, board)).toBeNull();
  });

  it("has no answer for a board without a position", () => {
    const world = world60();
    expect(servingPost(world.engine, 9999)).toBeNull();
  });
});

describe("noticePostRoute and the crier", () => {
  it("routes a served board to its post with the method NoticePost", () => {
    const world = world60();
    const board = boardAt(world, 20);
    expect(noticePostRoute(world.engine, board)).toBeNull();
    const post = world.furniture(25, "notice_post");
    expect(noticePostRoute(world.engine, board)).toEqual({
      destinationId: post.id,
      via: DeliveryMethod.NoticePost,
    });
    expect(getCrierService(world.engine).route(board).destinationId).toBe(post.id);
  });

  // @covers 026:FR-021 026:FR-023
  it("delivers an update of a served board at the post (via NoticePost)", () => {
    const world = world60();
    const board = boardAt(world, 50);
    const post = world.furniture(45, "notice_post");
    const crier = world.crier(40);
    const applied = world.record("jobboard.update.applied");
    queueAdd(world, board);
    world.run(60);
    expect(requireBoard(world.engine, board).data.postings).toHaveLength(1);
    expect(applied).toEqual([{ updateId: 1, boardId: board, via: "NoticePost" }]);
    expect(world.engine.store.require(crier.id)).toBeDefined();
    expect(post.id).toBeGreaterThan(0);
  });
});

describe("activeBellTowers and ringBells", () => {
  function towerWorld(): StandingTestWorld {
    const world = world60();
    world.furniture(0, "church_bell");
    world.zone("bell_tower", [0]);
    world.run(1);
    return world;
  }

  // @covers 026:FR-022
  it("lists a bell tower while its zone is active and holds a bell", () => {
    const world = towerWorld();
    const towers = activeBellTowers(world.engine);
    expect(towers).toHaveLength(1);
    expect(towers[0]).toMatchObject({ mapId: world.mapId, cellIndex: 0 });
    const bell = world.engine.store
      .entities()
      .find((entity) => entity.components["Furniture"] !== undefined);
    world.engine.store.requestDelete((bell as NonNullable<typeof bell>).id);
    world.run(2);
    expect(activeBellTowers(world.engine)).toEqual([]);
  });

  it("finds the tower whose ring reaches a board (FR-022)", () => {
    const world = towerWorld();
    const radius = world.engine.content.constants.bellRadius;
    const near = boardAt(world, radius - 5);
    const far = boardAt(world, radius + 5);
    expect(servingBell(world.engine, near)?.cellIndex).toBe(0);
    expect(servingBell(world.engine, far)).toBeNull();
    expect(servingBell(world.engine, 9999)).toBeNull();
  });

  it("does not ring outside the ring ticks", () => {
    const world = towerWorld();
    const board = boardAt(world, 10);
    queueAdd(world, board);
    expect(ringBells(world.engine, 1)).toBe(0);
    expect(getCrierService(world.engine).updates()).toHaveLength(1);
  });

  // @covers 026:FR-022 026:FR-023
  it("rings, announces itself and applies the updates within bellRadius, queued or on a crier", () => {
    const world = towerWorld();
    const radius = world.engine.content.constants.bellRadius;
    const near = boardAt(world, radius - 5);
    const far = boardAt(world, radius + 5);
    const crier = world.crier(58);
    const rang = world.record("bell-tower.rang");
    const applied = world.record("jobboard.update.applied");
    queueAdd(world, near);
    world.run(1);
    queueAdd(world, near);
    queueAdd(world, far);
    const ring = world.engine.content.constants.bellRingTicksOfDay[0] as number;
    expect(ringBells(world.engine, ring)).toBe(2);
    world.run(2);
    expect(rang).toEqual([{ zoneId: activeBellTowers(world.engine)[0]?.zoneId, tickOfDay: ring }]);
    expect(applied.map((entry) => (entry as { via: string }).via)).toEqual([
      "BellTower",
      "BellTower",
    ]);
    expect(requireBoard(world.engine, near).data.postings).toHaveLength(2);
    expect(requireBoard(world.engine, far).data.postings).toHaveLength(0);
    expect(
      getCrierService(world.engine)
        .updates()
        .map((update) => update.boardId),
    ).toEqual([far]);
    expect(crier.id).toBeGreaterThan(0);
  });

  it("frees a crier whose whole load the bell delivered", () => {
    const world = towerWorld();
    const near = boardAt(world, 15);
    const crier = world.crier(55);
    queueAdd(world, near);
    world.run(2);
    expect(world.engine.tasks.getQueue(crier.id)?.tasks.length).toBeGreaterThan(0);
    ringBells(world.engine, world.engine.content.constants.bellRingTicksOfDay[0] as number);
    world.run(2);
    expect(world.engine.tasks.getQueue(crier.id)?.tasks.map((task) => task.type)).not.toContain(
      "towncrier.deliver",
    );
    expect(requireBoard(world.engine, near).data.postings).toHaveLength(1);
  });
});
