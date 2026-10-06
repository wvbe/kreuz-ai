import type { GameEngine } from "../engine/GameEngine";
import { postCellJobs } from "./cellPoster";
import { chargesLeft } from "./deposits";
import { terrainJobBaseTicks, terrainJobMaxActivePostings } from "./gatheringTypes";
import { materialDemanded } from "./materialDemand";
import { registerDepositJob } from "./miningJobs";
import { terrainGatherJobs } from "./terrainJobTypes";

/**
 * The auto-posters of the terrain gathering jobs: for every such job, cells of its terrain with
 * charges left are posted (nearest to a board first, see `postCellJobs`) only while the
 * settlement demands one of its outputs (`materialDemanded`: a production order needs more than
 * is in stock, or stock is below the constant `rawLowStock`, 0 in the shipped pack), at most
 * {@link terrainJobMaxActivePostings} active postings per job type.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postTerrainJobs(engine: GameEngine, tick: number): number[] {
  const created: number[] = [];
  for (const job of terrainGatherJobs(engine)) {
    const terrainId = job.zoneContext.ref;
    if (
      terrainId === undefined ||
      !job.outputs.some((output) => materialDemanded(engine, output.materialId))
    ) {
      continue;
    }
    created.push(
      ...postCellJobs(engine, tick, {
        jobTypeId: job.id,
        maxActive: terrainJobMaxActivePostings,
        isCandidate: (map, cell) =>
          map.terrainAt(cell) === terrainId && chargesLeft(engine, map.id, cell) > 0,
      }),
    );
  }
  return created;
}

/**
 * Registers the executors of the terrain gathering jobs (see {@link terrainGatherJobs}): the
 * deposit executor of mining ({@link registerDepositJob}) with {@link terrainJobBaseTicks} of
 * work. One charge of the cell is used per completed job (a forest has one, so the tree is gone),
 * the job's `outputs` plus the skill output bonus go into the worker's inventory.
 *
 * @param engine - The engine.
 */
export function registerTerrainJobs(engine: GameEngine): void {
  for (const job of terrainGatherJobs(engine)) {
    if (job.zoneContext.ref !== undefined) {
      registerDepositJob(engine, job.id, terrainJobBaseTicks, job.zoneContext.ref);
    }
  }
}
