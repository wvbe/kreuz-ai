import { createAiWorld } from "../ai/testAiWorld";
import type { AiTestWorld, AiTestWorldOptions } from "../ai/testAiWorld";
import type { EntityId } from "../ecs/Entity";
import { postJob } from "./jobPostings";
import type { PostRequest } from "./jobPostings";
import type { JobPosting } from "./jobTypes";

/**
 * Settlers spawned with this override keep the AI away from them.
 */
export const noAiOverride = { AiState: { treeId: null } };

/**
 * An AI test world with a job board.
 */
export type JobTestWorld = AiTestWorld & {
  /**
   * Entity id of the job board.
   */
  boardId: EntityId;
  /**
   * Turns a cell into oak forest.
   */
  forest: (cell: number) => void;
  /**
   * Posts a `fell.trees` job on the forest cell (made forest first) with optional overrides.
   */
  postFell: (cell: number, overrides?: Partial<PostRequest>) => JobPosting;
};

/**
 * Options of {@link createJobWorld}.
 */
export type JobTestWorldOptions = AiTestWorldOptions & {
  /**
   * Cell of the board (default 0, the top-left corner).
   */
  boardCell?: number;
};

/**
 * Builds the square test world of `createAiWorld` plus a `job_board` entity on a cell.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world with `boardId`, `forest` and `postFell` helpers.
 */
export function createJobWorld(options: JobTestWorldOptions = {}): JobTestWorld {
  const world = createAiWorld(options);
  const board = world.spawn("job_board", options.boardCell ?? 0);
  const forest = (cell: number): void => {
    world.engine.maps.require(world.mapId).setTerrain(cell, "forest_oak");
  };
  return {
    ...world,
    boardId: board.id,
    forest,
    postFell: (cell, overrides = {}) => {
      forest(cell);
      return postJob(
        world.engine,
        board.id,
        {
          jobTypeId: "fell.trees",
          target: { mapId: world.mapId, cellIndex: cell, entityId: null, materialId: null },
          ...overrides,
        },
        world.engine.time.tickCount,
      );
    },
  };
}
