import type { GameEngine } from "../engine/GameEngine";
import { createWorkAtLocationExecutor } from "../jobs/workAtLocation";
import { registerJobType } from "../jobs/jobExecutor";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { cropOfZoneType, fieldCellAt, harvestCell, sowCell } from "./cropPlots";
import { postCellJobs } from "./cellPoster";
import { storeGatheredOutputs } from "./storeGatheredOutputs";
import { getGatheringService } from "./gatheringServiceRegistry";
import {
  CropStage,
  harvestBaseTicks,
  harvestJobId,
  sowBaseTicks,
  sowJobId,
} from "./gatheringTypes";

/**
 * The auto-poster of `farm.sow` jobs: every fallow fertile cell of a working field (an active
 * `farm_field` zone) is a candidate, posted nearest to a board first, bounded by
 * `gatheringMaxActivePostings` (see `postCellJobs`).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postSowJobs(engine: GameEngine, tick: number): number[] {
  const service = getGatheringService(engine);
  return postCellJobs(engine, tick, {
    jobTypeId: sowJobId,
    isCandidate: (map, cell) =>
      fieldCellAt(engine, map.id, cell) !== null && service.plotAt(map.id, cell) === undefined,
  });
}

/**
 * The auto-poster of `farm.harvest` jobs: every ripe cell of a working field is a candidate
 * (see `postCellJobs`).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postHarvestJobs(engine: GameEngine, tick: number): number[] {
  const service = getGatheringService(engine);
  return postCellJobs(engine, tick, {
    jobTypeId: harvestJobId,
    isCandidate: (map, cell) =>
      service.plotAt(map.id, cell)?.stage === CropStage.Ripe &&
      fieldCellAt(engine, map.id, cell) !== null,
  });
}

/**
 * Registers the executors of `farm.sow` and `farm.harvest` (DECISIONS D-52). The worker walks to
 * the cell and works {@link sowBaseTicks} / {@link harvestBaseTicks} (scaled by `workDuration`).
 * Sowing turns a fallow cell of a working field into a sown plot (no seed item); harvesting a
 * ripe cell makes it fallow and gives the worker the crop of its zone type (`cropOutputs`, wheat
 * x4) plus the farming output bonus. A cell that is not a working field cell, is not fallow
 * (sow) or not ripe (harvest) fails the posting with `target_invalid`.
 *
 * @param engine - The engine.
 */
export function registerCropJobs(engine: GameEngine): void {
  registerJobType(
    engine,
    sowJobId,
    createWorkAtLocationExecutor(engine, {
      baseTicks: sowBaseTicks,
      complete: (target, _context, job) =>
        sowCell(target, job.posting.target.mapId, job.posting.target.cellIndex) === null
          ? null
          : [],
    }),
  );
  registerJobType(
    engine,
    harvestJobId,
    createWorkAtLocationExecutor(engine, {
      baseTicks: harvestBaseTicks,
      complete: (target, context, job) => {
        const { mapId, cellIndex } = job.posting.target;
        const field = fieldCellAt(target, mapId, cellIndex);
        const zone = field === null ? null : getZoneService(target).getZone(field.zoneId);
        const crop = zone === null ? null : cropOfZoneType(target, zone.data.zoneTypeId);
        if (crop === null || harvestCell(target, mapId, cellIndex) === null) {
          return null;
        }
        return storeGatheredOutputs(target, context, job, [
          { materialId: crop.materialId, quantity: crop.quantity },
        ]);
      },
    }),
  );
}
