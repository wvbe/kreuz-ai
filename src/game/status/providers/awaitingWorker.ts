import type { GameEngine } from "../../engine/GameEngine";
import { findPosting } from "../../jobs/jobBoards";
import { PostingStatus } from "../../jobs/jobTypes";
import { makeReason } from "../reasons";
import { BlockedReasonKind, StatusSubjectKind } from "../statusTypes";
import type { Reason } from "../statusTypes";

/**
 * The reason of a subject whose work is posted on a board and still waits for somebody to claim
 * it: `AwaitingWorker {postingId}` with the posting as cause (the posting explains why nobody
 * claims it). Owners use it for workstations, orders, build sites and loose piles.
 *
 * @param engine - The engine.
 * @param postingId - The posting of the subject, or null when none is out.
 * @returns The reason, or null when there is no posting or somebody holds it.
 */
export function awaitingWorker(engine: GameEngine, postingId: number | null): Reason | null {
  if (postingId === null) {
    return null;
  }
  const found = findPosting(engine, postingId);
  if (found === null || found.posting.status !== PostingStatus.Open) {
    return null;
  }
  return makeReason(
    BlockedReasonKind.AwaitingWorker,
    { postingId },
    { kind: StatusSubjectKind.JobPosting, id: postingId },
  );
}
