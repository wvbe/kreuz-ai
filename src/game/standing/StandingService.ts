import { z } from "zod";
import { cloneJson } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { StandingOrderScope } from "./standingTypes";
import type { OwnedRun, StandingOrder, StewardshipState } from "./standingTypes";

const idSchema = z.number().int().min(1);
const countSchema = z.number().int().min(0);

const orderSchema = z
  .object({
    orderId: idSchema,
    materialId: z.string().min(1),
    recipeId: z.string().min(1),
    targetQuantity: idSchema,
    restockThreshold: countSchema,
    scope: z.enum(StandingOrderScope),
    zoneId: idSchema.nullable(),
    priority: z.number().int().min(0).max(100),
    postingBoardId: idSchema.nullable(),
    paused: z.boolean(),
    restocking: z.boolean(),
    outputPerRun: idSchema,
    deleted: z.boolean(),
    createdTick: countSchema,
  })
  .strict();

const runSchema = z
  .object({
    runId: idSchema,
    orderId: idSchema,
    boardId: idSchema,
    updateId: idSchema.nullable(),
    productionOrderId: idSchema.nullable(),
  })
  .strict();

const ascending = (ids: readonly number[], below: number): boolean =>
  ids.every((id, index) => id < below && (index === 0 || (ids[index - 1] ?? 0) < id));

const sectionSchema = z
  .object({
    nextOrderId: idSchema,
    nextRunId: idSchema,
    orders: z.array(orderSchema),
    runs: z.array(runSchema),
    stewardEntityId: idSchema.nullable(),
    stewardBoardId: idSchema.nullable(),
    extraReviewAfterTick: countSchema.nullable(),
    lastReviewTick: countSchema.nullable(),
  })
  .strict()
  .refine(
    (data) =>
      ascending(
        data.orders.map((order) => order.orderId),
        data.nextOrderId,
      ) &&
      ascending(
        data.runs.map((run) => run.runId),
        data.nextRunId,
      ),
    { message: "orders and runs must be unique, ascending and below their counters" },
  )
  .refine(
    (data) =>
      data.orders.every(
        (order) => (order.scope === StandingOrderScope.Zone) === (order.zoneId !== null),
      ) && data.runs.every((run) => data.orders.some((order) => order.orderId === run.orderId)),
    { message: "a zone order names its zone, every run belongs to an order" },
  );

function emptyState(): StewardshipState {
  return {
    nextOrderId: 1,
    nextRunId: 1,
    orders: [],
    runs: [],
    stewardEntityId: null,
    stewardBoardId: null,
    extraReviewAfterTick: null,
    lastReviewTick: null,
  };
}

/**
 * The saved state of standing orders and the Steward (spec 026 FR-026, root key `stewardship`):
 * the orders with their hysteresis bit, the runs they own, the Steward, the Steward's board, the
 * extra-review request and the last review tick. Every number is an integer. The functions of
 * this folder change {@link StandingService.state} in place; nothing else is saved (stock,
 * states and reasons are derived).
 */
export class StandingService {
  /**
   * The live state; mutated by the functions of `standingOrders`, `steward` and the review.
   */
  state: StewardshipState = emptyState();

  /**
   * Forgets everything (a new game starts from the empty state).
   */
  reset(): void {
    this.state = emptyState();
  }

  /**
   * An order by id.
   *
   * @param orderId - Order id.
   * @returns The live record (it includes deleted orders that still run), or undefined.
   */
  find(orderId: number): StandingOrder | undefined {
    return this.state.orders.find((order) => order.orderId === orderId);
  }

  /**
   * The runs of one order, ascending by run id.
   *
   * @param orderId - Order id.
   * @returns The live records.
   */
  runsOf(orderId: number): OwnedRun[] {
    return this.state.runs.filter((run) => run.orderId === orderId);
  }

  /**
   * The save section `stewardship`.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "stewardship",
      location: SaveSectionLocation.Root,
      schema: sectionSchema,
      serialize: () => cloneJson(this.state),
      restore: (saved: JsonValue) => {
        this.state = sectionSchema.parse(saved);
      },
      defaultForOlderSaves: () => cloneJson(emptyState()),
    };
  }
}
