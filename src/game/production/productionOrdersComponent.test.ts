import { describe, expect, it } from "vitest";
import {
  activeCraftSchema,
  productionOrderSchema,
  productionOrdersComponent,
  workstationDataSchema,
} from "./productionOrdersComponent";
import { OrderStatus } from "./productionTypes";
import type { ProductionOrder } from "./productionTypes";

function order(orderId: number, overrides: Partial<ProductionOrder> = {}): ProductionOrder {
  return {
    orderId,
    workstationId: 5,
    recipeId: "bake_bread",
    quantity: 3,
    remaining: 3,
    priority: 50,
    status: OrderStatus.Active,
    postingId: null,
    createdTick: 0,
    ...overrides,
  };
}

describe("productionOrdersComponent", () => {
  it("defaults to an idle workstation", () => {
    expect(productionOrdersComponent.name).toBe("ProductionOrders");
    expect(productionOrdersComponent.defaults()).toEqual({ orders: [], craft: null });
  });

  it("round trips orders and the running craft", () => {
    const data = {
      orders: [order(1), order(4, { status: OrderStatus.Paused, postingId: 9 })],
      craft: {
        orderId: 1,
        crafterId: 3,
        postingId: 8,
        recipeId: "bake_bread",
        startedTick: 12,
        durationTicks: 20,
        reservationIds: [2],
      },
    };
    expect(workstationDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(activeCraftSchema.safeParse(data.craft).success).toBe(true);
    expect(productionOrderSchema.safeParse(data.orders[0]).success).toBe(true);
  });

  it("rejects unsorted orders, too many remaining crafts and unknown fields", () => {
    expect(
      workstationDataSchema.safeParse({ orders: [order(2), order(1)], craft: null }).success,
    ).toBe(false);
    expect(
      workstationDataSchema.safeParse({ orders: [order(1, { remaining: 4 })], craft: null })
        .success,
    ).toBe(false);
    expect(productionOrderSchema.safeParse({ ...order(1), extra: 1 }).success).toBe(false);
  });

  it("bounds the finished orders", () => {
    const finished = Array.from({ length: 20 }, (_unused, index) =>
      order(index + 1, { status: OrderStatus.Completed, remaining: 0 }),
    );
    expect(workstationDataSchema.safeParse({ orders: finished, craft: null }).success).toBe(false);
  });
});
