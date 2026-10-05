import { firstBlockedReason, formatOrderDetail, formatOrderList } from "../formatProduction";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb, VerbContext, VerbOutput } from "./Verb";

const orderUsage =
  "usage: order <orderId> | order create <recipeId> <quantity> [workstationId] [priority] | order cancel <orderId> | order pause <orderId> | order resume <orderId> | order priority <orderId> <0-100> | order interrupt <workstationId>";

function queue(
  context: VerbContext,
  command: { kind: string; [name: string]: string | number | boolean },
): VerbOutput {
  const result = context.session.dispatch(command);
  return result.ok
    ? verbDone([`queued ${command.kind} (applied on the next tick)`])
    : verbFailed(`${result.error.kind}: ${result.error.message}`);
}

function createOrder(args: readonly string[], context: VerbContext): VerbOutput {
  const [recipeId, quantityText, stationText, priorityText] = args;
  const quantity = parseCount(quantityText);
  const workstationId = stationText === undefined ? undefined : parseCount(stationText);
  const priority = priorityText === undefined ? undefined : parseCount(priorityText);
  if (
    recipeId === undefined ||
    quantity === null ||
    workstationId === null ||
    priority === null ||
    args.length > 4
  ) {
    return verbFailed(orderUsage);
  }
  return queue(context, {
    kind: "CreateProductionOrder",
    recipeId,
    quantity,
    ...(workstationId === undefined ? {} : { workstationId }),
    ...(priority === undefined ? {} : { priority }),
  });
}

function changeOrder(sub: string, args: readonly string[], context: VerbContext): VerbOutput {
  const id = parseCount(args[0]);
  if (id === null) {
    return verbFailed(orderUsage);
  }
  switch (sub) {
    case "cancel":
      return args.length === 1
        ? queue(context, { kind: "CancelProductionOrder", orderId: id })
        : verbFailed(orderUsage);
    case "pause":
    case "resume":
      return args.length === 1
        ? queue(context, { kind: "SetProductionOrderPaused", orderId: id, paused: sub === "pause" })
        : verbFailed(orderUsage);
    case "priority": {
      const priority = parseCount(args[1]);
      return priority === null || args.length !== 2
        ? verbFailed(orderUsage)
        : queue(context, { kind: "SetProductionOrderPriority", orderId: id, priority });
    }
    default:
      return args.length === 1
        ? queue(context, { kind: "CancelCraft", workstationId: id })
        : verbFailed(orderUsage);
  }
}

/**
 * Production verbs: `orders` and `order`.
 */
export const productionVerbs: readonly Verb[] = [
  {
    name: "orders",
    usage: "orders [workstationId]",
    summary: "list the production orders with progress and the first reason one is blocked",
    run: (args, { session }) => {
      const workstationId = args[0] === undefined ? null : parseCount(args[0]);
      if (args[0] !== undefined && (workstationId === null || args.length > 1)) {
        return verbFailed("usage: orders [workstationId]");
      }
      const orders = session.query.run(
        "production-orders",
        workstationId === null ? {} : { workstationId },
      );
      if (!orders.ok) {
        return verbFailed("the production orders are not available (no game?)");
      }
      const blocked = new Map<number, string>();
      if (Array.isArray(orders.data)) {
        for (const entry of orders.data) {
          const id =
            typeof entry === "object" && entry !== null && !Array.isArray(entry)
              ? entry["orderId"]
              : undefined;
          if (typeof id === "number") {
            const detail = session.query.run("order", { orderId: id });
            const reason = detail.ok ? firstBlockedReason(detail.data) : null;
            if (reason !== null) {
              blocked.set(id, reason);
            }
          }
        }
      }
      return verbDone(formatOrderList(orders.data, blocked));
    },
  },
  {
    name: "order",
    usage: "order <orderId> | order create|cancel|pause|resume|priority|interrupt ...",
    summary:
      "inspect an order with its blocked reasons, or queue creating, cancelling, pausing, resuming, reprioritising an order or interrupting the craft at a workstation",
    run: (args, context) => {
      const [first, ...rest] = args;
      if (first === "create") {
        return createOrder(rest, context);
      }
      if (
        first === "cancel" ||
        first === "pause" ||
        first === "resume" ||
        first === "priority" ||
        first === "interrupt"
      ) {
        return changeOrder(first, rest, context);
      }
      const orderId = parseCount(first);
      if (orderId === null || args.length !== 1) {
        return verbFailed(orderUsage);
      }
      const view = context.session.query.run("order", { orderId });
      if (!view.ok) {
        return verbFailed("the production orders are not available (no game?)");
      }
      const lines = formatOrderDetail(view.data);
      return lines.length === 0 ? verbDone([`order ${orderId} does not exist`]) : verbDone(lines);
    },
  },
];
