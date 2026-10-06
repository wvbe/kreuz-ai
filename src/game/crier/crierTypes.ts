import type { EntityId } from "../ecs/Entity";

/**
 * Id of the Town Crier system (dependency name for systems that queue board updates).
 */
export const crierSystemId = "towncrier";

/**
 * Task type of a crier's walk to a board and the delivery on arrival.
 */
export const deliverTaskType = "towncrier.deliver";

/**
 * Priority of the delivery task: above jobs (50) so a dispatched crier drops its work, below
 * critical needs (100) so it still eats.
 */
export const deliverTaskPriority = 80;

/**
 * Abandon reason: the board no longer exists.
 */
export const boardGoneReason = "board_gone";

/**
 * Abandon reason: the crier cannot reach the board.
 */
export const boardUnreachableReason = "board_unreachable";

/**
 * Abandon reason: the carrying crier was deleted or dismissed on the way.
 */
export const crierLostReason = "crier_lost";

/**
 * Abandon reason: a change failed when it was applied (the posting is gone, the job type got
 * locked ...).
 */
export const changeRejectedReason = "change_rejected";

/**
 * Whether a Town Crier is free to take a delivery. The enum value is the serialized status.
 */
export enum CrierStatus {
  Available = "available",
  Traveling = "traveling",
}

/**
 * The kinds of change a player can queue on a user-managed board. The enum value is the
 * serialized `kind`.
 */
export enum BoardChangeKind {
  Add = "add",
  Remove = "remove",
  Modify = "modify",
}

/**
 * Who queued an update (DECISIONS D-08). The enum value is the serialized origin.
 */
export enum UpdateOrigin {
  Player = "Player",
  Steward = "Steward",
}

/**
 * How an update reached its board (spec 017 FR-015 `via`); notice posts and bell towers belong to
 * task 4.3. The enum value is the event payload.
 */
export enum DeliveryMethod {
  TownCrier = "TownCrier",
  NoticePost = "NoticePost",
  BellTower = "BellTower",
}

/**
 * One change of a pending update: post a job, withdraw a posting or edit one.
 */
export type BoardChange =
  | {
      kind: BoardChangeKind.Add;
      jobTypeId: string;
      mapId: number;
      cellIndex: number;
      entityId: EntityId | null;
      materialId: string | null;
      priority: number | null;
      urgent: boolean;
      wage: number | null;
    }
  | { kind: BoardChangeKind.Remove; postingId: number }
  | {
      kind: BoardChangeKind.Modify;
      postingId: number;
      priority: number | null;
      wage: number | null;
    };

/**
 * A queued set of changes for one user-managed board (DECISIONS D-12), waiting for a crier.
 */
export type PendingBoardUpdate = {
  /**
   * From the persisted `nextUpdateId`, never reused.
   */
  updateId: number;
  boardId: EntityId;
  changes: BoardChange[];
  origin: UpdateOrigin;
  createdTick: number;
  /**
   * The crier that carries it, or null while it waits for one.
   */
  crierId: EntityId | null;
  /**
   * Tick of the dispatch, or null while it waits.
   */
  dispatchedTick: number | null;
  /**
   * Path cost from the crier's position at dispatch to the board (the denominator of the progress).
   */
  startCost: number;
};

/**
 * Data of the `TownCrier` component (DECISIONS D-12).
 */
export type TownCrierData = {
  status: CrierStatus;
  /**
   * Boards still to visit on the current trip (the board being walked to first).
   */
  boardQueue: EntityId[];
  /**
   * Ids of the pending updates on board.
   */
  carrying: number[];
};

/**
 * Event: a player or steward change was queued.
 */
export const updateQueuedEvent = "jobboard.update.queued";

/**
 * Event: a crier delivered an update.
 */
export const updateAppliedEvent = "jobboard.update.applied";

/**
 * Event: an update was dropped without being applied.
 */
export const updateAbandonedEvent = "jobboard.update.abandoned";

/**
 * Event: a crier set out for a board.
 */
export const crierDispatchedEvent = "towncrier.dispatched";

/**
 * Payload of `jobboard.update.queued`.
 */
export type UpdateQueued = {
  updateId: number;
  boardId: EntityId;
  origin: UpdateOrigin;
};

/**
 * Payload of `jobboard.update.applied`.
 */
export type UpdateApplied = {
  updateId: number;
  boardId: EntityId;
  via: DeliveryMethod;
};

/**
 * Payload of `jobboard.update.abandoned`.
 */
export type UpdateAbandoned = {
  updateId: number;
  boardId: EntityId;
  reason: string;
};

/**
 * Payload of `towncrier.dispatched`.
 */
export type CrierDispatched = {
  crierId: EntityId;
  boardIds: EntityId[];
};
