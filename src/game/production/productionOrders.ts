import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { CounterName } from "../engine/IdCounters";
import { findPosting } from "../jobs/jobBoards";
import { cancelPosting } from "../jobs/jobPostings";
import { PostingStatus } from "../jobs/jobTypes";
import { cancelCraftTask, interruptCraft } from "./craftCleanup";
import { ProductionError, ProductionErrorKind } from "./ProductionError";
import { productionOrdersComponent } from "./productionOrdersComponent";
import {
  canMake,
  capableWorkstations,
  isRecipeLocked,
  requireOrder,
  requireWorkstation,
} from "./productionQueries";
import type { OrderLocation } from "./productionQueries";
import {
  defaultOrderPriority,
  maxFinishedOrders,
  maxOrderPriority,
  OrderStatus,
  orderCancelledEvent,
  orderCreatedEvent,
} from "./productionTypes";
import type { OrderEvent, ProductionOrder, WorkstationData } from "./productionTypes";

/**
 * Reason of a posting that was withdrawn because its order was cancelled or paused.
 */
export const orderWithdrawnReason = "order_withdrawn";

/**
 * What a caller gives to {@link createProductionOrder}. Standing orders (026) use the same call.
 */
export type OrderRequest = {
  /**
   * The workstation, or omitted to let the system pick the capable workstation with the fewest
   * unfinished orders (lowest id on ties).
   */
  workstationId?: number;
  recipeId: string;
  /**
   * Crafts to make, at least 1.
   */
  quantity: number;
  /**
   * `0..100`, default 50.
   */
  priority?: number;
};

function isFinished(order: ProductionOrder): boolean {
  return order.status === OrderStatus.Completed || order.status === OrderStatus.Cancelled;
}

/**
 * Drops the oldest finished orders beyond the bound; unfinished orders always stay.
 *
 * @param data - The workstation's data (changed in place).
 */
export function pruneFinishedOrders(data: WorkstationData): void {
  let excess = data.orders.filter((order) => isFinished(order)).length - maxFinishedOrders;
  if (excess < 1) {
    return;
  }
  data.orders = data.orders.filter((order) => {
    if (excess > 0 && isFinished(order) && data.craft?.orderId !== order.orderId) {
      excess -= 1;
      return false;
    }
    return true;
  });
}

function pickStation(engine: GameEngine, recipeId: string): Entity {
  const load = (station: Entity): number =>
    (getComponent(station, productionOrdersComponent)?.orders ?? []).filter(
      (order) => !isFinished(order),
    ).length;
  let best: Entity | null = null;
  for (const station of capableWorkstations(engine, recipeId)) {
    if (best === null || load(station) < load(best)) {
      best = station;
    }
  }
  if (best === null) {
    throw new ProductionError(
      ProductionErrorKind.RecipeNotCompatible,
      `no workstation can make recipe "${recipeId}"`,
    );
  }
  return best;
}

/**
 * Creates a production order (command `CreateProductionOrder`, DECISIONS section 3.5): `quantity`
 * crafts of one recipe at one workstation, status `Active`. The order is stored in the
 * workstation's `ProductionOrders` component and queues `production.order.created`. The poster
 * (see `postCraftJobs`) turns it into a `craft.produce` posting as soon as a craft can start.
 *
 * @param engine - The engine.
 * @param request - Workstation (optional), recipe, quantity and priority.
 * @returns A copy of the new order.
 * @throws ProductionError `InvalidQuantity`, `UnknownRecipe`, `ContentLocked`, `UnknownEntity`,
 *   `RecipeNotCompatible`.
 */
export function createProductionOrder(engine: GameEngine, request: OrderRequest): ProductionOrder {
  const priority = request.priority ?? defaultOrderPriority;
  if (
    !Number.isSafeInteger(request.quantity) ||
    request.quantity < 1 ||
    !Number.isSafeInteger(priority) ||
    priority < 0 ||
    priority > maxOrderPriority
  ) {
    throw new ProductionError(
      ProductionErrorKind.InvalidQuantity,
      `quantity ${request.quantity} must be at least 1 and priority ${priority} within 0..${maxOrderPriority}`,
    );
  }
  const recipe = engine.content.recipes.find(request.recipeId);
  if (recipe === undefined) {
    throw new ProductionError(
      ProductionErrorKind.UnknownRecipe,
      `recipe "${request.recipeId}" is not in the content pack`,
    );
  }
  if (isRecipeLocked(engine, recipe)) {
    throw new ProductionError(
      ProductionErrorKind.ContentLocked,
      `recipe "${recipe.id}" needs tier ${recipe.unlockTier ?? ""}`,
    );
  }
  let station: Entity;
  let data: WorkstationData;
  if (request.workstationId === undefined) {
    station = pickStation(engine, recipe.id);
    data = requireWorkstation(engine, station.id).data;
  } else {
    ({ station, data } = requireWorkstation(engine, request.workstationId));
  }
  if (!canMake(engine, station, recipe)) {
    throw new ProductionError(
      ProductionErrorKind.RecipeNotCompatible,
      `workstation ${station.id} cannot make recipe "${recipe.id}" (needs a ${recipe.workstationTag})`,
    );
  }
  const order: ProductionOrder = {
    orderId: engine.counters.allocate(CounterName.ProductionOrderId),
    workstationId: station.id,
    recipeId: recipe.id,
    quantity: request.quantity,
    remaining: request.quantity,
    priority,
    status: OrderStatus.Active,
    postingId: null,
    createdTick: engine.time.tickCount,
  };
  data.orders.push(order);
  pruneFinishedOrders(data);
  const payload: OrderEvent = {
    orderId: order.orderId,
    workstationId: station.id,
    recipeId: recipe.id,
  };
  engine.bus.emit(orderCreatedEvent, payload);
  return { ...order };
}

/**
 * Takes the posting of an order off the board before a crafter has started. An open posting is
 * cancelled. A claimed posting whose craft has not started (the crafter is still fetching inputs)
 * is cancelled too, after the crafter's task was told to stop (its cancel hook hands back what it
 * carries). A craft that already runs is left alone: it finishes (DECISIONS D-10).
 *
 * @param engine - The engine.
 * @param data - The data of the workstation holding the order.
 * @param order - The order (changed in place: the posting link is cleared when withdrawn).
 */
function withdrawPosting(engine: GameEngine, data: WorkstationData, order: ProductionOrder): void {
  if (order.postingId === null || data.craft?.orderId === order.orderId) {
    return;
  }
  const found = findPosting(engine, order.postingId);
  if (found !== null) {
    if (found.posting.status === PostingStatus.Claimed && found.posting.claimantId !== null) {
      cancelCraftTask(engine, found.posting.claimantId, found.posting.id);
    }
    cancelPosting(engine, found.posting.id, orderWithdrawnReason, engine.time.tickCount);
  }
  order.postingId = null;
}

/**
 * Cancels an order (command `CancelProductionOrder`, DECISIONS D-10): no new craft of it starts,
 * an open posting is withdrawn, and a craft already running **finishes** (its output is made and
 * counted, the order stays `Cancelled`). A crafter that is still fetching inputs stops instead.
 * Cancelling a finished order changes nothing. Queues `production.order.cancelled`.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @returns A copy of the order.
 * @throws ProductionError `UnknownOrder`.
 */
export function cancelProductionOrder(engine: GameEngine, orderId: number): ProductionOrder {
  return cancelOrderAt(engine, requireOrder(engine, orderId));
}

/**
 * Cancels an order that is already located (the rule of {@link cancelProductionOrder}); used by
 * the deletion of a workstation, whose entity can no longer be found by id.
 *
 * @param engine - The engine.
 * @param location - The order with its workstation.
 * @returns A copy of the order.
 */
export function cancelOrderAt(engine: GameEngine, location: OrderLocation): ProductionOrder {
  const { station, data, order } = location;
  if (isFinished(order)) {
    return { ...order };
  }
  order.status = OrderStatus.Cancelled;
  withdrawPosting(engine, data, order);
  const payload: OrderEvent = {
    orderId: order.orderId,
    workstationId: station.id,
    recipeId: order.recipeId,
  };
  engine.bus.emit(orderCancelledEvent, payload);
  pruneFinishedOrders(data);
  return { ...order };
}

/**
 * Pauses or resumes an order (command `SetProductionOrderPaused`). A paused order starts no new
 * craft (like a cancel, its open posting is withdrawn and a running craft finishes); resuming
 * makes it eligible again. Finished orders are not changed.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @param paused - True to pause, false to resume.
 * @returns A copy of the order.
 * @throws ProductionError `UnknownOrder`.
 */
export function setProductionOrderPaused(
  engine: GameEngine,
  orderId: number,
  paused: boolean,
): ProductionOrder {
  const { data, order } = requireOrder(engine, orderId);
  if (isFinished(order)) {
    return { ...order };
  }
  order.status = paused ? OrderStatus.Paused : OrderStatus.Active;
  if (paused) {
    withdrawPosting(engine, data, order);
  }
  return { ...order };
}

/**
 * Changes the priority of an order (command `SetProductionOrderPriority`); the order's open
 * posting follows at once.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @param priority - New priority `0..100`.
 * @returns A copy of the order.
 * @throws ProductionError `UnknownOrder`, `InvalidQuantity` for a priority outside `0..100`.
 */
export function setProductionOrderPriority(
  engine: GameEngine,
  orderId: number,
  priority: number,
): ProductionOrder {
  const { order } = requireOrder(engine, orderId);
  if (!Number.isSafeInteger(priority) || priority < 0 || priority > maxOrderPriority) {
    throw new ProductionError(
      ProductionErrorKind.InvalidQuantity,
      `priority ${priority} is not within 0..${maxOrderPriority}`,
    );
  }
  order.priority = priority;
  const found = order.postingId === null ? null : findPosting(engine, order.postingId);
  if (found !== null) {
    found.posting.priority = priority;
  }
  return { ...order };
}

/**
 * Interrupts the craft running at a workstation (command `CancelCraft`, DECISIONS D-10, spec 014
 * FR-013a): the locked inputs are released, nothing is consumed, progress goes back to 0 and the
 * order stays as it was (the posting is open again for the next crafter). The crafter's task stops
 * at its next turn (slot 6); the workstation is free from then on.
 *
 * @param engine - The engine.
 * @param workstationId - Workstation entity id.
 * @returns True when a craft was running.
 * @throws ProductionError `UnknownEntity`.
 */
export function cancelCraft(engine: GameEngine, workstationId: number): boolean {
  const { station, data } = requireWorkstation(engine, workstationId);
  const craft = data.craft;
  if (craft === null) {
    return false;
  }
  if (!cancelCraftTask(engine, craft.crafterId, craft.postingId)) {
    // The crafter has no such task any more (it vanished): free the workstation right away.
    interruptCraft(engine, station, data, "player_cancel");
  }
  return true;
}
