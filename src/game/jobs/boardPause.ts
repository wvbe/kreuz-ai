import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { requireBoard } from "./jobBoards";
import { boardPausedEvent, boardResumedEvent, PauseSource } from "./jobTypes";
import type { BoardPauseChanged } from "./jobTypes";

/**
 * Sets one pause source on a board (spec 017 FR-014). A paused board offers no jobs; claimed
 * jobs run to completion. The player and the system (a zone that went inactive, task 3.4) pause
 * independently: each source only touches its own flag, so a system resume never lifts a player
 * pause and the other way round. Queues `jobboard.paused` `{boardId, source}` when the flag
 * changes.
 *
 * @param engine - The engine.
 * @param boardId - Board entity id; throws `JobError` `UnknownBoard` for other entities.
 * @param source - Who pauses.
 * @returns True when the flag changed.
 */
export function pauseBoard(engine: GameEngine, boardId: EntityId, source: PauseSource): boolean {
  const { data } = requireBoard(engine, boardId);
  const held = source === PauseSource.Player ? data.pausedByPlayer : data.pausedBySystem;
  if (held) {
    return false;
  }
  if (source === PauseSource.Player) {
    data.pausedByPlayer = true;
  } else {
    data.pausedBySystem = true;
  }
  const payload: BoardPauseChanged = { boardId, source };
  engine.bus.emit(boardPausedEvent, payload);
  return true;
}

/**
 * Lifts one pause source from a board. Resuming does not create a backlog: postings that were
 * open stay open and nothing is re-posted. Queues `jobboard.resumed` `{boardId, source}` when the
 * flag changes (the board may still be paused by the other source).
 *
 * @param engine - The engine.
 * @param boardId - Board entity id; throws `JobError` `UnknownBoard` for other entities.
 * @param source - Whose pause is lifted.
 * @returns True when the flag changed.
 */
export function resumeBoard(engine: GameEngine, boardId: EntityId, source: PauseSource): boolean {
  const { data } = requireBoard(engine, boardId);
  const held = source === PauseSource.Player ? data.pausedByPlayer : data.pausedBySystem;
  if (!held) {
    return false;
  }
  if (source === PauseSource.Player) {
    data.pausedByPlayer = false;
  } else {
    data.pausedBySystem = false;
  }
  const payload: BoardPauseChanged = { boardId, source };
  engine.bus.emit(boardResumedEvent, payload);
  return true;
}
