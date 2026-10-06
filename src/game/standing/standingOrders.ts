import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getBoard } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import { zoneComponent } from "../zones/zoneComponent";
import { withdrawable, withdrawRun } from "./ownedRuns";
import { resolveRecipe } from "./resolveRecipe";
import { StandingOrderError } from "./StandingOrderError";
import { getStandingService } from "./standingServiceRegistry";
import {
  standingOrderCreatedEvent,
  standingOrderDeletedEvent,
  standingOrderPausedEvent,
  standingOrderResumedEvent,
  standingOrderUpdatedEvent,
  StandingOrderErrorKind,
  StandingOrderScope,
} from "./standingTypes";
import type { StandingOrder, StandingOrderEvent } from "./standingTypes";

/**
 * Highest priority of an order (the posting scale `0..100`).
 */
export const maxStandingPriority = 100;

/**
 * Priority of an order that names none (the production default).
 */
export const defaultStandingPriority = 50;

/**
 * What the player gives to {@link createStandingOrder} (command `CreateStandingOrder`).
 */
export type StandingOrderRequest = {
  materialId?: string;
  recipeId?: string;
  targetQuantity: number;
  restockThreshold?: number;
  /**
   * The zone of a zone-scoped order; omitted for the whole settlement.
   */
  zoneId?: EntityId;
  priority?: number;
  postingBoardId?: EntityId;
};

/**
 * What the player may change on an order (command `UpdateStandingOrder`); `postingBoardId: null`
 * hands the choice back to the Steward.
 */
export type StandingOrderPatch = {
  targetQuantity?: number;
  restockThreshold?: number;
  priority?: number;
  postingBoardId?: EntityId | null;
};

function emit(engine: GameEngine, name: string, orderId: number): void {
  const payload: StandingOrderEvent = { orderId };
  engine.bus.emit(name, payload);
}

function checkPriority(priority: number): void {
  if (!Number.isSafeInteger(priority) || priority < 0 || priority > maxStandingPriority) {
    throw new StandingOrderError(
      StandingOrderErrorKind.InvalidQuantity,
      `priority ${priority} is not within 0..${maxStandingPriority}`,
    );
  }
}

function checkBoard(engine: GameEngine, boardId: EntityId): void {
  const found = getBoard(engine, boardId);
  if (found === null || found.data.mode !== JobBoardMode.UserManaged) {
    throw new StandingOrderError(
      StandingOrderErrorKind.BoardNotUserManaged,
      `entity ${boardId} is not a user-managed job board`,
    );
  }
}

function checkQuantities(target: number, threshold: number): void {
  if (
    !Number.isSafeInteger(target) ||
    target < 1 ||
    !Number.isSafeInteger(threshold) ||
    threshold < 0 ||
    threshold >= target
  ) {
    throw new StandingOrderError(
      StandingOrderErrorKind.InvalidQuantity,
      `target ${target} must be at least 1 and the restock threshold ${threshold} within 0..${target - 1}`,
    );
  }
}

/**
 * The restock threshold of an order that names none (spec 026 FR-003):
 * `floor(target * defaultRestockFraction / 1000)`, at most `target - 1`.
 *
 * @param engine - The engine (the fraction is a content constant, permille).
 * @param target - Target quantity, at least 1.
 * @returns The threshold.
 */
export function defaultThreshold(engine: GameEngine, target: number): number {
  const fraction = engine.content.constants.defaultRestockFraction;
  return Math.max(0, Math.min(target - 1, Math.floor((target * fraction) / 1000)));
}

/**
 * Creates a standing order (command `CreateStandingOrder`, spec 026 FR-002..004): the recipe and
 * material are resolved ({@link resolveRecipe}), the threshold defaults to
 * {@link defaultThreshold}, the order starts `Satisfied` (D-19: the first review flips it when
 * the stock is at or below the threshold). Nothing changes when the request is invalid. Queues
 * `standing-order.created`.
 *
 * @param engine - The engine.
 * @param request - Material or recipe, target, optional threshold, zone, priority and board.
 * @returns A copy of the new order.
 * @throws StandingOrderError `NoProducingRecipe`, `AmbiguousRecipe`, `InvalidQuantity`,
 *   `DuplicateOrder`, `UnknownZone`, `BoardNotUserManaged`, `TooManyOrders`, `ContentLocked`,
 *   `UnknownMaterial`, `UnknownRecipe`.
 */
export function createStandingOrder(
  engine: GameEngine,
  request: StandingOrderRequest,
): StandingOrder {
  const service = getStandingService(engine);
  const resolved = resolveRecipe(engine, request.materialId, request.recipeId);
  const threshold = request.restockThreshold ?? defaultThreshold(engine, request.targetQuantity);
  checkQuantities(request.targetQuantity, threshold);
  const priority = request.priority ?? defaultStandingPriority;
  checkPriority(priority);
  const zoneEntity = request.zoneId === undefined ? undefined : engine.store.get(request.zoneId);
  if (
    request.zoneId !== undefined &&
    (zoneEntity === undefined || getComponent(zoneEntity, zoneComponent) === undefined)
  ) {
    throw new StandingOrderError(
      StandingOrderErrorKind.UnknownZone,
      `entity ${request.zoneId} is not a zone`,
    );
  }
  if (request.postingBoardId !== undefined) {
    checkBoard(engine, request.postingBoardId);
  }
  const zoneId = request.zoneId ?? null;
  const live = service.state.orders.filter((order) => !order.deleted);
  if (live.some((order) => order.materialId === resolved.materialId && order.zoneId === zoneId)) {
    throw new StandingOrderError(
      StandingOrderErrorKind.DuplicateOrder,
      `an order for "${resolved.materialId}" already exists for this scope`,
    );
  }
  if (live.length >= engine.content.constants.maxStandingOrders) {
    throw new StandingOrderError(
      StandingOrderErrorKind.TooManyOrders,
      `at most ${engine.content.constants.maxStandingOrders} standing orders are allowed`,
    );
  }
  const order: StandingOrder = {
    orderId: service.state.nextOrderId,
    materialId: resolved.materialId,
    recipeId: resolved.recipeId,
    targetQuantity: request.targetQuantity,
    restockThreshold: threshold,
    scope: zoneId === null ? StandingOrderScope.Settlement : StandingOrderScope.Zone,
    zoneId,
    priority,
    postingBoardId: request.postingBoardId ?? null,
    paused: false,
    restocking: false,
    outputPerRun: resolved.outputPerRun,
    deleted: false,
    createdTick: engine.time.tickCount,
  };
  service.state.nextOrderId += 1;
  service.state.orders.push(order);
  emit(engine, standingOrderCreatedEvent, order.orderId);
  return { ...order };
}

function requireLive(engine: GameEngine, orderId: number): StandingOrder {
  const order = getStandingService(engine).find(orderId);
  if (order === undefined || order.deleted) {
    throw new StandingOrderError(
      StandingOrderErrorKind.UnknownOrder,
      `standing order ${orderId} does not exist`,
    );
  }
  return order;
}

/**
 * Edits an order (command `UpdateStandingOrder`, spec 026 edge case: edits apply at the next
 * review). A new target without a threshold keeps the old threshold when it still lies below the
 * target, otherwise the default threshold is used. Queues `standing-order.updated`.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @param patch - The fields to change.
 * @returns A copy of the order.
 * @throws StandingOrderError `UnknownOrder`, `InvalidQuantity`, `BoardNotUserManaged`.
 */
export function updateStandingOrder(
  engine: GameEngine,
  orderId: number,
  patch: StandingOrderPatch,
): StandingOrder {
  const order = requireLive(engine, orderId);
  const target = patch.targetQuantity ?? order.targetQuantity;
  let threshold = patch.restockThreshold ?? order.restockThreshold;
  if (patch.restockThreshold === undefined && threshold >= target && target >= 1) {
    threshold = defaultThreshold(engine, target);
  }
  checkQuantities(target, threshold);
  const priority = patch.priority ?? order.priority;
  checkPriority(priority);
  if (patch.postingBoardId !== undefined && patch.postingBoardId !== null) {
    checkBoard(engine, patch.postingBoardId);
  }
  order.targetQuantity = target;
  order.restockThreshold = threshold;
  order.priority = priority;
  if (patch.postingBoardId !== undefined) {
    order.postingBoardId = patch.postingBoardId;
  }
  emit(engine, standingOrderUpdatedEvent, orderId);
  return { ...order };
}

/**
 * Pauses or resumes an order (commands `PauseStandingOrder` / `ResumeStandingOrder`). A paused
 * order is skipped by the review and its unclaimed runs are withdrawn at the next review (spec
 * 026 edge case). Queues `standing-order.paused` / `.resumed`; nothing happens when the order is
 * already in that state.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @param paused - True to pause, false to resume.
 * @returns A copy of the order.
 * @throws StandingOrderError `UnknownOrder`.
 */
export function setStandingOrderPaused(
  engine: GameEngine,
  orderId: number,
  paused: boolean,
): StandingOrder {
  const order = requireLive(engine, orderId);
  if (order.paused !== paused) {
    order.paused = paused;
    emit(engine, paused ? standingOrderPausedEvent : standingOrderResumedEvent, orderId);
  }
  return { ...order };
}

/**
 * Deletes an order (command `DeleteStandingOrder`, spec 026 edge case): its unclaimed runs are
 * withdrawn at once, claimed runs finish, and the record is dropped when the last run ends. A
 * deleted order no longer counts towards the cap or the duplicate rule. Queues
 * `standing-order.deleted`.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @throws StandingOrderError `UnknownOrder`.
 */
export function deleteStandingOrder(engine: GameEngine, orderId: number): void {
  const order = requireLive(engine, orderId);
  order.deleted = true;
  for (const run of withdrawable(engine, orderId)) {
    withdrawRun(engine, run);
  }
  dropFinishedOrders(engine);
  emit(engine, standingOrderDeletedEvent, orderId);
}

/**
 * Removes the records of deleted orders that no longer own a run.
 *
 * @param engine - The engine.
 */
export function dropFinishedOrders(engine: GameEngine): void {
  const service = getStandingService(engine);
  service.state.orders = service.state.orders.filter(
    (order) => !order.deleted || service.runsOf(order.orderId).length > 0,
  );
}
