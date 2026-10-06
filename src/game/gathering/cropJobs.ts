import type { GameEngine } from "../engine/GameEngine";
import { createWorkAtLocationExecutor } from "../jobs/workAtLocation";
import { registerJobType } from "../jobs/jobExecutor";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { cropOfZoneType, fieldCellAt, harvestCell, harvestJobOf, sowCell } from "./cropPlots";
import { materialStock } from "./materialStock";
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

function zoneTypeAt(engine: GameEngine, mapId: number, cell: number): string | null {
  const field = fieldCellAt(engine, mapId, cell);
  return field === null
    ? null
    : (getZoneService(engine).getZone(field.zoneId)?.data.zoneTypeId ?? null);
}

/**
 * The auto-poster of `farm.sow` jobs: every fallow crop cell of a working field (an active zone
 * with `cropOutputs` that is not perennial: farm, flax, barley, rye fields, vegetable garden) is a
 * candidate, posted nearest to a board first, bounded by `gatheringMaxActivePostings` (see
 * `postCellJobs`). Perennial zones replant themselves and have no sowing job.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postSowJobs(engine: GameEngine, tick: number): number[] {
  const service = getGatheringService(engine);
  return postCellJobs(engine, tick, {
    jobTypeId: sowJobId,
    isCandidate: (map, cell) => {
      const zoneTypeId = zoneTypeAt(engine, map.id, cell);
      return (
        zoneTypeId !== null &&
        engine.content.zones.find(zoneTypeId)?.perennial !== true &&
        service.plotAt(map.id, cell) === undefined
      );
    },
  });
}

/**
 * The harvest job types of the pack: `farm.harvest` and the `harvestJobId` of every crop zone type
 * (gather.herbs, gather.fruit, gather.grapes), without duplicates, in zone file order.
 *
 * @param engine - The engine.
 * @returns Job type ids.
 */
export function harvestJobTypeIds(engine: GameEngine): string[] {
  const ids = new Set<string>([harvestJobId]);
  for (const zoneType of engine.content.zones.all()) {
    if (zoneType.cropOutputs.length > 0) {
      ids.add(harvestJobOf(engine, zoneType.id));
    }
  }
  return [...ids];
}

/**
 * The auto-posters of the harvest jobs: every ripe cell of a working crop zone is a candidate for
 * its zone type's harvest job (see `postCellJobs`). `farm.harvest` is not stock-gated (a ripe
 * crop is always worth harvesting); the perennial gathering jobs (`gather.herbs`, `gather.fruit`,
 * `gather.grapes`) post only while the settlement holds fewer than `zoneGatherLowStock` of the
 * zone's crop (the zone is the player's demand, the cap stops endless picking, D-130).
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postHarvestJobs(engine: GameEngine, tick: number): number[] {
  const service = getGatheringService(engine);
  const created: number[] = [];
  for (const jobTypeId of harvestJobTypeIds(engine)) {
    const crop = engine.content.jobs.find(jobTypeId)?.outputs[0];
    if (
      jobTypeId !== harvestJobId &&
      (crop === undefined ||
        materialStock(engine, crop.materialId) >= engine.content.constants.zoneGatherLowStock)
    ) {
      continue;
    }
    created.push(
      ...postCellJobs(engine, tick, {
        jobTypeId,
        isCandidate: (map, cell) => {
          const zoneTypeId = zoneTypeAt(engine, map.id, cell);
          return (
            zoneTypeId !== null &&
            harvestJobOf(engine, zoneTypeId) === jobTypeId &&
            service.plotAt(map.id, cell)?.stage === CropStage.Ripe
          );
        },
      }),
    );
  }
  return created;
}

/**
 * Registers the executors of `farm.sow` and of every harvest job (`farm.harvest`, `gather.herbs`,
 * `gather.fruit`, `gather.grapes`; DECISIONS D-52, D-130). They differ only in which zone types
 * they serve. The worker walks to
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
  for (const jobTypeId of harvestJobTypeIds(engine)) {
    registerJobType(
      engine,
      jobTypeId,
      createWorkAtLocationExecutor(engine, {
        baseTicks: harvestBaseTicks,
        complete: (target, context, job) => {
          const { mapId, cellIndex } = job.posting.target;
          const field = fieldCellAt(target, mapId, cellIndex);
          const zone = field === null ? null : getZoneService(target).getZone(field.zoneId);
          const crop = zone === null ? null : cropOfZoneType(target, zone.data.zoneTypeId);
          if (
            crop === null ||
            zone === null ||
            harvestJobOf(target, zone.data.zoneTypeId) !== jobTypeId ||
            harvestCell(target, mapId, cellIndex) === null
          ) {
            return null;
          }
          return storeGatheredOutputs(target, context, job, [
            { materialId: crop.materialId, quantity: crop.quantity },
          ]);
        },
      }),
    );
  }
}
