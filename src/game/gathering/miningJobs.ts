import type { GameEngine } from "../engine/GameEngine";
import { createWorkAtLocationExecutor } from "../jobs/workAtLocation";
import { registerJobType } from "../jobs/jobExecutor";
import type { JobOutput } from "../jobs/jobTypes";
import { postCellJobs } from "./cellPoster";
import { chargesLeft, takeCharge } from "./deposits";
import { storeGatheredOutputs } from "./storeGatheredOutputs";
import {
  depositMaxActivePostings,
  mineBaseTicks,
  mineOreJobId,
  oreMaterialId,
  oreTerrainId,
  quarryBaseTicks,
  quarryStoneJobId,
  stoneMaterialId,
  stoneTerrainId,
} from "./gatheringTypes";
import { materialStock } from "./materialStock";

/**
 * The auto-poster of `mine.ore` jobs: posts the nearest iron ore deposit cells with charges left
 * only while the settlement holds fewer than `oreLowStock` iron ore (content constant), so
 * settlers do not over-produce (see `postCellJobs` for the bounds).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postMineJobs(engine: GameEngine, tick: number): number[] {
  if (materialStock(engine, oreMaterialId) >= engine.content.constants.oreLowStock) {
    return [];
  }
  return postCellJobs(engine, tick, {
    jobTypeId: mineOreJobId,
    maxActive: depositMaxActivePostings,
    isCandidate: (map, cell) =>
      map.terrainAt(cell) === oreTerrainId && chargesLeft(engine, map.id, cell) > 0,
  });
}

/**
 * The auto-poster of `quarry.stone` jobs: like {@link postMineJobs} for stone deposits and the
 * `stoneLowStock` limestone threshold.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postQuarryJobs(engine: GameEngine, tick: number): number[] {
  if (materialStock(engine, stoneMaterialId) >= engine.content.constants.stoneLowStock) {
    return [];
  }
  return postCellJobs(engine, tick, {
    jobTypeId: quarryStoneJobId,
    maxActive: depositMaxActivePostings,
    isCandidate: (map, cell) =>
      map.terrainAt(cell) === stoneTerrainId && chargesLeft(engine, map.id, cell) > 0,
  });
}

function registerDepositJob(
  engine: GameEngine,
  jobTypeId: string,
  baseTicks: number,
  terrainId: string,
): void {
  registerJobType(
    engine,
    jobTypeId,
    createWorkAtLocationExecutor(engine, {
      baseTicks,
      complete: (target, context, job): JobOutput[] | null => {
        const { mapId, cellIndex } = job.posting.target;
        const map = target.maps.get(mapId);
        if (map === undefined || map.terrainAt(cellIndex) !== terrainId) {
          return null;
        }
        if (!takeCharge(target, mapId, cellIndex)) {
          return null;
        }
        return storeGatheredOutputs(target, context, job, job.jobType.outputs);
      },
    }),
  );
}

/**
 * Registers the executors of `mine.ore` and `quarry.stone` (DECISIONS D-52). The worker walks to
 * the deposit cell and works {@link mineBaseTicks} / {@link quarryBaseTicks} (scaled by
 * `workDuration`); one charge of the deposit is used up and the job's `outputs` (iron ore x2,
 * limestone x2) plus the skill output bonus go into the worker's inventory. When the last charge
 * goes the cell becomes the deposit's `clearsTo` terrain. A cell that is no deposit any more
 * fails the posting with `target_invalid`.
 *
 * @param engine - The engine.
 */
export function registerMiningJobs(engine: GameEngine): void {
  registerDepositJob(engine, mineOreJobId, mineBaseTicks, oreTerrainId);
  registerDepositJob(engine, quarryStoneJobId, quarryBaseTicks, stoneTerrainId);
}
