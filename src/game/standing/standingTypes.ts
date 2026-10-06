import type { EntityId } from "../ecs/Entity";

/**
 * Id of the Steward system (slot 14: prune, daily review, bells; the commands, the queries
 * `standing-orders`, `standing-order` and `steward`).
 */
export const standingSystemId = "standing";

/**
 * Task type of the Steward's audience in the throne room (spec 026 FR-015, D-19).
 */
export const audienceTaskType = "govern.steward_audience";

/**
 * Priority of the audience task: above job work (50) and delivery trips (80 is the crier's), below
 * critical needs (100), so the Steward still eats (spec 026 FR-015, spec 013 FR-003).
 */
export const audienceTaskPriority = 70;

/**
 * Zone type id of the Bell Tower (spec 026 FR-022).
 */
export const bellTowerZoneTypeId = "bell_tower";

/**
 * Furniture id of the bell that makes a Bell Tower ring.
 */
export const churchBellFurnitureId = "church_bell";

/**
 * Furniture id of the Notice Post (spec 026 FR-021).
 */
export const noticePostFurnitureId = "notice_post";

/**
 * Where a standing order counts its stock (spec 026 FR-001). The enum value is the serialized
 * scope.
 */
export enum StandingOrderScope {
  /**
   * Every storage of the player settlement (all maps) and the workstation inventories.
   */
  Settlement = "settlement",
  /**
   * The storage furniture on the tiles of one zone.
   */
  Zone = "zone",
}

/**
 * The derived state of an order (spec 026 FR-001, D-19): `Paused` beats `Blocked` beats the
 * hysteresis state `Restocking` / `Satisfied`. The enum value is the serialized state.
 */
export enum StandingOrderState {
  Satisfied = "Satisfied",
  Restocking = "Restocking",
  Blocked = "Blocked",
  Paused = "Paused",
}

/**
 * Where an owned run is on its way (spec 026 FR-009). The enum value is the serialized status.
 */
export enum RunStatus {
  /**
   * Queued on a crier's load, not delivered yet.
   */
  PendingAdd = "PendingAdd",
  /**
   * Delivered: a production order exists and no crafter has taken it.
   */
  Open = "Open",
  /**
   * A crafter has the job or the craft runs.
   */
  Claimed = "Claimed",
}

/**
 * Failure categories of the standing-order and Steward commands (section 3.9 of DECISIONS plus
 * the lookups). The enum value is the name the message starts with.
 */
export enum StandingOrderErrorKind {
  NoProducingRecipe = "NoProducingRecipe",
  AmbiguousRecipe = "AmbiguousRecipe",
  InvalidQuantity = "InvalidQuantity",
  DuplicateOrder = "DuplicateOrder",
  UnknownZone = "UnknownZone",
  UnknownOrder = "UnknownOrder",
  UnknownMaterial = "UnknownMaterial",
  UnknownRecipe = "UnknownRecipe",
  ContentLocked = "ContentLocked",
  BoardNotUserManaged = "BoardNotUserManaged",
  IneligibleSteward = "IneligibleSteward",
  TooManyOrders = "TooManyOrders",
}

/**
 * Why the office was vacated (spec 026 FR-016). The enum value is the event payload.
 */
export enum StewardVacancyReason {
  Dismissed = "Dismissed",
  Replaced = "Replaced",
  Died = "Died",
  LeftFaction = "LeftFaction",
}

/**
 * Why a review did not run (spec 026 FR-014). The enum value is the event payload.
 */
export enum ReviewSkipReason {
  NoSteward = "NoSteward",
  NoSeatOfGovernment = "NoSeatOfGovernment",
}

/**
 * One standing order ("keep N of a material in stock"). The hysteresis bit `restocking` is saved
 * under the derived state (D-19).
 */
export type StandingOrder = {
  /**
   * From the persisted `nextOrderId`, never reused.
   */
  orderId: number;
  materialId: string;
  recipeId: string;
  targetQuantity: number;
  /**
   * Restocking starts when the stock is at or below it.
   */
  restockThreshold: number;
  scope: StandingOrderScope;
  /**
   * The zone of a `Zone` scope, else null.
   */
  zoneId: EntityId | null;
  /**
   * `0..100`, the priority of the runs.
   */
  priority: number;
  /**
   * The user-managed board the player chose for the runs, or null for the Steward's choice.
   */
  postingBoardId: EntityId | null;
  paused: boolean;
  /**
   * The hysteresis bit: true between reaching the threshold and reaching the target.
   */
  restocking: boolean;
  /**
   * Units of the material one run makes (spec 026 FR-002).
   */
  outputPerRun: number;
  /**
   * True once the player deleted it: it keeps running claimed runs and is dropped with the last.
   */
  deleted: boolean;
  createdTick: number;
};

/**
 * One run a standing order owns: one craft that a crier delivers and that becomes a production
 * order of quantity 1 (spec 026 FR-009/012).
 */
export type OwnedRun = {
  /**
   * From the persisted `nextRunId`, never reused.
   */
  runId: number;
  orderId: number;
  /**
   * The user-managed board the run was queued for.
   */
  boardId: EntityId;
  /**
   * The pending board update while the run is `PendingAdd`, else null.
   */
  updateId: number | null;
  /**
   * The production order once the run was delivered, else null.
   */
  productionOrderId: number | null;
};

/**
 * The saved state of the Steward system (root key `stewardship`, spec 026 FR-026).
 */
export type StewardshipState = {
  nextOrderId: number;
  nextRunId: number;
  orders: StandingOrder[];
  runs: OwnedRun[];
  stewardEntityId: EntityId | null;
  /**
   * The settlement-wide board of the Steward (`SetStewardBoard`), or null.
   */
  stewardBoardId: EntityId | null;
  /**
   * The tick after which an extra review runs (`RequestStewardReview`), or null.
   */
  extraReviewAfterTick: number | null;
  lastReviewTick: number | null;
};

/**
 * Event: an order was created (`{orderId}`).
 */
export const standingOrderCreatedEvent = "standing-order.created";

/**
 * Event: an order was edited (`{orderId}`).
 */
export const standingOrderUpdatedEvent = "standing-order.updated";

/**
 * Event: an order was paused (`{orderId}`).
 */
export const standingOrderPausedEvent = "standing-order.paused";

/**
 * Event: an order was resumed (`{orderId}`).
 */
export const standingOrderResumedEvent = "standing-order.resumed";

/**
 * Event: an order was deleted (`{orderId}`).
 */
export const standingOrderDeletedEvent = "standing-order.deleted";

/**
 * Event: an order started restocking (`{orderId, stock, target}`).
 */
export const restockStartedEvent = "standing-order.restock.started";

/**
 * Event: an order reached its target (`{orderId, stock}`).
 */
export const standingSatisfiedEvent = "standing-order.satisfied";

/**
 * Event: a Steward was appointed (`{entityId}`).
 */
export const stewardAppointedEvent = "steward.appointed";

/**
 * Event: the office was vacated (`{entityId, reason}`).
 */
export const stewardDismissedEvent = "steward.dismissed";

/**
 * Event: a review ran (`{tick, ordersEvaluated, postingsQueued, withdrawalsQueued}`).
 */
export const reviewCompletedEvent = "steward.review.completed";

/**
 * Event: a review was due but could not run (`{tick, reason}`).
 */
export const reviewSkippedEvent = "steward.review.skipped";

/**
 * Event: a Bell Tower rang (`{zoneId, tickOfDay}`).
 */
export const bellRangEvent = "bell-tower.rang";

/**
 * Payload of the `standing-order.*` events that name only the order.
 */
export type StandingOrderEvent = {
  orderId: number;
};

/**
 * Payload of `standing-order.restock.started`.
 */
export type RestockStarted = {
  orderId: number;
  stock: number;
  target: number;
};

/**
 * Payload of `standing-order.satisfied`.
 */
export type StandingSatisfied = {
  orderId: number;
  stock: number;
};

/**
 * Payload of `steward.appointed`.
 */
export type StewardAppointed = {
  entityId: EntityId;
};

/**
 * Payload of `steward.dismissed`.
 */
export type StewardDismissed = {
  entityId: EntityId;
  reason: StewardVacancyReason;
};

/**
 * Payload of `steward.review.completed`.
 */
export type ReviewCompleted = {
  tick: number;
  ordersEvaluated: number;
  postingsQueued: number;
  withdrawalsQueued: number;
};

/**
 * Payload of `steward.review.skipped`.
 */
export type ReviewSkipped = {
  tick: number;
  reason: ReviewSkipReason;
};

/**
 * Payload of `bell-tower.rang`.
 */
export type BellRang = {
  zoneId: EntityId;
  tickOfDay: number;
};
