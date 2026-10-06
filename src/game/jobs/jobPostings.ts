import { cloneJson } from "../ecs/jsonData";
import type { EntityId } from "../ecs/Entity";
import { CounterName } from "../engine/IdCounters";
import type { GameEngine } from "../engine/GameEngine";
import { governmentFactionId } from "../factions/factionRegistry";
import { defaultEligibility, isEligible } from "./eligibility";
import { findPosting, isBoardPaused, requireBoard } from "./jobBoards";
import type { PostingLocation } from "./jobBoards";
import { JobError, JobErrorKind } from "./JobError";
import { payWage } from "./payWage";
import { getJobService } from "./jobServiceRegistry";
import { tierOrder } from "./JobService";
import {
  claimBackoffTicks,
  jobAbandonedEvent,
  jobCancelledEvent,
  jobClaimedEvent,
  jobCompletedEvent,
  jobFailedEvent,
  jobPostedEvent,
  maxPostingHistory,
  maxPostingPriority,
  PostingStatus,
} from "./jobTypes";
import type {
  Eligibility,
  JobAbandoned,
  JobClaimed,
  JobCompleted,
  JobEnded,
  JobOutput,
  JobPosted,
  JobPosting,
  JobTarget,
} from "./jobTypes";

/**
 * What a caller gives to {@link postJob}; everything but the type and target has a default.
 */
export type PostRequest = {
  jobTypeId: string;
  target: JobTarget;
  /**
   * Default 50; clamped to `0..100`.
   */
  priority?: number;
  /**
   * Default false.
   */
  urgent?: boolean;
  /**
   * Whole coins; default is the wage of the job type in the content pack.
   */
  wage?: number;
  /**
   * Default: the player government faction (null when there is none).
   */
  posterFactionId?: EntityId | null;
  /**
   * Default {@link defaultEligibility}.
   */
  eligibility?: Eligibility[];
  /**
   * Recurring posting (spec 017 FR-005): re-posted when it completes while its board runs.
   * Default false.
   */
  recurring?: boolean;
};

function archive(
  location: PostingLocation,
  tick: number,
  status: PostingStatus,
  reason: string | null,
): void {
  const { data, posting } = location;
  posting.status = status;
  posting.finishedTick = tick;
  posting.reason = reason;
  data.postings = data.postings.filter((candidate) => candidate.id !== posting.id);
  data.history = [...data.history, posting].slice(-maxPostingHistory);
}

function requireActive(engine: GameEngine, postingId: number): PostingLocation {
  const found = findPosting(engine, postingId);
  if (found === null) {
    throw new JobError(
      JobErrorKind.UnknownPosting,
      `posting ${postingId} does not exist or is finished`,
    );
  }
  return found;
}

function requireClaimedBy(
  engine: GameEngine,
  postingId: number,
  entityId: EntityId,
): PostingLocation {
  const found = requireActive(engine, postingId);
  if (found.posting.status !== PostingStatus.Claimed || found.posting.claimantId !== entityId) {
    throw new JobError(
      JobErrorKind.InvalidStatus,
      `posting ${postingId} is not claimed by entity ${entityId}`,
    );
  }
  return found;
}

/**
 * Checks that a job could be posted: the job type exists, is posted on boards and is not locked
 * by the settlement tier, and the target cell is on its map. Throws `JobError` otherwise
 * (`UnknownJobType`, `ContentLocked`, `InvalidTarget`); used by {@link postJob} and when a
 * command queues a Town Crier update, so the player hears of a bad posting at once.
 *
 * @param engine - The engine.
 * @param jobTypeId - Job type id.
 * @param target - Where the work happens.
 */
export function validatePostable(engine: GameEngine, jobTypeId: string, target: JobTarget): void {
  const jobType = engine.content.jobs.find(jobTypeId);
  if (jobType === undefined || !jobType.onBoard) {
    throw new JobError(
      JobErrorKind.UnknownJobType,
      `job type "${jobTypeId}" is unknown or never posted on a board`,
    );
  }
  if (
    jobType.unlockTier !== null &&
    jobType.unlockTier !== undefined &&
    tierOrder.indexOf(getJobService(engine).currentTier()) < tierOrder.indexOf(jobType.unlockTier)
  ) {
    throw new JobError(
      JobErrorKind.ContentLocked,
      `job type "${jobTypeId}" needs tier ${jobType.unlockTier}`,
    );
  }
  const map = engine.maps.get(target.mapId);
  if (map === undefined || !map.inBounds(target.cellIndex)) {
    throw new JobError(
      JobErrorKind.InvalidTarget,
      `cell ${target.cellIndex} is not on map ${target.mapId}`,
    );
  }
}

/**
 * Posts a job on a board (spec 017 FR-003, DECISIONS D-08): validates the board, the job type
 * (it must exist, be postable on boards and not be locked by the settlement tier) and the target
 * cell, takes a posting id from the persisted counter and queues `jobboard.job.posted`. Systems
 * and Town Criers (delivering a player's `PostJob`) post through this one function; a paused
 * board still accepts postings (it just offers none).
 *
 * @param engine - The engine.
 * @param boardId - Board entity id.
 * @param request - Job type, target and optional priority, urgency, wage, poster, eligibility.
 * @param tick - The current tick.
 * @returns A copy of the new open posting.
 */
export function postJob(
  engine: GameEngine,
  boardId: EntityId,
  request: PostRequest,
  tick: number,
): JobPosting {
  const { data } = requireBoard(engine, boardId);
  validatePostable(engine, request.jobTypeId, request.target);
  const jobType = engine.content.jobs.require(request.jobTypeId);
  const posting: JobPosting = {
    id: engine.counters.allocate(CounterName.PostingId),
    boardId,
    jobTypeId: jobType.id,
    target: { ...request.target },
    priority: Math.max(0, Math.min(maxPostingPriority, request.priority ?? jobType.priority)),
    urgent: request.urgent ?? false,
    wage: request.wage ?? jobType.wage,
    posterFactionId:
      request.posterFactionId === undefined ? governmentFactionId(engine) : request.posterFactionId,
    eligibility: cloneJson(request.eligibility ?? defaultEligibility()),
    status: PostingStatus.Open,
    claimId: null,
    claimantId: null,
    createdTick: tick,
    claimedTick: null,
    finishedTick: null,
    reason: null,
    ...(request.recurring === true ? { recurring: true } : {}),
  };
  data.postings.push(posting);
  const payload: JobPosted = { boardId, postingId: posting.id, jobTypeId: posting.jobTypeId };
  engine.bus.emit(jobPostedEvent, payload);
  return cloneJson(posting);
}

/**
 * Claims an open posting for an entity (spec 017 FR-004): the posting must be open, its board
 * running and the entity eligible and not backed off. The check and the change happen in one call
 * with no gap, so a posting can never have two claimants however many entities race for it.
 * Allocates a claim id and queues `jobboard.job.claimed`.
 *
 * @param engine - The engine.
 * @param postingId - Posting id.
 * @param entityId - The claiming entity.
 * @param tick - The current tick.
 * @returns A copy of the claimed posting.
 */
export function claimPosting(
  engine: GameEngine,
  postingId: number,
  entityId: EntityId,
  tick: number,
): JobPosting {
  const found = requireActive(engine, postingId);
  const worker = engine.store.get(entityId);
  if (found.posting.status !== PostingStatus.Open) {
    throw new JobError(JobErrorKind.InvalidStatus, `posting ${postingId} is already claimed`);
  }
  if (
    worker === undefined ||
    isBoardPaused(found.data) ||
    getJobService(engine).isBackedOff(entityId, postingId, tick) ||
    !isEligible(engine, worker, found.posting)
  ) {
    throw new JobError(
      JobErrorKind.NotClaimable,
      `entity ${entityId} cannot claim posting ${postingId} now`,
    );
  }
  const claimId = engine.counters.allocate(CounterName.ClaimId);
  found.posting.status = PostingStatus.Claimed;
  found.posting.claimId = claimId;
  found.posting.claimantId = entityId;
  found.posting.claimedTick = tick;
  const payload: JobClaimed = { boardId: found.posting.boardId, postingId, claimId, entityId };
  engine.bus.emit(jobClaimedEvent, payload);
  return cloneJson(found.posting);
}

/**
 * Gives a claim back (spec 017 abandoned job): the posting is open again and queues
 * `jobboard.job.abandoned`. With `backoff` the entity may not claim this posting again for
 * {@link claimBackoffTicks}, which stops a broken job from being retried forever by the same
 * entity. Does nothing when the entity no longer holds the claim (so a late cleanup is harmless).
 *
 * @param engine - The engine.
 * @param postingId - Posting id.
 * @param entityId - The entity that holds the claim.
 * @param reason - Why the claim was given up.
 * @param tick - The current tick.
 * @param backoff - Whether the entity stays away from the posting for a while.
 * @returns True when a claim was released.
 */
export function releasePosting(
  engine: GameEngine,
  postingId: number,
  entityId: EntityId,
  reason: string,
  tick: number,
  backoff: boolean,
): boolean {
  const found = findPosting(engine, postingId);
  if (
    found === null ||
    found.posting.status !== PostingStatus.Claimed ||
    found.posting.claimantId !== entityId ||
    found.posting.claimId === null
  ) {
    return false;
  }
  const payload: JobAbandoned = {
    boardId: found.posting.boardId,
    postingId,
    claimId: found.posting.claimId,
    entityId,
    reason,
  };
  found.posting.status = PostingStatus.Open;
  found.posting.claimId = null;
  found.posting.claimantId = null;
  found.posting.claimedTick = null;
  if (backoff) {
    getJobService(engine).addBackoff(entityId, postingId, tick + claimBackoffTicks);
  }
  engine.bus.emit(jobAbandonedEvent, payload);
  return true;
}

/**
 * Completes a claimed posting (spec 017 FR-006): archives it as `Done`, pays the wage (see
 * `payWage`) and queues `jobboard.job.completed` with worker, wage and outputs. The skill event
 * belongs to the system that executed the job, not to the board (DECISIONS D-08).
 *
 * @param engine - The engine.
 * @param postingId - Posting id.
 * @param entityId - The worker that holds the claim.
 * @param outputs - What the job produced.
 * @param tick - The current tick.
 * @returns A copy of the archived posting.
 */
export function completePosting(
  engine: GameEngine,
  postingId: number,
  entityId: EntityId,
  outputs: JobOutput[],
  tick: number,
): JobPosting {
  const found = requireClaimedBy(engine, postingId, entityId);
  const claimId = found.posting.claimId as number;
  archive(found, tick, PostingStatus.Done, null);
  payWage(engine, entityId, found.posting);
  const payload: JobCompleted = {
    boardId: found.posting.boardId,
    postingId,
    claimId,
    jobTypeId: found.posting.jobTypeId,
    workerId: entityId,
    wage: found.posting.wage,
    outputs,
  };
  engine.bus.emit(jobCompletedEvent, payload);
  if (found.posting.recurring === true && !isBoardPaused(found.data)) {
    postJob(
      engine,
      found.posting.boardId,
      {
        jobTypeId: found.posting.jobTypeId,
        target: found.posting.target,
        priority: found.posting.priority,
        urgent: found.posting.urgent,
        wage: found.posting.wage,
        posterFactionId: found.posting.posterFactionId,
        eligibility: found.posting.eligibility,
        recurring: true,
      },
      tick,
    );
  }
  return cloneJson(found.posting);
}

/**
 * Fails a posting for good, open or claimed (its target is gone): archived as `Failed` and
 * `jobboard.job.failed` is queued. A claimant's task notices at its next step.
 *
 * @param engine - The engine.
 * @param postingId - Posting id.
 * @param reason - Why it failed.
 * @param tick - The current tick.
 * @returns A copy of the archived posting.
 */
export function failPosting(
  engine: GameEngine,
  postingId: number,
  reason: string,
  tick: number,
): JobPosting {
  return endPosting(engine, postingId, reason, tick, PostingStatus.Failed, jobFailedEvent);
}

/**
 * Cancels a posting, open or claimed (the player or the owning system withdraws it): archived as
 * `Cancelled` and `jobboard.job.cancelled` is queued. A claimant's task notices at its next step
 * and stops without a back-off.
 *
 * @param engine - The engine.
 * @param postingId - Posting id.
 * @param reason - Why it was cancelled.
 * @param tick - The current tick.
 * @returns A copy of the archived posting.
 */
export function cancelPosting(
  engine: GameEngine,
  postingId: number,
  reason: string,
  tick: number,
): JobPosting {
  return endPosting(engine, postingId, reason, tick, PostingStatus.Cancelled, jobCancelledEvent);
}

/**
 * Changes the priority and/or the wage of an active posting (the player edits a user-managed
 * board, delivered by a Town Crier). A claimed posting keeps its claimant.
 *
 * @param engine - The engine.
 * @param postingId - Posting id; throws `JobError` `UnknownPosting` when it is finished.
 * @param changes - New priority (clamped to `0..100`) and/or wage; absent fields stay.
 * @returns A copy of the posting after the change.
 */
export function modifyPosting(
  engine: GameEngine,
  postingId: number,
  changes: { priority?: number; wage?: number },
): JobPosting {
  const { posting } = requireActive(engine, postingId);
  if (changes.priority !== undefined) {
    posting.priority = Math.max(0, Math.min(maxPostingPriority, changes.priority));
  }
  if (changes.wage !== undefined) {
    posting.wage = Math.max(0, changes.wage);
  }
  return cloneJson(posting);
}

function endPosting(
  engine: GameEngine,
  postingId: number,
  reason: string,
  tick: number,
  status: PostingStatus,
  eventName: string,
): JobPosting {
  const found = requireActive(engine, postingId);
  archive(found, tick, status, reason);
  const payload: JobEnded = {
    boardId: found.posting.boardId,
    postingId,
    jobTypeId: found.posting.jobTypeId,
    reason,
  };
  engine.bus.emit(eventName, payload);
  return cloneJson(found.posting);
}
