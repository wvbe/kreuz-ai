import type { EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";

/**
 * Id of the production system (dependency name for systems that post crafting work).
 */
export const productionSystemId = "production";

/**
 * Job type id of crafting (`jobs.json`).
 */
export const craftJobId = "craft.produce";

/**
 * The production poster (craft postings, output hauls, stale-craft sweep) runs every this many
 * ticks (a quarter of a game hour).
 */
export const productionPosterIntervalTicks = 6;

/**
 * A crafter whose finished craft finds no room for the outputs looks again after this many ticks.
 */
export const outputRetryTicks = 6;

/**
 * Finished (completed or cancelled) orders a workstation remembers.
 */
export const maxFinishedOrders = 16;

/**
 * Default priority of an order (the posting scale `0..100`).
 */
export const defaultOrderPriority = 50;

/**
 * Highest priority of an order.
 */
export const maxOrderPriority = 100;

/**
 * Failure reason: a needed input cannot be found any more.
 */
export const missingInputReason = "missing_input";

/**
 * Failure reason: the crafter cannot carry or deposit what the craft needs.
 */
export const noCapacityReason = "no_capacity";

/**
 * Failure reason: the recipe, the workstation or the order is gone or no longer fits.
 */
export const craftBlockedReason = "craft_blocked";

/**
 * Interruption reason: the crafter vanished (deleted) while the craft ran.
 */
export const crafterLostReason = "crafter_lost";

/**
 * Lifecycle of a production order (DECISIONS D-10). The enum value is the serialized status.
 */
export enum OrderStatus {
  Active = "active",
  Paused = "paused",
  Completed = "completed",
  Cancelled = "cancelled",
}

/**
 * One production order: `quantity` crafts of one recipe at one workstation. Standing orders (026)
 * create orders through the same model (`createProductionOrder`) and read `remaining` / `status`.
 */
export type ProductionOrder = {
  /**
   * From the persisted `nextOrderId` counter, never reused.
   */
  orderId: number;
  workstationId: EntityId;
  recipeId: string;
  /**
   * Crafts asked for.
   */
  quantity: number;
  /**
   * Crafts still to finish (`quantity` minus finished ones).
   */
  remaining: number;
  /**
   * Posting priority `0..100`.
   */
  priority: number;
  status: OrderStatus;
  /**
   * The open or claimed `craft.produce` posting of this order, or null.
   */
  postingId: number | null;
  createdTick: number;
};

/**
 * The craft a workstation is working on right now (one crafter per workstation).
 */
export type ActiveCraft = {
  orderId: number;
  crafterId: EntityId;
  postingId: number;
  recipeId: string;
  startedTick: number;
  /**
   * Whole ticks the craft takes, fixed when it starts (`workDuration`).
   */
  durationTicks: number;
  /**
   * The `Lock` and `Tool` reservations on the workstation inventory: inputs are consumed on
   * completion, tools are released.
   */
  reservationIds: number[];
};

/**
 * Data of the `ProductionOrders` component.
 */
export type WorkstationData = {
  /**
   * Orders ascending by id; finished ones are bounded by {@link maxFinishedOrders}.
   */
  orders: ProductionOrder[];
  craft: ActiveCraft | null;
};

/**
 * One item of a craft (inputs or outputs).
 */
export type CraftItem = {
  materialId: string;
  quantity: number;
};

/**
 * Event: an order was created.
 */
export const orderCreatedEvent = "production.order.created";

/**
 * Event: an order finished all its crafts.
 */
export const orderCompletedEvent = "production.order.completed";

/**
 * Event: an order was cancelled.
 */
export const orderCancelledEvent = "production.order.cancelled";

/**
 * Payload of the `production.order.*` events.
 */
export type OrderEvent = {
  orderId: number;
  workstationId: EntityId;
  recipeId: string;
};

/**
 * Event: a crafter locked the inputs and started the timer.
 */
export const craftingStartedEvent = "production.crafting.started";

/**
 * Payload of `production.crafting.started`.
 */
export type CraftingStarted = {
  workstationId: EntityId;
  crafterId: EntityId;
  recipeId: string;
};

/**
 * Event: a craft finished (inputs consumed, outputs placed).
 */
export const craftingCompletedEvent = "production.crafting.completed";

/**
 * Payload of `production.crafting.completed`; `outputs` are the actual quantities including the
 * skill output bonus.
 */
export type CraftingCompleted = {
  workstationId: EntityId;
  crafterId: EntityId;
  recipeId: string;
  inputs: CraftItem[];
  outputs: CraftItem[];
};

/**
 * Event: a craft was interrupted (cancelled by the player, a critical need, the crafter vanished):
 * the locked inputs went back to the workstation, nothing was consumed, progress is 0.
 */
export const craftingInterruptedEvent = "production.crafting.interrupted";

/**
 * Event: a hard failure of a craft (the recipe or the posting vanished under it).
 */
export const craftingFailedEvent = "production.crafting.failed";

/**
 * Payload of `production.crafting.interrupted` and `production.crafting.failed`.
 */
export type CraftingEnded = {
  workstationId: EntityId;
  crafterId: EntityId;
  recipeId: string;
  reason: string;
};

/**
 * Event: the finished craft waits because the outputs do not fit into the workstation (once per
 * craft).
 */
export const outputBlockedEvent = "production.output.blocked";

/**
 * Payload of `production.output.blocked`.
 */
export type OutputBlocked = {
  workstationId: EntityId;
  crafterId: EntityId;
  materialId: string;
};

/**
 * The reason kinds production reports to the status system (spec 025 `BlockedReasonKind`
 * subset). The enum value is the 025 kind name.
 */
export enum ProductionBlockedKind {
  Paused = "Paused",
  LockedByTier = "LockedByTier",
  MissingWorkstation = "MissingWorkstation",
  MissingRoom = "MissingRoom",
  NoQualifiedWorker = "NoQualifiedWorker",
  MissingTool = "MissingTool",
  MissingInput = "MissingInput",
  OutputBlocked = "OutputBlocked",
  NoOrders = "NoOrders",
}

/**
 * What kind of entity a `causeRef` points at.
 */
export enum CauseSubjectKind {
  Zone = "zone",
  Workstation = "workstation",
}

/**
 * A pointer to the subject that explains a reason (spec 025 `StatusSubjectRef`).
 */
export type CauseRef = {
  kind: CauseSubjectKind;
  entityId: EntityId;
};

/**
 * A structured blocked reason (spec 025 `BlockedReason`): a kind, int/bool/id params and an
 * optional cause. Never text.
 */
export type ProductionBlockedReason = {
  kind: ProductionBlockedKind;
  params: { [name: string]: JsonValue };
  causeRef: CauseRef | null;
};

/**
 * The answer of `explainOrder`: the status of the order and why it does not progress (empty when
 * nothing blocks it).
 */
export type OrderExplanation = {
  orderId: number;
  workstationId: EntityId;
  status: OrderStatus;
  /**
   * Sorted by the 025 precedence, then recipe input order.
   */
  reasons: ProductionBlockedReason[];
};
