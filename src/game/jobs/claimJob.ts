import { getAiService } from "../ai/aiServiceRegistry";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { familiarityBucket } from "../skills/affinityScore";
import { sortClaimCandidates } from "./claimOrder";
import type { ClaimCandidate } from "./claimOrder";
import { isEligible } from "./eligibility";
import { getBoard, listBoards, offeredPostings } from "./jobBoards";
import { JobError } from "./JobError";
import { claimPosting } from "./jobPostings";
import { getJobService } from "./jobServiceRegistry";
import type { JobPosting } from "./jobTypes";

/**
 * Cheapest path costs from a worker's cell to every cell it can reach on its map.
 *
 * @param engine - The engine.
 * @param worker - The worker; it needs a `Position`.
 * @returns Cost by cell index, or null when the worker has no position.
 */
export function reachCostsOf(engine: GameEngine, worker: Entity): Map<number, number> | null {
  const position = getComponent(worker, positionComponent);
  if (position === undefined) {
    return null;
  }
  const costs = new Map<number, number>();
  for (const reachable of getAiService(engine).pathfinding.reachable(
    position.mapId,
    position.cellIndex,
  )) {
    costs.set(reachable.cell, reachable.cost);
  }
  return costs;
}

/**
 * The postings of one board a worker can claim right now, best first (the claim order of
 * `compareClaimCandidates`): the board is running, the posting is open, the worker passes its
 * eligibility, is not backed off from it, and the target is on the worker's map and reachable.
 *
 * @param engine - The engine.
 * @param worker - The worker.
 * @param boardId - Board entity id.
 * @param tick - The current tick.
 * @param costs - Reach costs of the worker, see {@link reachCostsOf}.
 * @returns Candidates, best first; empty for an unknown board.
 */
export function rankPostings(
  engine: GameEngine,
  worker: Entity,
  boardId: number,
  tick: number,
  costs: ReadonlyMap<number, number>,
): ClaimCandidate[] {
  const found = getBoard(engine, boardId);
  const position = getComponent(worker, positionComponent);
  if (found === null || position === undefined) {
    return [];
  }
  const candidates: ClaimCandidate[] = [];
  for (const posting of offeredPostings(found.data)) {
    const pathCost = costs.get(posting.target.cellIndex);
    if (
      pathCost === undefined ||
      !engine.taskHandlers.has(posting.jobTypeId) ||
      posting.target.mapId !== position.mapId ||
      getJobService(engine).isBackedOff(worker.id, posting.id, tick) ||
      !isEligible(engine, worker, posting)
    ) {
      continue;
    }
    const skillId = engine.content.jobs.find(posting.jobTypeId)?.skillId ?? null;
    candidates.push({
      postingId: posting.id,
      boardId,
      priority: posting.priority,
      urgent: posting.urgent,
      familiarity: skillId === null ? 0 : familiarityBucket(worker, skillId),
      pathCost,
    });
  }
  return sortClaimCandidates(candidates);
}

/**
 * The board an idle worker should walk to: boards are tried nearest first (path cost from the
 * worker to the board cell, ties lowest entity id, DECISIONS D-08) and the first one that offers
 * at least one claimable posting wins. Boards on other maps or out of reach are ignored.
 *
 * @param engine - The engine.
 * @param worker - The idle worker.
 * @param tick - The current tick.
 * @returns The board entity id, or null when no reachable board has work for the worker.
 */
export function findBoardToVisit(engine: GameEngine, worker: Entity, tick: number): number | null {
  const costs = reachCostsOf(engine, worker);
  const position = getComponent(worker, positionComponent);
  if (costs === null || position === undefined) {
    return null;
  }
  const reachableBoards: { id: number; cost: number }[] = [];
  for (const board of listBoards(engine)) {
    const boardPosition = getComponent(board, positionComponent);
    const cost =
      boardPosition === undefined || boardPosition.mapId !== position.mapId
        ? undefined
        : costs.get(boardPosition.cellIndex);
    if (cost !== undefined) {
      reachableBoards.push({ id: board.id, cost });
    }
  }
  reachableBoards.sort((left, right) =>
    left.cost === right.cost ? left.id - right.id : left.cost - right.cost,
  );
  for (const board of reachableBoards) {
    if (rankPostings(engine, worker, board.id, tick, costs).length > 0) {
      return board.id;
    }
  }
  return null;
}

/**
 * Claims the best posting of a board for a worker standing at it (spec 017 FR-002: the claim
 * happens on arrival). Entities arrive and are served in ascending id order each tick, and
 * `claimPosting` checks and changes the posting in one step, so racing workers never share a
 * posting: the losers find it claimed and take the next one or nothing.
 *
 * @param engine - The engine.
 * @param worker - The worker.
 * @param boardId - The board it stands at.
 * @param tick - The current tick.
 * @returns The claimed posting, or null when nothing claimable is left.
 */
export function claimBestPosting(
  engine: GameEngine,
  worker: Entity,
  boardId: number,
  tick: number,
): JobPosting | null {
  const costs = reachCostsOf(engine, worker);
  if (costs === null) {
    return null;
  }
  for (const candidate of rankPostings(engine, worker, boardId, tick, costs)) {
    try {
      return claimPosting(engine, candidate.postingId, worker.id, tick);
    } catch (failure) {
      if (!(failure instanceof JobError)) {
        throw failure;
      }
    }
  }
  return null;
}
