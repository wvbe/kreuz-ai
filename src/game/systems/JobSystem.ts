/**
 * Job system: job boards, claiming, priority scoring, and work progress.
 */

import type { EntityManager, EntityId } from "../engine/EntityManager";
import { getComponent, getEntitiesWithComponent } from "../engine/EntityManager";

export enum JobStatus {
  Posted = "posted",
  Claimed = "claimed",
  InProgress = "in_progress",
  Completed = "completed",
  Cancelled = "cancelled",
}

export type Job = {
  jobId: string;
  jobType: string;
  priority: number;
  status: JobStatus;
  claimedBy?: EntityId;
  targetCellId: number;
  targetMapId: string;
  progress: number;
  requiredWork: number;
  requiredSkill?: string;
  requiredSkillLevel?: number;
};

export type JobBoardComponent = {
  boardId: string;
  jobs: Job[];
  paused: boolean;
};

/**
 * Creates a new job board.
 */
export function createJobBoard(boardId: string): JobBoardComponent {
  return { boardId, jobs: [], paused: false };
}

/**
 * Posts a new job to a board.
 */
export function postJob(board: JobBoardComponent, job: Job): void {
  board.jobs.push(job);
}

/**
 * Claims the highest-priority available job for an entity.
 */
export function claimBestJob(
  board: JobBoardComponent,
  entityId: EntityId,
  entitySkills?: Map<string, number>,
): Job | undefined {
  if (board.paused) return undefined;

  const available = board.jobs
    .filter((job) => job.status === JobStatus.Posted)
    .filter((job) => {
      if (!job.requiredSkill) return true;
      const level = entitySkills?.get(job.requiredSkill) ?? 0;
      return level >= (job.requiredSkillLevel ?? 0);
    })
    .sort((jobA, jobB) => jobB.priority - jobA.priority);

  const job = available[0];
  if (job) {
    job.status = JobStatus.Claimed;
    job.claimedBy = entityId;
  }
  return job;
}

/**
 * Advances work on a claimed job.
 */
export function workOnJob(job: Job, workAmount: number): boolean {
  if (job.status !== JobStatus.Claimed && job.status !== JobStatus.InProgress) return false;
  job.status = JobStatus.InProgress;
  job.progress += workAmount;
  if (job.progress >= job.requiredWork) {
    job.status = JobStatus.Completed;
    return true;
  }
  return false;
}

/**
 * Cancels a job and releases the claim.
 */
export function cancelJob(job: Job): void {
  job.status = JobStatus.Cancelled;
  job.claimedBy = undefined;
}

/**
 * Gets all pending (posted) jobs from a board.
 */
export function getPendingJobs(board: JobBoardComponent): Job[] {
  return board.jobs.filter((job) => job.status === JobStatus.Posted);
}

/**
 * Removes completed and cancelled jobs from a board.
 */
export function cleanupJobs(board: JobBoardComponent): void {
  board.jobs = board.jobs.filter(
    (job) => job.status !== JobStatus.Completed && job.status !== JobStatus.Cancelled,
  );
}
