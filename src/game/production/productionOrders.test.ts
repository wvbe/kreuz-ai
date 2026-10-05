import { describe, expect, it } from "vitest";
import { findPosting } from "../jobs/jobBoards";
import { PostingStatus } from "../jobs/jobTypes";
import { ProductionError, ProductionErrorKind } from "./ProductionError";
import {
  cancelCraft,
  cancelOrderAt,
  cancelProductionOrder,
  createProductionOrder,
  orderWithdrawnReason,
  pruneFinishedOrders,
  setProductionOrderPaused,
  setProductionOrderPriority,
} from "./productionOrders";
import { maxFinishedOrders, OrderStatus } from "./productionTypes";
import type { ProductionOrder } from "./productionTypes";
import { createProductionWorld } from "./testProductionWorld";

function failsWith(
  action: () => object | string | number | boolean | null | undefined,
  kind: ProductionErrorKind,
): void {
  expect(action).toThrowError(expect.objectContaining({ kind }));
}

describe("createProductionOrder", () => {
  it("stores an active order on the workstation and queues production.order.created", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    const order = createProductionOrder(world.engine, {
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 4,
      priority: 70,
    });
    expect(order).toEqual({
      orderId: 1,
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 4,
      remaining: 4,
      priority: 70,
      status: OrderStatus.Active,
      postingId: null,
      createdTick: 0,
    });
    expect(world.data(sawmill).orders).toEqual([order]);
    world.engine.bus.processQueue();
    expect(world.seen.map((event) => event.name)).toEqual(["production.order.created"]);
    expect(world.seen[0]?.payload).toEqual({
      orderId: 1,
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
    });
  });

  it("defaults the priority to 50 and allocates ascending ids", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    const first = createProductionOrder(world.engine, {
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 1,
    });
    const second = createProductionOrder(world.engine, {
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 1,
    });
    expect([first.priority, first.orderId, second.orderId]).toEqual([50, 1, 2]);
  });

  it("rejects bad quantity or priority, unknown recipe, locked tier, unknown or wrong workstation", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    const chest = world.chest(50);
    const base = { workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 };
    failsWith(
      () => createProductionOrder(world.engine, { ...base, quantity: 0 }),
      ProductionErrorKind.InvalidQuantity,
    );
    failsWith(
      () => createProductionOrder(world.engine, { ...base, priority: 101 }),
      ProductionErrorKind.InvalidQuantity,
    );
    failsWith(
      () => createProductionOrder(world.engine, { ...base, recipeId: "nope" }),
      ProductionErrorKind.UnknownRecipe,
    );
    failsWith(
      () => createProductionOrder(world.engine, { ...base, workstationId: 9999 }),
      ProductionErrorKind.UnknownEntity,
    );
    failsWith(
      () => createProductionOrder(world.engine, { ...base, workstationId: chest.id }),
      ProductionErrorKind.UnknownEntity,
    );
    failsWith(
      () => createProductionOrder(world.engine, { ...base, recipeId: "bake_bread" }),
      ProductionErrorKind.RecipeNotCompatible,
    );
    world.setTier("hamlet");
    const oven = world.station("oven", 23);
    failsWith(
      () =>
        createProductionOrder(world.engine, {
          workstationId: oven.id,
          recipeId: "bake_bread",
          quantity: 1,
        }),
      ProductionErrorKind.ContentLocked,
    );
    expect(world.data(sawmill).orders).toEqual([]);
  });

  it("without a workstation picks the capable one with the fewest unfinished orders", () => {
    const world = createProductionWorld();
    const first = world.station("sawmill", 22);
    const second = world.station("sawmill", 23);
    const request = { recipeId: "saw_oak_planks", quantity: 1 };
    const one = createProductionOrder(world.engine, request);
    const two = createProductionOrder(world.engine, request);
    const three = createProductionOrder(world.engine, request);
    expect([one.workstationId, two.workstationId, three.workstationId]).toEqual([
      first.id,
      second.id,
      first.id,
    ]);
    failsWith(
      () => createProductionOrder(world.engine, { recipeId: "bake_bread", quantity: 1 }),
      ProductionErrorKind.RecipeNotCompatible,
    );
  });
});

describe("pruneFinishedOrders", () => {
  it("keeps unfinished orders and the newest finished ones", () => {
    const orders: ProductionOrder[] = Array.from(
      { length: maxFinishedOrders + 3 },
      (_unused, index) => ({
        orderId: index + 1,
        workstationId: 5,
        recipeId: "saw_oak_planks",
        quantity: 1,
        remaining: index % 2 === 0 ? 0 : 1,
        priority: 50,
        status: index < 18 ? OrderStatus.Completed : OrderStatus.Active,
        postingId: null,
        createdTick: 0,
      }),
    );
    const data = { orders, craft: null };
    pruneFinishedOrders(data);
    const finished = data.orders.filter((order) => order.status === OrderStatus.Completed);
    expect(finished).toHaveLength(maxFinishedOrders);
    expect(finished[0]?.orderId).toBe(3);
    expect(data.orders.filter((order) => order.status === OrderStatus.Active)).toHaveLength(1);
  });

  it("does nothing within the bound", () => {
    const data = { orders: [], craft: null };
    pruneFinishedOrders(data);
    expect(data.orders).toEqual([]);
  });
});

describe("cancelProductionOrder", () => {
  it("cancels an order that has not started, queues production.order.cancelled, is idempotent", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    expect(cancelProductionOrder(world.engine, id).status).toBe(OrderStatus.Cancelled);
    world.engine.bus.processQueue();
    expect(world.seen.map((event) => event.name)).toEqual([
      "production.order.created",
      "production.order.cancelled",
    ]);
    expect(cancelProductionOrder(world.engine, id).status).toBe(OrderStatus.Cancelled);
    world.engine.bus.processQueue();
    expect(world.seen).toHaveLength(2);
    failsWith(() => cancelProductionOrder(world.engine, 99), ProductionErrorKind.UnknownOrder);
  });

  it("withdraws the open posting of the order", () => {
    const world = createProductionWorld();
    world.settler(11);
    const sawmill = world.station("sawmill", 22);
    world.give(world.chest(50), "oak_log", 4);
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    world.run(6);
    const postingId = world.data(sawmill).orders[0]?.postingId ?? null;
    expect(postingId).not.toBeNull();
    expect(findPosting(world.engine, postingId ?? 0)?.posting.status).toBe(PostingStatus.Open);
    cancelProductionOrder(world.engine, id);
    expect(findPosting(world.engine, postingId ?? 0)).toBeNull();
    expect(world.data(sawmill).orders[0]).toMatchObject({
      status: OrderStatus.Cancelled,
      postingId: null,
    });
    const history = world.engine.store.require(world.boardId).components["JobBoard"] as {
      history: { reason: string }[];
    };
    expect(history.history.at(-1)?.reason).toBe(orderWithdrawnReason);
  });
});

describe("cancelOrderAt", () => {
  it("cancels an order that is already located, once", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    const data = world.data(sawmill);
    const order = data.orders[0];
    expect(order).toBeDefined();
    if (order === undefined) {
      return;
    }
    expect(cancelOrderAt(world.engine, { station: sawmill, data, order }).status).toBe(
      OrderStatus.Cancelled,
    );
    expect(cancelOrderAt(world.engine, { station: sawmill, data, order }).status).toBe(
      OrderStatus.Cancelled,
    );
    world.engine.bus.processQueue();
    expect(world.seen.filter((event) => event.name === "production.order.cancelled")).toHaveLength(
      1,
    );
  });
});

describe("setProductionOrderPaused", () => {
  it("pauses and resumes an order and withdraws its posting while paused", () => {
    const world = createProductionWorld();
    world.settler(11);
    const sawmill = world.station("sawmill", 22);
    world.give(world.chest(50), "oak_log", 4);
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    world.run(6);
    expect(world.data(sawmill).orders[0]?.postingId).not.toBeNull();
    expect(setProductionOrderPaused(world.engine, id, true).status).toBe(OrderStatus.Paused);
    expect(world.data(sawmill).orders[0]?.postingId).toBeNull();
    world.run(12);
    expect(world.data(sawmill).orders[0]?.postingId).toBeNull();
    expect(setProductionOrderPaused(world.engine, id, false).status).toBe(OrderStatus.Active);
    world.run(6);
    expect(world.data(sawmill).orders[0]?.postingId).not.toBeNull();
    cancelProductionOrder(world.engine, id);
    expect(setProductionOrderPaused(world.engine, id, true).status).toBe(OrderStatus.Cancelled);
    failsWith(
      () => setProductionOrderPaused(world.engine, 99, true),
      ProductionErrorKind.UnknownOrder,
    );
  });
});

describe("setProductionOrderPriority", () => {
  it("changes the order and its open posting", () => {
    const world = createProductionWorld();
    world.settler(11);
    const sawmill = world.station("sawmill", 22);
    world.give(world.chest(50), "oak_log", 4);
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    world.run(6);
    const postingId = world.data(sawmill).orders[0]?.postingId ?? 0;
    expect(setProductionOrderPriority(world.engine, id, 90).priority).toBe(90);
    expect(findPosting(world.engine, postingId)?.posting.priority).toBe(90);
    failsWith(
      () => setProductionOrderPriority(world.engine, id, 101),
      ProductionErrorKind.InvalidQuantity,
    );
    failsWith(
      () => setProductionOrderPriority(world.engine, 99, 5),
      ProductionErrorKind.UnknownOrder,
    );
  });

  it("changes an order that has no posting yet", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    expect(setProductionOrderPriority(world.engine, id, 0).priority).toBe(0);
  });
});

describe("cancelCraft", () => {
  it("is false when the workstation is idle and throws for a non-workstation", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    expect(cancelCraft(world.engine, sawmill.id)).toBe(false);
    expect(() => cancelCraft(world.engine, 9999)).toThrow(ProductionError);
  });

  it("frees the workstation at once when the crafter has no craft task any more", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    world.data(sawmill).craft = {
      orderId: 1,
      crafterId: 9999,
      postingId: 1,
      recipeId: "saw_oak_planks",
      startedTick: 0,
      durationTicks: 5,
      reservationIds: [],
    };
    expect(cancelCraft(world.engine, sawmill.id)).toBe(true);
    expect(world.data(sawmill).craft).toBeNull();
    world.engine.bus.processQueue();
    expect(world.seen.at(-1)).toMatchObject({
      name: "production.crafting.interrupted",
      payload: { reason: "player_cancel" },
    });
  });
});
