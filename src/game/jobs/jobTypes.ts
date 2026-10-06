import type { EntityId } from "../ecs/Entity";

/**
 * Id of the job board system (dependency name for systems that post or claim jobs).
 */
export const jobsSystemId = "jobboard";

/**
 * Who may edit a board (spec 017 FR-008). The enum value is the serialized mode.
 */
export enum JobBoardMode {
  SystemManaged = "system-managed",
  UserManaged = "user-managed",
}

/**
 * Lifecycle of a posting. `Open` and `Claimed` are active; the rest are terminal and move to the
 * board's bounded history. The enum value is the serialized status.
 */
export enum PostingStatus {
  Open = "open",
  Claimed = "claimed",
  Done = "done",
  Failed = "failed",
  Cancelled = "cancelled",
}

/**
 * Who paused a board (DECISIONS section 4 `jobboard.paused` payload). A board offers nothing
 * while either source holds a pause; resuming one source never lifts the other.
 */
export enum PauseSource {
  Player = "Player",
  System = "System",
}

/**
 * The kinds of eligibility predicate of a posting (DECISIONS D-08). The enum value is the
 * serialized `kind`.
 */
export enum EligibilityKind {
  /**
   * The worker is a citizen (a humanoid with a `Citizen` component).
   */
  AdultHumanoid = "adult-humanoid",
  /**
   * The worker belongs to a given faction.
   */
  FactionMember = "faction-member",
  /**
   * The worker is not hostile to the poster faction (021 labour gate: mean standing >= -30).
   */
  NotHostileToPoster = "not-hostile-to-poster",
  /**
   * The worker has at least a skill level.
   */
  MinSkill = "min-skill",
  /**
   * The settlement has reached a tier.
   */
  TierUnlocked = "tier-unlocked",
}

/**
 * One eligibility predicate as data; evaluated at claim time by the claimer.
 */
export type Eligibility =
  | { kind: EligibilityKind.AdultHumanoid }
  | { kind: EligibilityKind.FactionMember; factionId: EntityId }
  | { kind: EligibilityKind.NotHostileToPoster }
  | { kind: EligibilityKind.MinSkill; skillId: string; level: number }
  | { kind: EligibilityKind.TierUnlocked; tier: string };

/**
 * Where a posting's work happens.
 */
export type JobTarget = {
  mapId: number;
  cellIndex: number;
  /**
   * Entity the job works on (a field, a build site ...), or null.
   */
  entityId: EntityId | null;
  /**
   * Material the job handles (a haul load ...), or null.
   */
  materialId: string | null;
};

/**
 * One job posting (DECISIONS D-08, amended by task 3.1: single claimant, one-time).
 */
export type JobPosting = {
  /**
   * From the persisted `nextPostingId` counter, never reused.
   */
  id: number;
  boardId: EntityId;
  /**
   * Job type id from the content pack (`fell.trees`).
   */
  jobTypeId: string;
  target: JobTarget;
  /**
   * Player/system priority `0..100`; higher is claimed first.
   */
  priority: number;
  /**
   * Need-driven or player-urgent; breaks priority ties.
   */
  urgent: boolean;
  /**
   * Whole coins paid on completion (0 = none).
   */
  wage: number;
  /**
   * Faction that pays and whose labour gate applies.
   */
  posterFactionId: EntityId | null;
  eligibility: Eligibility[];
  status: PostingStatus;
  /**
   * Id of the live claim (from `nextClaimId`), or null while open.
   */
  claimId: number | null;
  claimantId: EntityId | null;
  createdTick: number;
  claimedTick: number | null;
  /**
   * Tick of the terminal status, or null while active.
   */
  finishedTick: number | null;
  /**
   * Why the posting failed or was cancelled, or null.
   */
  reason: string | null;
  /**
   * Present (true) on a recurring posting: when it completes the board posts it again with a
   * fresh slot (spec 017 FR-005). Absent on one-time postings, so their saved form is unchanged.
   */
  recurring?: boolean;
};

/**
 * Data of the `JobBoard` component.
 */
export type JobBoardData = {
  mode: JobBoardMode;
  pausedByPlayer: boolean;
  pausedBySystem: boolean;
  /**
   * Open and claimed postings, ascending by id.
   */
  postings: JobPosting[];
  /**
   * The last {@link maxPostingHistory} finished postings, oldest first.
   */
  history: JobPosting[];
};

/**
 * One item produced by a job.
 */
export type JobOutput = {
  materialId: string;
  quantity: number;
};

/**
 * Priority of job tasks in an entity's task queue (DECISIONS D-45: idle 10, jobs 50, need 100).
 */
export const jobTaskPriority = 50;

/**
 * Default posting priority.
 */
export const defaultPostingPriority = 50;

/**
 * Highest posting priority.
 */
export const maxPostingPriority = 100;

/**
 * Finished postings a board remembers.
 */
export const maxPostingHistory = 16;

/**
 * Ticks an entity stays away from a posting it gave up (half a game day): it cannot claim the
 * same posting again before that, so a broken job is not retried forever by the same entity.
 */
export const claimBackoffTicks = 144;

/**
 * Task type of the walk to a board and the claim on arrival.
 */
export const visitTaskType = "jobboard.visit";

/**
 * Failure reason: the posting is not (or no longer) claimed by this task.
 */
export const postingGoneReason = "posting_gone";

/**
 * Failure reason: the target of the work changed so the job cannot be done any more.
 */
export const targetInvalidReason = "target_invalid";

/**
 * Failure reason: the worker could not walk to the target.
 */
export const approachFailedReason = "approach_failed";

/**
 * Labour gate threshold (spec 021): a worker whose mean standing toward the poster is below this
 * may not claim the posting.
 */
export const hostileStandingThreshold = -30;

/**
 * Event: a posting was created.
 */
export const jobPostedEvent = "jobboard.job.posted";

/**
 * Event: an entity claimed a posting.
 */
export const jobClaimedEvent = "jobboard.job.claimed";

/**
 * Event: a claimed job was completed (carries worker, wage and outputs).
 */
export const jobCompletedEvent = "jobboard.job.completed";

/**
 * Event: a claim was given up and the posting is open again.
 */
export const jobAbandonedEvent = "jobboard.job.abandoned";

/**
 * Event: a posting failed for good (task 3.1 addition to the catalogue).
 */
export const jobFailedEvent = "jobboard.job.failed";

/**
 * Event: a posting was cancelled (task 3.1 addition to the catalogue).
 */
export const jobCancelledEvent = "jobboard.job.cancelled";

/**
 * Event: a pause source was set on a board.
 */
export const boardPausedEvent = "jobboard.paused";

/**
 * Event: a pause source was lifted from a board.
 */
export const boardResumedEvent = "jobboard.resumed";

/**
 * Payload of `jobboard.job.posted`.
 */
export type JobPosted = {
  boardId: EntityId;
  postingId: number;
  jobTypeId: string;
};

/**
 * Payload of `jobboard.job.claimed`.
 */
export type JobClaimed = {
  boardId: EntityId;
  postingId: number;
  claimId: number;
  entityId: EntityId;
};

/**
 * Payload of `jobboard.job.completed` (DECISIONS D-08).
 */
export type JobCompleted = {
  boardId: EntityId;
  postingId: number;
  claimId: number;
  jobTypeId: string;
  workerId: EntityId;
  wage: number;
  outputs: JobOutput[];
};

/**
 * Payload of `jobboard.job.abandoned`.
 */
export type JobAbandoned = {
  boardId: EntityId;
  postingId: number;
  claimId: number;
  entityId: EntityId;
  reason: string;
};

/**
 * Payload of `jobboard.job.failed` and `jobboard.job.cancelled`.
 */
export type JobEnded = {
  boardId: EntityId;
  postingId: number;
  jobTypeId: string;
  reason: string;
};

/**
 * Payload of `jobboard.paused` and `jobboard.resumed`.
 */
export type BoardPauseChanged = {
  boardId: EntityId;
  source: PauseSource;
};
