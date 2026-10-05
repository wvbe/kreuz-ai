import { describe, expect, it } from "vitest";
import {
  eligibilitySchema,
  jobBoardComponent,
  jobBoardDataSchema,
  jobPostingSchema,
} from "./jobBoardComponent";
import { EligibilityKind, JobBoardMode, PostingStatus } from "./jobTypes";
import type { JobPosting } from "./jobTypes";

function posting(id: number, overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id,
    boardId: 2,
    jobTypeId: "fell.trees",
    target: { mapId: 1, cellIndex: 10, entityId: null, materialId: null },
    priority: 50,
    urgent: false,
    wage: 2,
    posterFactionId: 1,
    eligibility: [{ kind: EligibilityKind.AdultHumanoid }],
    status: PostingStatus.Open,
    claimId: null,
    claimantId: null,
    createdTick: 0,
    claimedTick: null,
    finishedTick: null,
    reason: null,
    ...overrides,
  };
}

describe("jobBoardComponent", () => {
  it("defaults to a running, system-managed, empty board", () => {
    expect(jobBoardComponent.name).toBe("JobBoard");
    expect(jobBoardComponent.defaults()).toEqual({
      mode: JobBoardMode.SystemManaged,
      pausedByPlayer: false,
      pausedBySystem: false,
      postings: [],
      history: [],
    });
  });

  it("round trips JSON with open and claimed postings", () => {
    const data = {
      ...jobBoardComponent.defaults(),
      postings: [
        posting(1),
        posting(3, {
          status: PostingStatus.Claimed,
          claimId: 4,
          claimantId: 5,
          claimedTick: 7,
          eligibility: [
            { kind: EligibilityKind.FactionMember, factionId: 1 },
            { kind: EligibilityKind.NotHostileToPoster },
            { kind: EligibilityKind.MinSkill, skillId: "farming", level: 20 },
            { kind: EligibilityKind.TierUnlocked, tier: "village" },
          ],
        }),
      ],
      history: [posting(2, { status: PostingStatus.Done, finishedTick: 9 })],
    };
    expect(jobBoardDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects unsorted postings, claim mismatches, long history and unknown fields", () => {
    const base = jobBoardComponent.defaults();
    expect(
      jobBoardDataSchema.safeParse({ ...base, postings: [posting(3), posting(1)] }).success,
    ).toBe(false);
    expect(
      jobBoardDataSchema.safeParse({
        ...base,
        postings: [posting(1, { status: PostingStatus.Claimed })],
      }).success,
    ).toBe(false);
    expect(
      jobBoardDataSchema.safeParse({
        ...base,
        history: Array.from({ length: 17 }, (_unused, index) => posting(index + 1)),
      }).success,
    ).toBe(false);
    expect(jobBoardDataSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(jobPostingSchema.safeParse({ ...posting(1), priority: 101 }).success).toBe(false);
    expect(jobPostingSchema.safeParse({ ...posting(1), wage: 0.5 }).success).toBe(false);
  });

  it("validates each eligibility kind", () => {
    expect(eligibilitySchema.safeParse({ kind: "adult-humanoid" }).success).toBe(true);
    expect(eligibilitySchema.safeParse({ kind: "min-skill", skillId: "x" }).success).toBe(false);
    expect(eligibilitySchema.safeParse({ kind: "nope" }).success).toBe(false);
  });
});
