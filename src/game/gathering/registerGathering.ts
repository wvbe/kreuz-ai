import { z } from "zod";
import { defineQuery } from "../api/defineQuery";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { jobsSystemId } from "../jobs/jobTypes";
import { storageSystemId } from "../storage/storageTypes";
import { zonesSystemId } from "../zones/zoneTypes";
import { growCrops } from "./cropPlots";
import { postHarvestJobs, postSowJobs, registerCropJobs } from "./cropJobs";
import { GatheringService } from "./GatheringService";
import { bindGatheringService, getGatheringService } from "./gatheringServiceRegistry";
import { gatheringSystemId } from "./gatheringTypes";
import { buildCropsView } from "./buildCropsView";
import { postCharityJobs, registerCharityJobs } from "./charityJobs";
import { postFishJobs, registerFishJobs } from "./fishJobs";
import { postMineJobs, postQuarryJobs, registerMiningJobs } from "./miningJobs";
import { postTerrainJobs, registerTerrainJobs } from "./terrainJobs";

const registered = new WeakSet<GameEngine>();

/**
 * Registers gathering with an engine (once per engine; the engine does it for itself, so every
 * game has it, after construction). It adds:
 * - the executors of the job types `farm.sow`, the harvest jobs (`farm.harvest`, `gather.herbs`,
 *   `gather.fruit`, `gather.grapes`), `mine.ore`, `quarry.stone`, `fish.catch` and the terrain
 *   gathering jobs (`fell.pine`, `fell.birch`, `dig.clay`, `gather.sand`, `mine.vein`,
 *   `quarry.granite`; DECISIONS D-130);
 * - the save section `systems.gathering` (crop plots and the charges left of worked deposits);
 * - the slot-12 system `gathering`: every tick the crop pass (`growCrops`), every 12 ticks the
 *   auto-posters of sowing, harvesting, mining (ore below `oreLowStock`), quarrying
 *   (limestone below `stoneLowStock`), fishing at docks and the demand-driven terrain jobs;
 * - the query `crops {zoneId?}` (the cells of the farm fields with stage and growth). There are no
 *   commands: the player designates a `farm_field` zone with `DesignateZone` and the settlers do
 *   the rest.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerZones`.
 * @returns The engine's gathering service.
 */
export function registerGathering(engine: GameEngine): GatheringService {
  if (registered.has(engine)) {
    return getGatheringService(engine);
  }
  registered.add(engine);
  const service = new GatheringService();
  bindGatheringService(engine, service);
  registerCropJobs(engine);
  registerMiningJobs(engine);
  registerTerrainJobs(engine);
  registerFishJobs(engine);
  registerCharityJobs(engine);
  engine.registerSystem({
    id: gatheringSystemId,
    dependencies: [jobsSystemId, storageSystemId, zonesSystemId],
    slot: TickSlot.World,
    saveSection: service.createSection(),
    run: (context) => {
      growCrops(engine);
      postSowJobs(engine, context.tick);
      postHarvestJobs(engine, context.tick);
      postMineJobs(engine, context.tick);
      postQuarryJobs(engine, context.tick);
      postTerrainJobs(engine, context.tick);
      postFishJobs(engine, context.tick);
      postCharityJobs(engine, context.tick);
    },
    queries: {
      crops: defineQuery({
        schema: z.object({ zoneId: z.number().int().min(1).optional() }).strict(),
        run: ({ zoneId }, target) => buildCropsView(target, zoneId),
      }),
    },
  });
  return service;
}
