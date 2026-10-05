import { cloneJson } from "../ecs/jsonData";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { jobBoardComponent } from "./jobBoardComponent";
import { findPosting, getBoard, isBoardPaused, listBoards } from "./jobBoards";
import { PostingStatus } from "./jobTypes";
import type { JobBoardMode, JobPosting } from "./jobTypes";

/**
 * One board in the `job-boards` query.
 */
export type BoardSummaryView = {
  readonly boardId: number;
  readonly mapId: number | null;
  readonly cellIndex: number | null;
  readonly mode: JobBoardMode;
  readonly paused: boolean;
  readonly pausedByPlayer: boolean;
  readonly pausedBySystem: boolean;
  readonly open: number;
  readonly claimed: number;
};

/**
 * One board with its postings (query `jobs-on`).
 */
export type BoardView = BoardSummaryView & {
  readonly postings: readonly JobPosting[];
  readonly history: readonly JobPosting[];
};

/**
 * One posting with the board it is (or was) on (query `job`).
 */
export type PostingView = {
  readonly boardId: number;
  readonly active: boolean;
  readonly posting: JobPosting;
};

/**
 * Summarises every board, ascending by id (query `job-boards`).
 *
 * @param engine - The engine.
 * @returns One summary per board.
 */
export function buildBoardSummaries(engine: GameEngine): BoardSummaryView[] {
  return listBoards(engine).flatMap((board) => {
    const summary = buildBoardSummary(engine, board.id);
    return summary === null ? [] : [summary];
  });
}

/**
 * Summarises one board.
 *
 * @param engine - The engine.
 * @param boardId - Board entity id.
 * @returns The summary, or null when the entity is not a board.
 */
export function buildBoardSummary(engine: GameEngine, boardId: number): BoardSummaryView | null {
  const found = getBoard(engine, boardId);
  if (found === null) {
    return null;
  }
  const position = getComponent(found.board, positionComponent);
  return {
    boardId,
    mapId: position?.mapId ?? null,
    cellIndex: position?.cellIndex ?? null,
    mode: found.data.mode,
    paused: isBoardPaused(found.data),
    pausedByPlayer: found.data.pausedByPlayer,
    pausedBySystem: found.data.pausedBySystem,
    open: found.data.postings.filter((posting) => posting.status === PostingStatus.Open).length,
    claimed: found.data.postings.filter((posting) => posting.status === PostingStatus.Claimed)
      .length,
  };
}

/**
 * A board with copies of its active postings and its history (query `jobs-on`).
 *
 * @param engine - The engine.
 * @param boardId - Board entity id.
 * @returns The view, or null when the entity is not a board.
 */
export function buildBoardView(engine: GameEngine, boardId: number): BoardView | null {
  const summary = buildBoardSummary(engine, boardId);
  const found = getBoard(engine, boardId);
  if (summary === null || found === null) {
    return null;
  }
  return {
    ...summary,
    postings: cloneJson(found.data.postings),
    history: cloneJson(found.data.history),
  };
}

/**
 * One posting, active or still in a board's history (query `job`).
 *
 * @param engine - The engine.
 * @param postingId - Posting id.
 * @returns The view, or null when no board knows the posting.
 */
export function buildPostingView(engine: GameEngine, postingId: number): PostingView | null {
  const active = findPosting(engine, postingId);
  if (active !== null) {
    return { boardId: active.posting.boardId, active: true, posting: cloneJson(active.posting) };
  }
  for (const board of listBoards(engine)) {
    const old = getComponent(board, jobBoardComponent)?.history.find(
      (posting) => posting.id === postingId,
    );
    if (old !== undefined) {
      return { boardId: board.id, active: false, posting: cloneJson(old) };
    }
  }
  return null;
}
