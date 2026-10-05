import type { EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";

/**
 * Id of the construction system (dependency name for systems that read build sites).
 */
export const constructionSystemId = "construction";

/**
 * Job type id of constructing or deconstructing (`jobs.json`).
 */
export const constructJobId = "build.construct";

/**
 * Job type id of carrying building materials to a site (`jobs.json`).
 */
export const supplyJobId = "build.supply";

/**
 * Prototype id of the wall (an obstruction while it stands).
 */
export const wallPrototypeId = "wall";

/**
 * Prototype id of the door (passable, closes a room).
 */
export const doorPrototypeId = "door";

/**
 * Prototype id of the placeholder for furniture that has no prototype of its own (`Furniture` +
 * `Position`).
 */
export const furniturePiecePrototypeId = "furniture_piece";

/**
 * The construction poster looks every this many ticks (a quarter of a game hour).
 */
export const constructionPosterIntervalTicks = 6;

/**
 * Ticks a finished (done or cancelled) job stays in the queue view (one game day, D-27).
 */
export const recentRetentionTicks = 288;

/**
 * Default priority of a construction job (the posting scale `0..100`).
 */
export const defaultSitePriority = 50;

/**
 * Highest priority of a construction job.
 */
export const maxSitePriority = 100;

/**
 * Failure reason: the site, its definition or the builder's position is gone or invalid.
 */
export const siteBlockedReason = "site_blocked";

/**
 * Failure reason: nothing (unreserved) is left to carry.
 */
export const noSourceReason = "no_source";

/**
 * Failure reason: the supplier cannot carry any of the goods.
 */
export const noCarryCapacityReason = "no_capacity";

/**
 * Cancel reason of postings and tasks when the player cancels a job.
 */
export const constructionCancelledReason = "construction_cancelled";

/**
 * Cancel reason of postings when the site entity vanished.
 */
export const siteDestroyedReason = "site_destroyed";

/**
 * Cancel reason of a job whose cell was taken (or whose target vanished) before it was finished.
 */
export const locationLostReason = "location_lost";

/**
 * Cancel reason of an open posting when the job is paused.
 */
export const constructionPausedReason = "paused";

/**
 * What a build site is for. The enum value is the serialized kind and the `kind` of the events
 * (DECISIONS section 4.4).
 */
export enum SiteKind {
  Construct = "Construction",
  Deconstruct = "Deconstruction",
}

/**
 * Lifecycle of a build site (spec 016, DECISIONS D-27). `Planned`: a blueprint, nothing delivered
 * and nobody on the way. `Supplying`: materials are still missing. `Building`: every material is
 * on the site (a deconstruction starts here); a builder may claim the job and work. `Done` and
 * `Cancelled` are final: the site entity is gone and only the queue history remembers it. The enum
 * value is the serialized status.
 */
export enum SiteStatus {
  Planned = "planned",
  Supplying = "supplying",
  Building = "building",
  Done = "done",
  Cancelled = "cancelled",
}

/**
 * One material of a build definition.
 */
export type SiteMaterial = {
  materialId: string;
  quantity: number;
};

/**
 * Data of the `BuildSite` component: the blueprint of a building (or the order to take one down)
 * and everything the construction jobs need. The delivered materials are the site's own
 * `Inventory` (excluded from storage queries, DECISIONS D-09); the id of the site entity is the
 * job id.
 */
export type BuildSiteData = {
  kind: SiteKind;
  /**
   * Id of the build definition (a furniture record: `oven`, `wall`, `door` ...).
   */
  prototypeId: string;
  /**
   * `Planned`, `Supplying` or `Building` while the entity exists.
   */
  status: SiteStatus;
  /**
   * Materials to deliver (empty for a deconstruction), copied from the definition at placement.
   */
  required: SiteMaterial[];
  /**
   * Work ticks done in the current attempt (`tick - startedTick`, at most `durationTicks`).
   */
  progress: number;
  /**
   * Whole ticks the work takes, fixed when the builder starts; 0 while nobody works.
   */
  durationTicks: number;
  /**
   * Entity that is working on the site right now, or null.
   */
  builderId: EntityId | null;
  /**
   * Tick the builder started working at the site (progress starts then), or null while it is
   * still walking there or nobody works.
   */
  startedTick: number | null;
  /**
   * Entity carrying materials to the site right now, or null (one supplier per site at a time).
   */
  supplierId: EntityId | null;
  /**
   * The open or claimed `build.supply` / `build.construct` posting of the site, or null.
   */
  postingId: number | null;
  /**
   * Posting priority `0..100`.
   */
  priority: number;
  /**
   * Player-urgent: breaks priority ties.
   */
  urgent: boolean;
  /**
   * Paused jobs have no posting and are skipped.
   */
  paused: boolean;
  /**
   * Material that no source can supply while the site waits (`construction.job.suspended`), or
   * null.
   */
  blockedMaterialId: string | null;
  /**
   * Deconstruction: the entity to take down; null for a construction.
   */
  targetEntityId: EntityId | null;
  /**
   * Faction that owns the job (the player government), or null.
   */
  ownerFactionId: EntityId | null;
  createdTick: number;
};

/**
 * A job that finished and is remembered for {@link recentRetentionTicks}.
 */
export type RecentJob = {
  jobId: EntityId;
  kind: SiteKind;
  prototypeId: string;
  status: SiteStatus;
  mapId: number;
  cellIndex: number;
  finishedTick: number;
};

/**
 * Event: a construction or deconstruction job was queued (blueprint placed).
 */
export const jobQueuedEvent = "construction.job.queued";

/**
 * Payload of `construction.job.queued` (DECISIONS section 4.4).
 */
export type JobQueued = {
  jobId: EntityId;
  kind: SiteKind;
  prototypeId: string | null;
  targetEntityId: EntityId | null;
  mapId: number;
  cellIndex: number;
};

/**
 * Event: a builder claimed the job.
 */
export const jobClaimedByBuilderEvent = "construction.job.claimed";

/**
 * Event: the construction phase began (progress starts).
 */
export const jobStartedEvent = "construction.job.started";

/**
 * Payload of `construction.job.claimed` and `construction.job.started`.
 */
export type JobBuilder = {
  jobId: EntityId;
  builderId: EntityId;
};

/**
 * Event: the job waits for a material nobody can supply.
 */
export const jobSuspendedEvent = "construction.job.suspended";

/**
 * Payload of `construction.job.suspended`; the reason is a structured blocked reason (spec 025).
 */
export type JobSuspended = {
  jobId: EntityId;
  reason: ConstructionBlockedReason;
};

/**
 * Event: a suspended job can go on.
 */
export const jobResumedEvent = "construction.job.resumed";

/**
 * Payload of `construction.job.resumed`.
 */
export type JobResumed = {
  jobId: EntityId;
};

/**
 * Event: a job completed (the building stands or the target is gone).
 */
export const jobCompletedEvent = "construction.job.completed";

/**
 * Payload of `construction.job.completed` (DECISIONS section 4.4, plus `entityId`, the placed
 * entity, which is null for a deconstruction).
 */
export type JobCompleted = {
  jobId: EntityId;
  kind: SiteKind;
  prototypeId: string;
  mapId: number;
  cellIndex: number;
  consumed: SiteMaterial[];
  yield: SiteMaterial[];
  entityId: EntityId | null;
};

/**
 * Event: a job was cancelled.
 */
export const jobCancelledEvent = "construction.job.cancelled";

/**
 * Payload of `construction.job.cancelled`.
 */
export type JobCancelled = {
  jobId: EntityId;
  reason: string;
};

/**
 * Why a placement is refused (the reason codes of `validatePlacement`). The enum value is the
 * serialized kind.
 */
export enum PlacementReasonKind {
  UnknownMap = "UnknownMap",
  OutOfBounds = "OutOfBounds",
  UnknownPrototype = "UnknownPrototype",
  TierLocked = "TierLocked",
  TerrainNotBuildable = "TerrainNotBuildable",
  Occupied = "Occupied",
  SiteExists = "SiteExists",
}

/**
 * One reason a placement is refused: a kind, a ready-to-show text ("Unlocks at Village") and the
 * raw parameters.
 */
export type PlacementReason = {
  kind: PlacementReasonKind;
  text: string;
  params: { [name: string]: JsonValue };
};

/**
 * The answer of `validatePlacement`. `valid` is true exactly when `reasons` is empty. Zone
 * membership is never a hard constraint (spec 024 edge case): furniture outside a fitting zone
 * is placed anyway, `zoneId` only tells the renderer which zone the cell belongs to.
 */
export type PlacementResult = {
  valid: boolean;
  prototypeId: string;
  mapId: number;
  cellIndex: number;
  reasons: PlacementReason[];
  /**
   * The zone covering the cell, or null.
   */
  zoneId: EntityId | null;
  /**
   * Tier that unlocks the definition (`hamlet` when it has no unlock tier), or null when the
   * definition is unknown.
   */
  unlockTier: string | null;
};

/**
 * The reason kinds construction reports to the status system (spec 025 `BlockedReasonKind`
 * subset). The enum value is the 025 kind name.
 */
export enum ConstructionBlockedKind {
  Paused = "Paused",
  MissingInput = "MissingInput",
  LockedByTier = "LockedByTier",
}

/**
 * A structured blocked reason of a construction job: a kind and int/id params, never text.
 */
export type ConstructionBlockedReason = {
  kind: ConstructionBlockedKind;
  params: { [name: string]: JsonValue };
};
