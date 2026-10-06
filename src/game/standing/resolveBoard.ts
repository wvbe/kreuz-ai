import { getAiService } from "../ai/aiServiceRegistry";
import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getBoard, listBoards } from "../jobs/jobBoards";
import { JobBoardMode } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { PathResultKind } from "../pathfinding/pathTypes";
import { findSeat } from "./findSeat";
import { getStandingService } from "./standingServiceRegistry";
import type { StandingOrder } from "./standingTypes";

function isUserManaged(engine: GameEngine, boardId: EntityId | null): boolean {
  if (boardId === null) {
    return false;
  }
  return getBoard(engine, boardId)?.data.mode === JobBoardMode.UserManaged;
}

/**
 * The user-managed board with the cheapest walk from the seat of government (path cost, spec 012;
 * ties: the lowest entity id). Only boards on the seat's map that a walker can reach count.
 *
 * @param engine - The engine.
 * @returns The board id, or null without a seat or a reachable user-managed board.
 */
export function nearestUserBoard(engine: GameEngine): EntityId | null {
  const seat = findSeat(engine);
  if (seat === null) {
    return null;
  }
  let best: { id: EntityId; cost: number } | null = null;
  for (const board of listBoards(engine)) {
    const place = getComponent(board, positionComponent);
    if (place === undefined || place.mapId !== seat.mapId || !isUserManaged(engine, board.id)) {
      continue;
    }
    const way = getAiService(engine).pathfinding.findPath(
      seat.mapId,
      seat.cellIndex,
      place.cellIndex,
    );
    if (way.kind === PathResultKind.NoPath) {
      continue;
    }
    const cost = way.kind === PathResultKind.Found ? way.cost : 0;
    if (best === null || cost < best.cost) {
      best = { id: board.id, cost };
    }
  }
  return best === null ? null : best.id;
}

/**
 * The board an order's runs are posted on (spec 026 FR-019, D-19: board choice is a path cost,
 * the reach of Notice Post and Bell is a hop count): the order's own board while it is a
 * user-managed board, else the Steward's board (`SetStewardBoard`) while it is one, else the
 * reachable user-managed board nearest to the throne room.
 *
 * @param engine - The engine.
 * @param order - The order.
 * @returns The board id, or null when there is no board to post on.
 */
export function resolvePostingBoard(engine: GameEngine, order: StandingOrder): EntityId | null {
  if (isUserManaged(engine, order.postingBoardId)) {
    return order.postingBoardId;
  }
  const stewardBoard = getStandingService(engine).state.stewardBoardId;
  if (isUserManaged(engine, stewardBoard)) {
    return stewardBoard;
  }
  return nearestUserBoard(engine);
}
