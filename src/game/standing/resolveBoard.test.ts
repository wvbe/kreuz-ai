import { describe, expect, it } from "vitest";
import { getBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import { nearestUserBoard, resolvePostingBoard } from "./resolveBoard";
import { getStandingService } from "./standingServiceRegistry";
import { createStandingWorld } from "./testStandingWorld";

function setup() {
  const world = createStandingWorld({ width: 20, height: 20, boardCell: 0 });
  world.throneRoom(5, 5);
  return world;
}

function userBoardAt(world: ReturnType<typeof setup>, cell: number): number {
  const board = world.spawn("job_board", cell);
  const found = getBoard(world.engine, board.id);
  if (found === null) {
    throw new Error("no board");
  }
  found.data.mode = JobBoardMode.UserManaged;
  return board.id;
}

describe("nearestUserBoard", () => {
  it("is null without a seat or a user-managed board", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    expect(nearestUserBoard(world.engine)).toBeNull();
    world.throneRoom(5, 5);
    expect(nearestUserBoard(world.engine)).toBeNull();
  });

  it("takes the user-managed board with the cheapest walk from the throne room", () => {
    const world = setup();
    world.userBoard();
    const near = userBoardAt(world, 3 * 20 + 6);
    expect(nearestUserBoard(world.engine)).toBe(near);
  });

  it("breaks ties by the lowest entity id and skips unreachable boards", () => {
    const world = setup();
    const first = userBoardAt(world, 5 * 20 + 12);
    userBoardAt(world, 12 * 20 + 5);
    expect(nearestUserBoard(world.engine)).toBe(first);
    for (const cell of [14 * 20 + 15, 16 * 20 + 15, 15 * 20 + 14, 15 * 20 + 16]) {
      world.spawn("wall", cell);
    }
    const sealed = userBoardAt(world, 15 * 20 + 15);
    expect(sealed).toBeGreaterThan(first);
    expect(nearestUserBoard(world.engine)).toBe(first);
  });
});

describe("resolvePostingBoard", () => {
  it("prefers the order's board, then the Steward's board, then the nearest one", () => {
    const world = setup();
    const near = userBoardAt(world, 7 * 20 + 7);
    const stewardBoard = userBoardAt(world, 12 * 20 + 12);
    const own = userBoardAt(world, 15 * 20 + 3);
    const id = world.standing({ materialId: "bread" });
    const order = world.orderOf(id);
    expect(resolvePostingBoard(world.engine, order)).toBe(near);
    getStandingService(world.engine).state.stewardBoardId = stewardBoard;
    expect(resolvePostingBoard(world.engine, order)).toBe(stewardBoard);
    order.postingBoardId = own;
    expect(resolvePostingBoard(world.engine, order)).toBe(own);
  });

  it("falls back when the chosen board is gone or no longer user-managed", () => {
    const world = setup();
    const near = userBoardAt(world, 7 * 20 + 7);
    const own = userBoardAt(world, 15 * 20 + 3);
    const id = world.standing({ materialId: "bread" });
    const order = world.orderOf(id);
    order.postingBoardId = own;
    const found = getBoard(world.engine, own);
    if (found !== null) {
      found.data.mode = JobBoardMode.SystemManaged;
    }
    expect(resolvePostingBoard(world.engine, order)).toBe(near);
    order.postingBoardId = 9999;
    getStandingService(world.engine).state.stewardBoardId = 9998;
    expect(resolvePostingBoard(world.engine, order)).toBe(near);
  });
});
