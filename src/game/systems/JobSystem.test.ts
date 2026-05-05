import { describe, it, expect } from "vitest";
import { createJobBoard, postJob, claimBestJob, workOnJob, cancelJob, getPendingJobs, cleanupJobs, JobStatus } from "./JobSystem";
import type { Job } from "./JobSystem";

describe("JobSystem", () => {
  function createTestJob(overrides: Partial<Job> = {}): Job {
    return {
      jobId: "job-1",
      jobType: "haul",
      priority: 5,
      status: JobStatus.Posted,
      targetCellId: 10,
      targetMapId: "main",
      progress: 0,
      requiredWork: 10,
      ...overrides,
    };
  }

  it("posts and claims highest priority job", () => {
    const board = createJobBoard("main-board");
    postJob(board, createTestJob({ jobId: "low", priority: 1 }));
    postJob(board, createTestJob({ jobId: "high", priority: 10 }));

    const claimed = claimBestJob(board, 1);
    expect(claimed?.jobId).toBe("high");
    expect(claimed?.status).toBe(JobStatus.Claimed);
    expect(claimed?.claimedBy).toBe(1);
  });

  it("does not claim from paused board", () => {
    const board = createJobBoard("paused-board");
    board.paused = true;
    postJob(board, createTestJob());
    const claimed = claimBestJob(board, 1);
    expect(claimed).toBeUndefined();
  });

  it("advances work to completion", () => {
    const job = createTestJob({ requiredWork: 10 });
    job.status = JobStatus.Claimed;
    job.claimedBy = 1;

    expect(workOnJob(job, 5)).toBe(false);
    expect(job.progress).toBe(5);
    expect(job.status).toBe(JobStatus.InProgress);

    expect(workOnJob(job, 5)).toBe(true);
    expect(job.status).toBe(JobStatus.Completed);
  });

  it("cancels jobs properly", () => {
    const job = createTestJob();
    job.status = JobStatus.Claimed;
    job.claimedBy = 1;
    cancelJob(job);
    expect(job.status).toBe(JobStatus.Cancelled);
    expect(job.claimedBy).toBeUndefined();
  });

  it("cleanupJobs removes completed and cancelled", () => {
    const board = createJobBoard("board");
    postJob(board, createTestJob({ jobId: "a", status: JobStatus.Completed } as Job));
    postJob(board, createTestJob({ jobId: "b", status: JobStatus.Posted }));
    postJob(board, createTestJob({ jobId: "c", status: JobStatus.Cancelled } as Job));
    cleanupJobs(board);
    expect(board.jobs.length).toBe(1);
    expect(board.jobs[0]!.jobId).toBe("b");
  });

  it("respects skill requirements", () => {
    const board = createJobBoard("board");
    postJob(board, createTestJob({ jobId: "skilled", requiredSkill: "smithing", requiredSkillLevel: 3 }));

    const noSkill = claimBestJob(board, 1, new Map());
    expect(noSkill).toBeUndefined();

    // Reset job
    board.jobs[0]!.status = JobStatus.Posted;
    const withSkill = claimBestJob(board, 1, new Map([["smithing", 5]]));
    expect(withSkill?.jobId).toBe("skilled");
  });
});
