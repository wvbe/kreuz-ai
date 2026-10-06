import { describe, expect, it } from "vitest";
import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import { runStatus } from "./ownedRuns";
import {
  createStandingOrder,
  defaultThreshold,
  deleteStandingOrder,
  dropFinishedOrders,
  setStandingOrderPaused,
  updateStandingOrder,
} from "./standingOrders";
import { StandingOrderError } from "./StandingOrderError";
import { getStandingService } from "./standingServiceRegistry";
import { RunStatus, StandingOrderErrorKind, StandingOrderScope } from "./standingTypes";
import { createStandingWorld } from "./testStandingWorld";

function kindOf(action: () => void): StandingOrderErrorKind | null {
  try {
    action();
  } catch (failure) {
    return failure instanceof StandingOrderError ? failure.kind : null;
  }
  return null;
}

function readyWorld() {
  const world = createStandingWorld({ width: 20, height: 20 });
  world.userBoard();
  world.throneRoom(5, 5);
  world.steward(2);
  world.spawn("sawmill", 30);
  return world;
}

describe("defaultThreshold", () => {
  // @covers 026:FR-003
  it("is floor(target x 0.75) and stays below the target", () => {
    const world = createStandingWorld();
    expect(defaultThreshold(world.engine, 20)).toBe(15);
    expect(defaultThreshold(world.engine, 1)).toBe(0);
    expect(defaultThreshold(world.engine, 2)).toBe(1);
    expect(defaultThreshold(world.engine, 7)).toBe(5);
  });
});

describe("createStandingOrder", () => {
  // @covers 026:FR-001 026:FR-002 026:FR-003
  it("resolves the recipe, applies the default threshold and starts satisfied", () => {
    const world = createStandingWorld();
    const events = world.record("standing-order.created");
    const order = createStandingOrder(world.engine, { materialId: "bread", targetQuantity: 20 });
    expect(order).toMatchObject({
      orderId: 1,
      materialId: "bread",
      recipeId: "bake_bread",
      targetQuantity: 20,
      restockThreshold: 15,
      scope: StandingOrderScope.Settlement,
      zoneId: null,
      priority: 50,
      paused: false,
      restocking: false,
      outputPerRun: 2,
    });
    world.run(1);
    expect(events).toEqual([{ orderId: 1 }]);
  });

  it("takes an explicit threshold, priority and a user-managed board", () => {
    const world = createStandingWorld();
    const boardId = world.userBoard();
    const order = createStandingOrder(world.engine, {
      recipeId: "grind_flour",
      targetQuantity: 10,
      restockThreshold: 4,
      priority: 80,
      postingBoardId: boardId,
    });
    expect(order).toMatchObject({
      materialId: "flour",
      restockThreshold: 4,
      priority: 80,
      postingBoardId: boardId,
    });
  });

  // @covers 026:FR-004
  it("rejects invalid quantities and priorities and changes nothing", () => {
    const world = createStandingWorld();
    for (const request of [
      { materialId: "bread", targetQuantity: 0 },
      { materialId: "bread", targetQuantity: 10, restockThreshold: 10 },
      { materialId: "bread", targetQuantity: 10, restockThreshold: -1 },
      { materialId: "bread", targetQuantity: 10, priority: 101 },
    ]) {
      expect(kindOf(() => createStandingOrder(world.engine, request))).toBe(
        StandingOrderErrorKind.InvalidQuantity,
      );
    }
    expect(getStandingService(world.engine).state.orders).toEqual([]);
    expect(getStandingService(world.engine).state.nextOrderId).toBe(1);
  });

  // @covers 026:FR-004
  it("rejects a duplicate for the same material and scope but allows another scope", () => {
    const world = createStandingWorld();
    world.standing({ materialId: "bread" });
    expect(
      kindOf(() => createStandingOrder(world.engine, { materialId: "bread", targetQuantity: 5 })),
    ).toBe(StandingOrderErrorKind.DuplicateOrder);
    const zoneId = world.zone("stockpile", [40]);
    expect(
      createStandingOrder(world.engine, { materialId: "bread", targetQuantity: 5, zoneId }),
    ).toMatchObject({ scope: StandingOrderScope.Zone, zoneId });
  });

  // @covers 026:FR-004
  it("rejects an unknown zone and a board that is not user-managed", () => {
    const world = createStandingWorld();
    expect(
      kindOf(() =>
        createStandingOrder(world.engine, { materialId: "bread", targetQuantity: 5, zoneId: 999 }),
      ),
    ).toBe(StandingOrderErrorKind.UnknownZone);
    expect(
      kindOf(() =>
        createStandingOrder(world.engine, {
          materialId: "bread",
          targetQuantity: 5,
          postingBoardId: world.boardId,
        }),
      ),
    ).toBe(StandingOrderErrorKind.BoardNotUserManaged);
  });

  // @covers 026:FR-004 026:FR-027
  it("stops at maxStandingOrders", () => {
    const constants = bundledContentFiles[ContentFile.ContentConstants];
    const content = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.ContentConstants]: { ...(constants as object), maxStandingOrders: 1 },
    });
    const world = createStandingWorld({ content });
    world.standing({ materialId: "bread" });
    expect(
      kindOf(() =>
        createStandingOrder(world.engine, {
          materialId: "flour",
          recipeId: "grind_flour",
          targetQuantity: 5,
        }),
      ),
    ).toBe(StandingOrderErrorKind.TooManyOrders);
  });

  it("does not count a deleted order against the cap or the duplicate rule", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread" });
    deleteStandingOrder(world.engine, id);
    expect(world.standing({ materialId: "bread" })).toBe(2);
  });
});

describe("updateStandingOrder", () => {
  // @covers 026:FR-024
  it("changes target, threshold, priority and board and queues the event", () => {
    const world = createStandingWorld();
    const boardId = world.userBoard();
    const id = world.standing({ materialId: "bread" });
    const events = world.record("standing-order.updated");
    const order = updateStandingOrder(world.engine, id, {
      targetQuantity: 40,
      restockThreshold: 30,
      priority: 70,
      postingBoardId: boardId,
    });
    expect(order).toMatchObject({
      targetQuantity: 40,
      restockThreshold: 30,
      priority: 70,
      postingBoardId: boardId,
    });
    expect(
      updateStandingOrder(world.engine, id, { postingBoardId: null }).postingBoardId,
    ).toBeNull();
    world.run(1);
    expect(events).toHaveLength(2);
  });

  it("keeps a threshold that still fits and recomputes one that no longer does", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread" });
    expect(updateStandingOrder(world.engine, id, { targetQuantity: 30 }).restockThreshold).toBe(15);
    expect(updateStandingOrder(world.engine, id, { targetQuantity: 10 }).restockThreshold).toBe(7);
  });

  it("rejects bad edits and unknown or deleted orders", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread" });
    expect(kindOf(() => updateStandingOrder(world.engine, id, { targetQuantity: 0 }))).toBe(
      StandingOrderErrorKind.InvalidQuantity,
    );
    expect(kindOf(() => updateStandingOrder(world.engine, id, { priority: 200 }))).toBe(
      StandingOrderErrorKind.InvalidQuantity,
    );
    expect(
      kindOf(() => updateStandingOrder(world.engine, id, { postingBoardId: world.boardId })),
    ).toBe(StandingOrderErrorKind.BoardNotUserManaged);
    expect(kindOf(() => updateStandingOrder(world.engine, 77, { priority: 1 }))).toBe(
      StandingOrderErrorKind.UnknownOrder,
    );
    expect(world.orderOf(id).targetQuantity).toBe(20);
    deleteStandingOrder(world.engine, id);
    expect(kindOf(() => updateStandingOrder(world.engine, id, { priority: 1 }))).toBe(
      StandingOrderErrorKind.UnknownOrder,
    );
  });
});

describe("setStandingOrderPaused", () => {
  // @covers 026:FR-024
  it("pauses and resumes with one event each and nothing for a no-op", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread" });
    const paused = world.record("standing-order.paused");
    const resumed = world.record("standing-order.resumed");
    expect(setStandingOrderPaused(world.engine, id, true).paused).toBe(true);
    setStandingOrderPaused(world.engine, id, true);
    expect(setStandingOrderPaused(world.engine, id, false).paused).toBe(false);
    world.run(1);
    expect(paused).toHaveLength(1);
    expect(resumed).toHaveLength(1);
    expect(kindOf(() => setStandingOrderPaused(world.engine, 9, true))).toBe(
      StandingOrderErrorKind.UnknownOrder,
    );
  });
});

describe("deleteStandingOrder and dropFinishedOrders", () => {
  it("drops an order without runs at once and queues the event", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread" });
    const events = world.record("standing-order.deleted");
    deleteStandingOrder(world.engine, id);
    expect(getStandingService(world.engine).find(id)).toBeUndefined();
    world.run(1);
    expect(events).toEqual([{ orderId: id }]);
  });

  it("withdraws unclaimed runs but lets a claimed one finish, then drops the record", () => {
    const world = readyWorld();
    world.crier(1);
    const id = world.standing();
    world.runToReview();
    world.run(150);
    const service = getStandingService(world.engine);
    const runs = service.runsOf(id);
    expect(runs).toHaveLength(5);
    const keeper = (runs[0] as (typeof runs)[number]).runId;
    world.claim(keeper);
    deleteStandingOrder(world.engine, id);
    expect(service.runsOf(id).map((run) => run.runId)).toEqual([keeper]);
    expect(service.find(id)?.deleted).toBe(true);
    expect(runStatus(world.engine, service.runsOf(id)[0] as (typeof runs)[number])).toBe(
      RunStatus.Claimed,
    );
    world.finish(keeper);
    world.run(1);
    expect(service.find(id)).toBeUndefined();
    expect(service.state.runs).toEqual([]);
  });

  it("dropFinishedOrders keeps a deleted order while it still owns a run", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread" });
    const service = getStandingService(world.engine);
    (service.state.orders[0] as (typeof service.state.orders)[number]).deleted = true;
    service.state.runs.push({
      runId: 1,
      orderId: id,
      boardId: 9,
      updateId: 1,
      productionOrderId: null,
    });
    service.state.nextRunId = 2;
    dropFinishedOrders(world.engine);
    expect(service.find(id)).toBeDefined();
    service.state.runs = [];
    dropFinishedOrders(world.engine);
    expect(service.find(id)).toBeUndefined();
  });
});
