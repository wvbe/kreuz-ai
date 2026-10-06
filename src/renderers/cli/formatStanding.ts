import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const paramSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const reasonSchema = z.object({ kind: z.string(), params: z.record(z.string(), paramSchema) });

const summarySchema = z.object({
  orderId: z.number(),
  materialId: z.string(),
  recipeId: z.string(),
  targetQuantity: z.number(),
  restockThreshold: z.number(),
  scope: z.string(),
  zoneId: z.number().nullable(),
  priority: z.number(),
  postingBoardId: z.number().nullable(),
  state: z.string(),
  outputPerRun: z.number(),
  countedStock: z.number(),
  pendingAdd: z.number(),
  open: z.number(),
  claimed: z.number(),
  blocked: reasonSchema.nullable(),
});

const detailSchema = summarySchema.extend({
  reasons: z.array(reasonSchema),
  resolvedBoardId: z.number().nullable(),
  runs: z.array(
    z.object({
      runId: z.number(),
      status: z.string(),
      boardId: z.number(),
      updateId: z.number().nullable(),
      productionOrderId: z.number().nullable(),
    }),
  ),
});

const stewardSchema = z.object({
  stewardEntityId: z.number().nullable(),
  stewardBoardId: z.number().nullable(),
  seatZoneId: z.number().nullable(),
  lastReviewTick: z.number().nullable(),
  nextReviewTick: z.number(),
  extraReviewRequested: z.boolean(),
  orders: z.number(),
  noticePosts: z.array(z.number()),
});

type Summary = z.infer<typeof summarySchema>;
type ReasonView = z.infer<typeof reasonSchema>;

function describeReason(reason: ReasonView): string {
  const params = Object.entries(reason.params)
    .map(([name, value]) => `${name} ${String(value)}`)
    .join(", ");
  return params === "" ? reason.kind : `${reason.kind} (${params})`;
}

function summaryLine(order: Summary): string {
  const scope = order.scope === "zone" ? `zone #${order.zoneId ?? "?"}` : "settlement";
  const runs = `runs ${order.pendingAdd} on the way, ${order.open} open, ${order.claimed} claimed`;
  const why = order.blocked === null ? "" : ` - ${describeReason(order.blocked)}`;
  return `#${order.orderId} ${order.materialId}: ${order.state}, stock ${order.countedStock}/${order.targetQuantity} (restock at ${order.restockThreshold}), ${scope}, priority ${order.priority}, ${runs}${why}`;
}

/**
 * Formats the query `standing-orders` for `standing list`: one line per order with its state,
 * the counted stock against target and threshold, the scope, the runs by status and the primary
 * reason of a blocked order.
 *
 * @param rows - Data of the `standing-orders` query.
 * @returns Output lines; one line saying so when there are no orders; empty for a foreign view.
 */
export function formatStandingOrders(rows: JsonValue): string[] {
  const parsed = z.array(summarySchema).safeParse(rows);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.length === 0
    ? ["no standing orders (standing create <materialId> <target>)"]
    : parsed.data.map(summaryLine);
}

/**
 * Formats the query `standing-order {orderId}` for `standing <id>`: the summary line, the recipe,
 * the board the runs go to, every reason and each owned run.
 *
 * @param view - Data of the `standing-order` query.
 * @returns Output lines; empty for a foreign view or an unknown order.
 */
export function formatStandingOrder(view: JsonValue): string[] {
  const parsed = detailSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const data = parsed.data;
  const lines = [
    summaryLine(data),
    `recipe ${data.recipeId} (${data.outputPerRun} per run), runs go to board ${data.resolvedBoardId === null ? "none reachable" : `#${data.resolvedBoardId}`}${data.postingBoardId === null ? "" : " (chosen by the order)"}`,
  ];
  if (data.reasons.length > 0) {
    lines.push(`why: ${data.reasons.map(describeReason).join("; ")}`);
  }
  for (const run of data.runs) {
    const where =
      run.productionOrderId === null
        ? `update #${run.updateId ?? "?"} on board #${run.boardId}`
        : `production order #${run.productionOrderId}`;
    lines.push(`  run #${run.runId} ${run.status}: ${where}`);
  }
  return lines;
}

/**
 * Formats the query `steward` for the `steward` verb: who holds the office, the throne room, the
 * Steward's board, the last and next review and the Notice Posts.
 *
 * @param view - Data of the `steward` query.
 * @returns Output lines; empty for a foreign view.
 */
export function formatSteward(view: JsonValue): string[] {
  const parsed = stewardSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const data = parsed.data;
  const posts =
    data.noticePosts.length === 0 ? "none" : data.noticePosts.map((id) => `#${id}`).join(", ");
  return [
    `steward: ${data.stewardEntityId === null ? "nobody (steward appoint <entityId>)" : `#${data.stewardEntityId}`}, throne room ${data.seatZoneId === null ? "none" : `#${data.seatZoneId}`}, own board ${data.stewardBoardId === null ? "none" : `#${data.stewardBoardId}`}`,
    `reviews: last ${data.lastReviewTick === null ? "never" : `tick ${data.lastReviewTick}`}, next daily at tick ${data.nextReviewTick}${data.extraReviewRequested ? ", one extra requested" : ""}; ${data.orders} order(s); notice posts ${posts}`,
  ];
}
