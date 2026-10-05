import { getComponent } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { isEligible } from "../../jobs/eligibility";
import { findPosting, isBoardPaused, listBoards } from "../../jobs/jobBoards";
import { jobBoardComponent } from "../../jobs/jobBoardComponent";
import { EligibilityKind, PostingStatus } from "../../jobs/jobTypes";
import type { JobPosting } from "../../jobs/jobTypes";
import { makeReason } from "../reasons";
import type { StatusContext } from "../statusContext";
import { ActivityKind, BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import type { Reason, StatusProvider, StatusSubjectRef, SubjectStatus } from "../statusTypes";

function skillNeed(
  engine: GameEngine,
  posting: JobPosting,
): { skillId: string | null; requiredLevel: number } {
  for (const predicate of posting.eligibility) {
    if (predicate.kind === EligibilityKind.MinSkill) {
      return { skillId: predicate.skillId, requiredLevel: predicate.level };
    }
  }
  return {
    skillId: engine.content.jobs.find(posting.jobTypeId)?.skillId ?? null,
    requiredLevel: 0,
  };
}

function openReason(
  engine: GameEngine,
  posting: JobPosting,
  boardPaused: boolean,
  context: StatusContext,
): Reason {
  if (boardPaused) {
    return makeReason(
      BlockedReasonKind.Paused,
      { jobBoardId: posting.boardId },
      { kind: StatusSubjectKind.JobBoard, id: posting.boardId },
    );
  }
  const eligible = context.citizens().filter((entity) => isEligible(engine, entity, posting));
  if (eligible.length === 0) {
    return makeReason(BlockedReasonKind.NoQualifiedWorker, skillNeed(engine, posting));
  }
  const reaches = eligible.some(
    (citizen) => context.reachCosts(citizen)?.has(posting.target.cellIndex) === true,
  );
  if (!reaches) {
    return makeReason(BlockedReasonKind.Unreachable, { entityId: posting.target.entityId ?? 0 });
  }
  return makeReason(BlockedReasonKind.AwaitingWorker, { postingId: posting.id });
}

/**
 * The status provider of job postings (spec 025 subject `JobPosting`): a claimed posting is
 * Active; an open one is Blocked with the reason nobody takes it: its board is paused (`Paused`,
 * cause the board), no citizen passes its eligibility (`NoQualifiedWorker`), no eligible citizen
 * can reach the target (`Unreachable`) or the eligible ones are busy (`AwaitingWorker`).
 */
export const postingProvider: StatusProvider = {
  kind: StatusSubjectKind.JobPosting,
  subjects: (engine) => {
    const refs: StatusSubjectRef[] = [];
    for (const board of listBoards(engine)) {
      for (const posting of getComponent(board, jobBoardComponent)?.postings ?? []) {
        refs.push({ kind: StatusSubjectKind.JobPosting, id: posting.id });
      }
    }
    return refs;
  },
  evaluate: (engine, ref, context): SubjectStatus | null => {
    const found = findPosting(engine, ref.id);
    if (found === null) {
      return null;
    }
    if (found.posting.status === PostingStatus.Open) {
      return {
        state: StatusState.Blocked,
        activity: null,
        reasons: [openReason(engine, found.posting, isBoardPaused(found.data), context)],
      };
    }
    return {
      state: StatusState.Active,
      activity: { kind: ActivityKind.Claimed, params: { claimantId: found.posting.claimantId } },
      reasons: [],
    };
  },
};
