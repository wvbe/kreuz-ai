import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const reasonSchema = z.object({
  kind: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  causeRef: z.object({ kind: z.string(), entityId: z.number() }).nullable(),
});

const craftingSchema = z.object({
  crafterId: z.number(),
  recipeId: z.string(),
  startedTick: z.number(),
  progressTicks: z.number(),
  durationTicks: z.number(),
});

const orderSchema = z.object({
  orderId: z.number(),
  workstationId: z.number(),
  recipeId: z.string(),
  quantity: z.number(),
  remaining: z.number(),
  priority: z.number(),
  status: z.string(),
  postingId: z.number().nullable(),
  createdTick: z.number(),
  crafting: craftingSchema.nullable(),
});

const detailSchema = orderSchema.extend({ blocked: z.array(reasonSchema) });

type Reason = z.infer<typeof reasonSchema>;
type Order = z.infer<typeof orderSchema>;

/**
 * One blocked reason as short text: the kind followed by its params and the cause.
 *
 * @param reason - A reason from the `order` query.
 * @returns For example `MissingInput materialId=flour required=1 available=0 noProducer=true`.
 */
export function describeReason(reason: Reason): string {
  const params = Object.entries(reason.params).map(([name, value]) => `${name}=${String(value)}`);
  const cause =
    reason.causeRef === null ? [] : [`cause=${reason.causeRef.kind}#${reason.causeRef.entityId}`];
  return [reason.kind, ...params, ...cause].join(" ");
}

function describeOrder(order: Order): string {
  const crafting =
    order.crafting === null
      ? ""
      : `, crafting ${order.crafting.progressTicks}/${order.crafting.durationTicks} by #${order.crafting.crafterId}`;
  return `#${order.orderId} ${order.recipeId} ${order.quantity - order.remaining}/${order.quantity} at workstation #${order.workstationId}: ${order.status}, priority ${order.priority}${crafting}`;
}

/**
 * Formats the `production-orders` query for the `orders` verb: one line per order, followed by the
 * first blocked reason of each unfinished order when the caller supplies them.
 *
 * @param view - Data of the `production-orders` query.
 * @param blocked - The first blocked reason text per order id (from the `order` query).
 * @returns Output lines; a note when there are no orders, empty when the view is not an order list.
 */
export function formatOrderList(view: JsonValue, blocked: ReadonlyMap<number, string>): string[] {
  const parsed = z.array(orderSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no production orders"];
  }
  return parsed.data.flatMap((order) => {
    const reason = blocked.get(order.orderId);
    return [describeOrder(order), ...(reason === undefined ? [] : [`    blocked: ${reason}`])];
  });
}

/**
 * Formats the `order {orderId}` query for `order <id>`: the order line and every blocked reason.
 *
 * @param view - Data of the `order` query.
 * @returns Output lines, empty when the order does not exist (null view).
 */
export function formatOrderDetail(view: JsonValue): string[] {
  const parsed = detailSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const detail = parsed.data;
  return [
    describeOrder(detail),
    detail.postingId === null ? "  no posting out" : `  posting #${detail.postingId}`,
    ...(detail.blocked.length === 0
      ? ["  nothing blocks it"]
      : detail.blocked.map((reason) => `  blocked: ${describeReason(reason)}`)),
  ];
}

/**
 * The first blocked reason of an `order` query result as text.
 *
 * @param view - Data of the `order` query.
 * @returns The text, or null when nothing blocks the order or the view is not an order.
 */
export function firstBlockedReason(view: JsonValue): string | null {
  const parsed = detailSchema.safeParse(view);
  const first = parsed.success ? parsed.data.blocked[0] : undefined;
  return first === undefined ? null : describeReason(first);
}
