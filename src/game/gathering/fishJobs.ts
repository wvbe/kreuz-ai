import type { GameEngine } from "../engine/GameEngine";
import { createWorkAtLocationExecutor } from "../jobs/workAtLocation";
import { registerJobType } from "../jobs/jobExecutor";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { postCellJobs } from "./cellPoster";
import {
  fishBaseTicks,
  fishCatchJobId,
  fishingDockZoneTypeId,
  fishingWaterTerrainId,
} from "./gatheringTypes";
import { materialStock } from "./materialStock";
import { storeGatheredOutputs } from "./storeGatheredOutputs";

/**
 * Tells whether a cell is a place to fish from: a tile of an active fishing dock zone (past its
 * activation tick, D-11) that has a `water_shallow` neighbour. A dock without water next to it
 * catches nothing.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns True for a dock cell next to water.
 */
export function isFishingSpot(engine: GameEngine, mapId: number, cellIndex: number): boolean {
  const map = engine.maps.get(mapId);
  const zoneId = getZoneService(engine).zoneIdAt(mapId, cellIndex);
  const zone = zoneId === null ? null : getZoneService(engine).getZone(zoneId);
  if (
    map === undefined ||
    zone === null ||
    zone.data.zoneTypeId !== fishingDockZoneTypeId ||
    !zone.data.active ||
    zone.data.activeSinceTick === null ||
    engine.time.tickCount <= zone.data.activeSinceTick
  ) {
    return false;
  }
  return map.neighbors(cellIndex).some((cell) => map.terrainAt(cell) === fishingWaterTerrainId);
}

/**
 * The auto-poster of `fish.catch` jobs: every fishing spot of a working dock (see
 * {@link isFishingSpot}) is a candidate, nearest to a board first and bounded like the other
 * gathering jobs (`postCellJobs`), but only while the settlement holds fewer than
 * `zoneGatherLowStock` raw fish: the dock is the player's demand, the cap stops endless fishing
 * (DECISIONS D-130).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postFishJobs(engine: GameEngine, tick: number): number[] {
  const output = engine.content.jobs.find(fishCatchJobId)?.outputs[0];
  if (
    output === undefined ||
    materialStock(engine, output.materialId) >= engine.content.constants.zoneGatherLowStock
  ) {
    return [];
  }
  return postCellJobs(engine, tick, {
    jobTypeId: fishCatchJobId,
    isCandidate: (map, cell) => isFishingSpot(engine, map.id, cell),
  });
}

/**
 * Registers the executor of `fish.catch`: the worker walks to the dock cell, works
 * {@link fishBaseTicks} (scaled by `workDuration`) and the job's `outputs` (raw fish x3) plus the
 * fishing output bonus go into the worker's inventory; the haul poster takes them to a stockpile.
 * A cell that stopped being a fishing spot fails the posting with `target_invalid`.
 *
 * @param engine - The engine.
 */
export function registerFishJobs(engine: GameEngine): void {
  registerJobType(
    engine,
    fishCatchJobId,
    createWorkAtLocationExecutor(engine, {
      baseTicks: fishBaseTicks,
      complete: (target, context, job) =>
        isFishingSpot(target, job.posting.target.mapId, job.posting.target.cellIndex)
          ? storeGatheredOutputs(target, context, job, job.jobType.outputs)
          : null,
    }),
  );
}
