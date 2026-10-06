import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { jobBoardComponent } from "./jobBoardComponent";
import { JobError, JobErrorKind } from "./JobError";
import { PostingStatus } from "./jobTypes";
import type { JobBoardData, JobPosting } from "./jobTypes";

/**
 * A posting together with the board entity it lives on.
 */
export type PostingLocation = {
  board: Entity;
  data: JobBoardData;
  posting: JobPosting;
};

type BoardList = { store: GameEngine["store"]; revision: number; boards: Entity[] };

const boardLists = new WeakMap<GameEngine, BoardList>();

/**
 * All job board entities, ascending by id. Every citizen asks for the boards on every decision,
 * so the list is kept per engine and rebuilt only when the entity store's structure changed
 * (task 7.1: scanning every entity per citizen made a 200-citizen tick quadratic).
 *
 * @param engine - The engine that owns the entities.
 * @returns A new array of live entities that carry `JobBoard`.
 */
export function listBoards(engine: GameEngine): Entity[] {
  const revision = engine.store.structureRevision;
  let cached = boardLists.get(engine);
  if (cached?.store !== engine.store || cached.revision !== revision) {
    cached = {
      store: engine.store,
      revision,
      boards: engine.store
        .entities()
        .filter((entity) => getComponent(entity, jobBoardComponent) !== undefined),
    };
    boardLists.set(engine, cached);
  }
  return [...cached.boards];
}

/**
 * The board entity with an id, with its live data.
 *
 * @param engine - The engine that owns the entities.
 * @param boardId - Entity id.
 * @returns The entity and its component data, or null when it is not a job board.
 */
export function getBoard(
  engine: GameEngine,
  boardId: EntityId,
): { board: Entity; data: JobBoardData } | null {
  const board = engine.store.get(boardId);
  const data = board === undefined ? undefined : getComponent(board, jobBoardComponent);
  return board === undefined || data === undefined ? null : { board, data };
}

/**
 * Like {@link getBoard} but throws `JobError` `UnknownBoard`.
 *
 * @param engine - The engine that owns the entities.
 * @param boardId - Entity id.
 * @returns The entity and its component data.
 */
export function requireBoard(
  engine: GameEngine,
  boardId: EntityId,
): { board: Entity; data: JobBoardData } {
  const found = getBoard(engine, boardId);
  if (found === null) {
    throw new JobError(JobErrorKind.UnknownBoard, `entity ${boardId} is not a job board`);
  }
  return found;
}

/**
 * Tells whether a board offers nothing: the player or the system holds a pause on it.
 *
 * @param data - The board's component data.
 * @returns True while any pause is held.
 */
export function isBoardPaused(data: JobBoardData): boolean {
  return data.pausedByPlayer || data.pausedBySystem;
}

/**
 * Finds an active (open or claimed) posting on any board.
 *
 * @param engine - The engine that owns the entities.
 * @param postingId - Posting id.
 * @returns The posting with its board, or null when it is not active.
 */
export function findPosting(engine: GameEngine, postingId: number): PostingLocation | null {
  for (const board of listBoards(engine)) {
    const data = getComponent(board, jobBoardComponent);
    const posting = data?.postings.find((candidate) => candidate.id === postingId);
    if (data !== undefined && posting !== undefined) {
      return { board, data, posting };
    }
  }
  return null;
}

/**
 * The open postings of a board that can be claimed: none while the board is paused.
 *
 * @param data - The board's component data.
 * @returns The open postings, ascending by id.
 */
export function offeredPostings(data: JobBoardData): JobPosting[] {
  return isBoardPaused(data)
    ? []
    : data.postings.filter((posting) => posting.status === PostingStatus.Open);
}

/**
 * Active postings of one job type on any board, for pollers that must not post twice.
 *
 * @param engine - The engine that owns the entities.
 * @param jobTypeId - Job type id.
 * @returns The postings in board then id order.
 */
export function activePostingsOfType(engine: GameEngine, jobTypeId: string): JobPosting[] {
  return listBoards(engine).flatMap(
    (board) =>
      getComponent(board, jobBoardComponent)?.postings.filter(
        (posting) => posting.jobTypeId === jobTypeId,
      ) ?? [],
  );
}
