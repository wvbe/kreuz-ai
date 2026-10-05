import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import {
  EligibilityKind,
  JobBoardMode,
  PostingStatus,
  maxPostingHistory,
  maxPostingPriority,
} from "./jobTypes";
import type { JobBoardData } from "./jobTypes";

const idSchema = z.number().int().min(1);
const tickSchema = z.number().int().min(0);

/**
 * Strict Zod schema of one {@link Eligibility} predicate.
 */
export const eligibilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(EligibilityKind.AdultHumanoid) }).strict(),
  z.object({ kind: z.literal(EligibilityKind.FactionMember), factionId: idSchema }).strict(),
  z.object({ kind: z.literal(EligibilityKind.NotHostileToPoster) }).strict(),
  z
    .object({
      kind: z.literal(EligibilityKind.MinSkill),
      skillId: z.string().min(1),
      level: z.number().int().min(0).max(100),
    })
    .strict(),
  z.object({ kind: z.literal(EligibilityKind.TierUnlocked), tier: z.string().min(1) }).strict(),
]);

/**
 * Strict Zod schema of a {@link JobPosting}.
 */
export const jobPostingSchema = z
  .object({
    id: idSchema,
    boardId: idSchema,
    jobTypeId: z.string().min(1),
    target: z
      .object({
        mapId: idSchema,
        cellIndex: z.number().int().min(0),
        entityId: idSchema.nullable(),
        materialId: z.string().min(1).nullable(),
      })
      .strict(),
    priority: z.number().int().min(0).max(maxPostingPriority),
    urgent: z.boolean(),
    wage: z.number().int().min(0),
    posterFactionId: idSchema.nullable(),
    eligibility: z.array(eligibilitySchema),
    status: z.nativeEnum(PostingStatus),
    claimId: idSchema.nullable(),
    claimantId: idSchema.nullable(),
    createdTick: tickSchema,
    claimedTick: tickSchema.nullable(),
    finishedTick: tickSchema.nullable(),
    reason: z.string().nullable(),
  })
  .strict();

const ascendingIds = (postings: { id: number }[]): boolean =>
  postings.every((posting, index) => index === 0 || (postings[index - 1]?.id ?? 0) < posting.id);

/**
 * Strict Zod schema of the serialized {@link JobBoardData}: active postings ascending by id and
 * unique, claimed postings carry a claim, history bounded.
 */
export const jobBoardDataSchema = z
  .object({
    mode: z.nativeEnum(JobBoardMode),
    pausedByPlayer: z.boolean(),
    pausedBySystem: z.boolean(),
    postings: z.array(jobPostingSchema),
    history: z.array(jobPostingSchema).max(maxPostingHistory),
  })
  .strict()
  .refine((data) => ascendingIds(data.postings), {
    message: "postings must be unique and ascending by id",
  })
  .refine(
    (data) =>
      data.postings.every(
        (posting) =>
          (posting.status === PostingStatus.Open &&
            posting.claimId === null &&
            posting.claimantId === null) ||
          (posting.status === PostingStatus.Claimed &&
            posting.claimId !== null &&
            posting.claimantId !== null),
      ),
    { message: "active postings are open without a claim or claimed with one" },
  );

/**
 * The `JobBoard` component (spec 017 FR-001/008/014): the postings of one board entity, its
 * management mode, the two independent pause flags and a bounded history of finished postings.
 * It lives in the entities save section. Defaults to a system-managed, running, empty board.
 */
export const jobBoardComponent = defineComponent<"JobBoard", JobBoardData>(
  "JobBoard",
  jobBoardDataSchema,
  () => ({
    mode: JobBoardMode.SystemManaged,
    pausedByPlayer: false,
    pausedBySystem: false,
    postings: [],
    history: [],
  }),
);
