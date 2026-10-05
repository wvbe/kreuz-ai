import type { JsonValue } from "../engine/EventBus";
import type { GameEngine } from "../engine/GameEngine";
import type { StatusContext } from "./statusContext";

/**
 * Id of the status system (slot 18), dependency name for systems that read statuses.
 */
export const statusSystemId = "status";

/**
 * Id of the flow ledger system (slot 19).
 */
export const ledgerSystemId = "status.ledger";

/**
 * Ticks a non-Active state or a new primary reason must hold before it is published (spec 025
 * `statusGraceTicks`).
 */
export const statusGraceTicks = 12;

/**
 * Complete game days the flow ledger keeps next to the current day (spec 025 `ledgerWindowDays`).
 */
export const ledgerWindowDays = 7;

/**
 * Most cause links `explain` follows from the subject (spec 025 `maxExplanationDepth`).
 */
export const maxExplanationDepth = 5;

/**
 * Event: a subject settled into a non-Active state or its published primary reason changed
 * (`{subject, state, reason, previousReason, sinceTick}`).
 */
export const statusBlockedEvent = "status.blocked";

/**
 * Event: a settled non-Active subject became Active or disappeared
 * (`{subject, previousReason, stalledTicks, removed}`).
 */
export const statusUnblockedEvent = "status.unblocked";

/**
 * The three states of a subject (spec 025 FR-002). Idle is only used for citizens without work,
 * workstations without orders and dwellings; everything else that is not Active is Blocked. The
 * enum value is the serialized state.
 */
export enum StatusState {
  Active = "Active",
  Idle = "Idle",
  Blocked = "Blocked",
}

/**
 * What a status is about (spec 025 `StatusSubjectKind`, plus `ProductionOrder`, the order view
 * that DECISIONS D-49 promises). `StandingOrder` and `Dwelling` have no provider before tasks 4.3
 * and 4.5. The enum value is the serialized kind.
 */
export enum StatusSubjectKind {
  Citizen = "Citizen",
  JobPosting = "JobPosting",
  JobBoard = "JobBoard",
  Workstation = "Workstation",
  ProductionOrder = "ProductionOrder",
  ConstructionSite = "ConstructionSite",
  Zone = "Zone",
  LoosePile = "LoosePile",
  StandingOrder = "StandingOrder",
  Dwelling = "Dwelling",
}

/**
 * The reason kinds (spec 025 FR-003, 23 of them, in the precedence order of FR-004), plus two
 * additions of DECISIONS D-51: `AwaitingDecision` (a citizen stands idle although a posting it
 * could claim exists; it decides within its idle wait) and `Unexplained`, the visible fallback of
 * a provider that found no reason (a bug; the soak test asserts it never appears). The enum value
 * is the kind name.
 */
export enum BlockedReasonKind {
  Paused = "Paused",
  NoSeatOfGovernment = "NoSeatOfGovernment",
  NoSteward = "NoSteward",
  LockedByTier = "LockedByTier",
  ScopeZoneMissing = "ScopeZoneMissing",
  ZoneRequirementsUnmet = "ZoneRequirementsUnmet",
  ZoneInactive = "ZoneInactive",
  MissingWorkstation = "MissingWorkstation",
  MissingRoom = "MissingRoom",
  LocationBlocked = "LocationBlocked",
  Unreachable = "Unreachable",
  NoReachableJobBoard = "NoReachableJobBoard",
  NoQualifiedWorker = "NoQualifiedWorker",
  MissingTool = "MissingTool",
  NoHouseholdStorage = "NoHouseholdStorage",
  MissingInput = "MissingInput",
  NoStorageDestination = "NoStorageDestination",
  OutputBlocked = "OutputBlocked",
  AwaitingTownCrier = "AwaitingTownCrier",
  AwaitingWorker = "AwaitingWorker",
  AwaitingDecision = "AwaitingDecision",
  NoJobsAvailable = "NoJobsAvailable",
  DwellingRequirementsUnmet = "DwellingRequirementsUnmet",
  NoOrders = "NoOrders",
  Unexplained = "Unexplained",
}

/**
 * What an Active subject is doing, so that "why is this citizen not idle?" has an answer too. The
 * enum value is the serialized kind.
 */
export enum ActivityKind {
  /**
   * A citizen runs a claimed job (`params.jobTypeId`, `params.postingId`).
   */
  Working = "Working",
  Sleeping = "Sleeping",
  /**
   * A citizen fetches or consumes an item for a need (`params.needId`, `params.materialId`).
   */
  Eating = "Eating",
  /**
   * A citizen walks to a board to claim a posting (`params.boardId`).
   */
  WalkingToBoard = "WalkingToBoard",
  /**
   * A workstation crafts (`params.recipeId`, `params.crafterId`).
   */
  Crafting = "Crafting",
  /**
   * A posting has a claimant (`params.claimantId`).
   */
  Claimed = "Claimed",
}

/**
 * What an Active subject does, as data.
 */
export type Activity = {
  kind: ActivityKind;
  params: { [name: string]: JsonValue };
};

/**
 * A pointer to a subject: its kind and its id (an entity id; a posting id for `JobPosting`; an
 * order id for `ProductionOrder` and `StandingOrder`). DECISIONS D-51 simplifies the spec's
 * `{kind, entityId, postingId?}` shapes to one `id`.
 */
export type StatusSubjectRef = {
  kind: StatusSubjectKind;
  id: number;
};

/**
 * One structured reason (spec 025 `BlockedReason`): a kind, int/bool/id params and an optional
 * cause. Never text.
 */
export type Reason = {
  kind: BlockedReasonKind;
  params: { [name: string]: JsonValue };
  causeRef: StatusSubjectRef | null;
};

/**
 * What a provider returns for one subject: the state, what an Active subject does and the reasons
 * of a non-Active one in the precedence order (the first is the primary reason).
 */
export type SubjectStatus = {
  state: StatusState;
  activity: Activity | null;
  reasons: Reason[];
};

/**
 * The extension point of spec 025 FR-005 and DECISIONS D-18 (derivation, not reporting): a system
 * registers one provider per subject kind with `StatusService.registerProvider`. Providers are
 * pure: they read the game and return, they never store state.
 */
export type StatusProvider = {
  kind: StatusSubjectKind;
  /**
   * The live subjects of this kind in a stable order (entity insertion order, ascending ids).
   */
  subjects: (engine: GameEngine) => StatusSubjectRef[];
  /**
   * The status of one subject, or null when it does not exist (any more).
   */
  evaluate: (
    engine: GameEngine,
    ref: StatusSubjectRef,
    context: StatusContext,
  ) => SubjectStatus | null;
};

/**
 * One step of an explanation chain: a subject, its state and its primary reason.
 */
export type ChainLink = {
  subject: StatusSubjectRef;
  state: StatusState;
  activity: Activity | null;
  reason: Reason | null;
};

/**
 * Why a chain stops. The enum value is the serialized end.
 */
export enum ChainEnd {
  /**
   * The last link has no cause to follow.
   */
  Complete = "Complete",
  /**
   * The cause is a subject that is already in the chain.
   */
  Cycle = "Cycle",
  /**
   * `maxExplanationDepth` causes were followed.
   */
  DepthCap = "DepthCap",
  /**
   * The cause is a subject that no longer exists or has no provider.
   */
  Gone = "Gone",
}

/**
 * The answer of `explain`: the status of the subject, all its reasons and the chain of causes of
 * the primary reason.
 */
export type Explanation = {
  subject: StatusSubjectRef;
  state: StatusState;
  activity: Activity | null;
  reasons: Reason[];
  chain: ChainLink[];
  end: ChainEnd;
};

/**
 * The persisted settle record of one subject (DECISIONS D-18 and D-51): the published state and
 * primary reason, when the stall began, and the unpublished change waiting out its grace period.
 */
export type StatusRecord = {
  subject: StatusSubjectRef;
  /**
   * Published state.
   */
  state: StatusState;
  /**
   * Published primary reason, null while Active.
   */
  reason: Reason | null;
  /**
   * First tick of the published stall (the tick the state became Active while Active).
   */
  sinceTick: number;
  /**
   * Tick the published primary reason began.
   */
  reasonSinceTick: number;
  /**
   * First tick of the current continuous run of non-Active observations, null otherwise.
   */
  stallStart: number | null;
  /**
   * Key of the observed change that is not published yet, or null.
   */
  pendingKey: string | null;
  /**
   * Tick the pending change was first observed, or null.
   */
  pendingSince: number | null;
};

/**
 * Payload of `status.blocked`.
 */
export type StatusBlocked = {
  subject: StatusSubjectRef;
  state: StatusState;
  reason: Reason;
  previousReason: Reason | null;
  sinceTick: number;
};

/**
 * Payload of `status.unblocked`.
 */
export type StatusUnblocked = {
  subject: StatusSubjectRef;
  previousReason: Reason | null;
  stalledTicks: number;
  removed: boolean;
};

/**
 * One row of the Idle & Blocked list.
 */
export type IdleBlockedRow = {
  subject: StatusSubjectRef;
  state: StatusState;
  reasons: Reason[];
  sinceTick: number;
  /**
   * True when the subject was published in this state (it held the grace period).
   */
  settled: boolean;
};

/**
 * Direction of a flow entry. The enum value is the serialized direction.
 */
export enum FlowDirection {
  Produced = "Produced",
  Consumed = "Consumed",
}

/**
 * Where a flow entry comes from (spec 025 `FlowSource`). The enum value is the serialized source.
 */
export enum FlowSource {
  Recipe = "Recipe",
  Gathering = "Gathering",
  Deconstruction = "Deconstruction",
  Construction = "Construction",
  NeedConsumption = "NeedConsumption",
  HouseholdConsumption = "HouseholdConsumption",
  Spoilage = "Spoilage",
  Trade = "Trade",
}

/**
 * One counted amount of the ledger: material, direction, source and the subject that caused it.
 */
export type FlowEntry = {
  materialId: string;
  direction: FlowDirection;
  source: FlowSource;
  /**
   * The workstation, build site, citizen or dwelling behind the amount; null when no subject
   * applies (spoilage in a storage that is no subject).
   */
  subject: StatusSubjectRef | null;
  quantity: number;
};

/**
 * All counts of one game day, ascending by material, direction, source, subject.
 */
export type FlowDay = {
  day: number;
  entries: FlowEntry[];
};

/**
 * One producer or consumer of a material in the window.
 */
export type FlowParty = {
  subject: StatusSubjectRef | null;
  source: FlowSource;
  quantity: number;
};

/**
 * One row of the Flow view (spec 025 FR-018): per day averages (x1000, over the complete days of
 * the window; the current day alone while no day is complete yet), stock, days of supply, the
 * daily net trend (oldest first, the current day last) and who produced and consumed.
 */
export type FlowRow = {
  materialId: string;
  producedPerDayMilli: number;
  consumedPerDayMilli: number;
  netPerDayMilli: number;
  stock: number;
  /**
   * `stock / -net` in days x1000, or null while the net is not negative.
   */
  daysOfSupplyMilli: number | null;
  trend: number[];
  windowProduced: number;
  windowConsumed: number;
  producers: FlowParty[];
  consumers: FlowParty[];
};
