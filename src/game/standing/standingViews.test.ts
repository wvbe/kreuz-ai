import { describe, expect, it } from "vitest";
import {
  buildOrderDetail,
  buildOrderView,
  buildOrderViews,
  buildStewardView,
} from "./standingViews";
import { RunStatus, StandingOrderScope, StandingOrderState } from "./standingTypes";
import { createStandingWorld } from "./testStandingWorld";
import type { StandingTestWorld } from "./testStandingWorld";

function readyWorld(): StandingTestWorld {
  const world = createStandingWorld({ width: 20, height: 20 });
  world.userBoard();
  world.throneRoom(5, 5);
  world.steward(2);
  world.spawn("sawmill", 30);
  return world;
}

describe("buildOrderView and buildOrderViews", () => {
  it("shows the fields, the counted stock and the derived state of an order", () => {
    const world = readyWorld();
    world.give(world.chest(31), "oak_plank", 17);
    const id = world.standing();
    expect(buildOrderView(world.engine, world.orderOf(id))).toEqual({
      orderId: id,
      materialId: "oak_plank",
      recipeId: "saw_oak_planks",
      targetQuantity: 20,
      restockThreshold: 15,
      scope: StandingOrderScope.Settlement,
      zoneId: null,
      priority: 50,
      postingBoardId: null,
      paused: false,
      state: StandingOrderState.Satisfied,
      outputPerRun: 2,
      countedStock: 17,
      pendingAdd: 0,
      open: 0,
      claimed: 0,
      blocked: null,
    });
  });

  it("counts the runs by status and names the primary blocked reason", () => {
    const world = readyWorld();
    world.crier(1);
    const id = world.standing();
    world.runToReview();
    let view = buildOrderView(world.engine, world.orderOf(id));
    expect(view).toMatchObject({ pendingAdd: 5, open: 0, claimed: 0 });
    expect(view.blocked?.kind).toBe("MissingInput");
    world.run(150);
    world.claim(1);
    view = buildOrderView(world.engine, world.orderOf(id));
    expect(view).toMatchObject({
      pendingAdd: 0,
      open: 4,
      claimed: 1,
      state: StandingOrderState.Blocked,
    });
    expect(view.blocked).toMatchObject({ kind: "MissingInput" });
  });

  it("reports Paused without a blocked reason and lists live orders ascending", () => {
    const world = readyWorld();
    const bread = world.standing({ materialId: "bread" });
    const flour = world.standing({ materialId: "flour", recipeId: "grind_flour" });
    world.command("PauseStandingOrder", { orderId: bread });
    world.command("DeleteStandingOrder", { orderId: flour });
    const views = buildOrderViews(world.engine);
    expect(views.map((view) => view.orderId)).toEqual([bread]);
    expect(views[0]).toMatchObject({ state: StandingOrderState.Paused, blocked: null });
  });
});

describe("buildOrderDetail", () => {
  it("adds every reason, the resolved board and each run", () => {
    const world = readyWorld();
    const id = world.standing();
    world.runToReview();
    const detail = buildOrderDetail(world.engine, id);
    expect(detail?.resolvedBoardId).toBe(world.boardId);
    expect(detail?.runs).toHaveLength(5);
    expect(detail?.runs[0]).toMatchObject({
      runId: 1,
      status: RunStatus.PendingAdd,
      boardId: world.boardId,
      productionOrderId: null,
    });
    expect(detail?.reasons.length).toBeGreaterThan(0);
  });

  it("is null for an unknown or deleted order", () => {
    const world = readyWorld();
    const id = world.standing();
    expect(buildOrderDetail(world.engine, 99)).toBeNull();
    world.command("DeleteStandingOrder", { orderId: id });
    expect(buildOrderDetail(world.engine, id)).toBeNull();
  });
});

describe("buildStewardView", () => {
  it("shows the office, the seat, the next review and the Notice Posts", () => {
    const world = readyWorld();
    world.furniture(60, "notice_post");
    world.standing();
    const view = buildStewardView(world.engine);
    expect(view).toMatchObject({
      seatZoneId: expect.any(Number),
      lastReviewTick: null,
      extraReviewRequested: false,
      orders: 1,
      stewardBoardId: null,
    });
    expect(view.stewardEntityId).not.toBeNull();
    expect(view.nextReviewTick).toBe(72);
    expect(view.noticePosts).toHaveLength(1);
    world.runToReview();
    world.command("RequestStewardReview", {});
    const later = buildStewardView(world.engine);
    expect(later.lastReviewTick).toBe(72);
    expect(later.nextReviewTick).toBe(360);
    expect(later.extraReviewRequested).toBe(true);
  });

  it("has no seat and no Steward in a fresh game", () => {
    const world = createStandingWorld();
    expect(buildStewardView(world.engine)).toMatchObject({
      stewardEntityId: null,
      seatZoneId: null,
      orders: 0,
    });
  });
});
