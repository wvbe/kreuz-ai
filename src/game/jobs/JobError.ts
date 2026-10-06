/**
 * Categories of job board failure.
 */
export enum JobErrorKind {
  /**
   * The entity is not a job board (command error `UnknownBoard`).
   */
  UnknownBoard = "unknown-board",
  /**
   * The posting does not exist (command error `UnknownPosting`).
   */
  UnknownPosting = "unknown-posting",
  /**
   * The content pack has no such job type, or it is never posted on a board
   * (command error `UnknownJobType`).
   */
  UnknownJobType = "unknown-job-type",
  /**
   * The job type needs a settlement tier the settlement has not reached
   * (command error `ContentLocked`).
   */
  ContentLocked = "content-locked",
  /**
   * The command needs a user-managed board (command error `BoardNotUserManaged`).
   */
  BoardNotUserManaged = "board-not-user-managed",
  /**
   * The posting is not in a status the operation accepts (claim of a claimed posting ...).
   */
  InvalidStatus = "invalid-status",
  /**
   * The claimer does not satisfy the posting's eligibility or the board is paused.
   */
  NotClaimable = "not-claimable",
  /**
   * The target cell is not on the named map.
   */
  InvalidTarget = "invalid-target",
  /**
   * The pending board update does not exist (command error `UnknownUpdate`).
   */
  UnknownUpdate = "unknown-update",
  /**
   * The entity cannot be a Town Crier (command error `IneligibleCrier`).
   */
  IneligibleCrier = "ineligible-crier",
}

/**
 * Failure of the job board module; callers branch on `kind`.
 */
export class JobError extends Error {
  /**
   * Creates a job error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending board or posting.
   */
  constructor(
    public readonly kind: JobErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "JobError";
  }
}
