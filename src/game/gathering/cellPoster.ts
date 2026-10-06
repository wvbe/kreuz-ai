import { getAiService } from "../ai/aiServiceRegistry";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { activePostingsOfType, isBoardPaused, listBoards } from "../jobs/jobBoards";
import { jobBoardComponent } from "../jobs/jobBoardComponent";
import { postJob } from "../jobs/jobPostings";
import type { GameMap } from "../map/GameMap";
import { positionComponent } from "../map/positionComponent";
import {
  gatheringMaxActivePostings,
  gatheringPosterIntervalTicks,
  gatheringRadiusCost,
} from "./gatheringTypes";

/**
 * Options of {@link postCellJobs}.
 */
export type CellPosterOptions = {
  /**
   * The job type to post.
   */
  jobTypeId: string;
  /**
   * Tells whether a cell needs this job now (checked for the cells around a board).
   */
  isCandidate: (map: GameMap, cell: number) => boolean;
  /**
   * Most active postings of the type over all boards (default {@link gatheringMaxActivePostings}).
   */
  maxActive?: number;
};

/**
 * The shared deterministic auto-poster of the gathering jobs (DECISIONS D-08: system postings go
 * to the board at once). Every {@link gatheringPosterIntervalTicks} ticks, on each running board
 * in ascending id order, it posts the candidate cells nearest to the board (path cost at most
 * {@link gatheringRadiusCost}; ties lowest cell index) while fewer than `maxActive` (default
 * {@link gatheringMaxActivePostings}) postings of the type are active over all boards, never
 * twice for a cell that already has an active posting of the type.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @param options - Job type and candidate test.
 * @returns The ids of the postings created.
 */
export function postCellJobs(
  engine: GameEngine,
  tick: number,
  options: CellPosterOptions,
): number[] {
  if (tick % gatheringPosterIntervalTicks !== 0) {
    return [];
  }
  const created: number[] = [];
  for (const board of listBoards(engine)) {
    const place = getComponent(board, positionComponent);
    const boardData = getComponent(board, jobBoardComponent);
    const map = place === undefined ? undefined : engine.maps.get(place.mapId);
    const active = activePostingsOfType(engine, options.jobTypeId);
    const room = (options.maxActive ?? gatheringMaxActivePostings) - active.length;
    if (
      place === undefined ||
      boardData === undefined ||
      map === undefined ||
      room <= 0 ||
      isBoardPaused(boardData)
    ) {
      continue;
    }
    const taken = new Set(active.map((posting) => posting.target.cellIndex));
    const cells = getAiService(engine)
      .pathfinding.reachable(place.mapId, place.cellIndex, gatheringRadiusCost)
      .filter((entry) => !taken.has(entry.cell) && options.isCandidate(map, entry.cell))
      .sort((left, right) =>
        left.cost === right.cost ? left.cell - right.cell : left.cost - right.cost,
      )
      .slice(0, room);
    for (const entry of cells) {
      created.push(
        postJob(
          engine,
          board.id,
          {
            jobTypeId: options.jobTypeId,
            target: {
              mapId: place.mapId,
              cellIndex: entry.cell,
              entityId: null,
              materialId: null,
            },
          },
          tick,
        ).id,
      );
    }
  }
  return created;
}
