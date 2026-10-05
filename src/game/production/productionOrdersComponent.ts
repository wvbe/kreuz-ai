import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { maxFinishedOrders, maxOrderPriority, OrderStatus } from "./productionTypes";
import type { WorkstationData } from "./productionTypes";

const idSchema = z.number().int().min(1);
const tickSchema = z.number().int().min(0);

/**
 * Strict Zod schema of one production order.
 */
export const productionOrderSchema = z
  .object({
    orderId: idSchema,
    workstationId: idSchema,
    recipeId: z.string().min(1),
    quantity: idSchema,
    remaining: z.number().int().min(0),
    priority: z.number().int().min(0).max(maxOrderPriority),
    status: z.nativeEnum(OrderStatus),
    postingId: idSchema.nullable(),
    createdTick: tickSchema,
  })
  .strict();

/**
 * Strict Zod schema of the running craft of a workstation.
 */
export const activeCraftSchema = z
  .object({
    orderId: idSchema,
    crafterId: idSchema,
    postingId: idSchema,
    recipeId: z.string().min(1),
    startedTick: tickSchema,
    durationTicks: idSchema,
    reservationIds: z.array(idSchema),
  })
  .strict();

/**
 * Strict Zod schema of the serialized {@link WorkstationData}: orders unique and ascending by id,
 * remaining within the quantity, at most {@link maxFinishedOrders} finished orders.
 */
export const workstationDataSchema = z
  .object({
    orders: z.array(productionOrderSchema),
    craft: activeCraftSchema.nullable(),
  })
  .strict()
  .refine(
    (data) =>
      data.orders.every(
        (order, index) => index === 0 || (data.orders[index - 1]?.orderId ?? 0) < order.orderId,
      ),
    { message: "orders must be unique and ascending by id" },
  )
  .refine((data) => data.orders.every((order) => order.remaining <= order.quantity), {
    message: "remaining crafts cannot exceed the quantity",
  })
  .refine(
    (data) =>
      data.orders.filter(
        (order) => order.status === OrderStatus.Completed || order.status === OrderStatus.Cancelled,
      ).length <=
      maxFinishedOrders + 1,
    { message: "too many finished orders" },
  );

/**
 * The `ProductionOrders` component (DECISIONS D-10): makes a furniture entity a workstation. It
 * holds the production orders of the workstation and the craft in progress, so a save in the
 * middle of a craft resumes identically. It lives in the entities save section; the workstation
 * prototypes (`oven`, `grinding_mill`, `sawmill`, `workbench`) carry it.
 */
export const productionOrdersComponent = defineComponent<"ProductionOrders", WorkstationData>(
  "ProductionOrders",
  workstationDataSchema,
  () => ({ orders: [], craft: null }),
);
