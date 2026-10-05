import { getAiService } from "../ai/aiServiceRegistry";
import { getComponent, hasComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { storeUpTo } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import { positionComponent } from "../map/positionComponent";
import { jobBoardComponent } from "./jobBoardComponent";
import { activePostingsOfType, isBoardPaused, listBoards } from "./jobBoards";
import { registerJobType } from "./jobExecutor";
import { postJob } from "./jobPostings";
import type { JobOutput } from "./jobTypes";
import { createWorkAtLocationExecutor } from "./workAtLocation";

/**
 * Job type id of felling a forest cell (`jobs.json`).
 */
export const fellTreesJobId = "fell.trees";

/**
 * Material the felling auto-poster watches (`jobs.json` output of `fell.trees`).
 */
export const woodMaterialId = "oak_log";

/**
 * Base work time of one tree, ticks (two game hours at skill 0 without traits).
 */
export const fellBaseTicks = 24;

/**
 * The auto-poster looks every this many ticks (one game hour).
 */
export const fellPosterIntervalTicks = 12;

/**
 * The auto-poster posts only while the settlement holds fewer oak logs than this (the total over
 * all inventories; stockpiles of task 3.2 will count too).
 */
export const fellLowWoodStock = 40;

/**
 * Most active `fell.trees` postings the auto-poster keeps, over all boards.
 */
export const fellMaxActivePostings = 4;

/**
 * Forest cells further than this path cost from a board are not posted (about 25 normal cells).
 */
export const fellRadiusCost = 300;

/**
 * Total quantity of the wood material in all inventories of the world.
 *
 * @param engine - The engine.
 * @returns Whole logs.
 */
export function woodStock(engine: GameEngine): number {
  let total = 0;
  for (const entity of engine.store.entities()) {
    if (hasComponent(entity, inventoryComponent)) {
      total += getTotal(entity, woodMaterialId);
    }
  }
  return total;
}

/**
 * The deterministic auto-poster of `fell.trees` jobs (DECISIONS D-08: system postings go to the
 * board at once). It runs on the poster interval; while {@link woodStock} is below
 * {@link fellLowWoodStock} and fewer than {@link fellMaxActivePostings} felling postings are
 * active it posts the nearest forest cells (path cost from the board at most
 * {@link fellRadiusCost}; ties lowest cell index) on each running board in ascending id order,
 * never twice for the same cell.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postFellJobs(engine: GameEngine, tick: number): number[] {
  const jobType = engine.content.jobs.find(fellTreesJobId);
  if (jobType === undefined || tick % fellPosterIntervalTicks !== 0) {
    return [];
  }
  if (woodStock(engine) >= fellLowWoodStock) {
    return [];
  }
  const forestId = jobType.zoneContext.ref;
  const created: number[] = [];
  for (const board of listBoards(engine)) {
    const data = getComponent(board, positionComponent);
    const boardData = getComponent(board, jobBoardComponent);
    const active = activePostingsOfType(engine, fellTreesJobId);
    const room = fellMaxActivePostings - active.length;
    const map = data === undefined ? undefined : engine.maps.get(data.mapId);
    if (
      data === undefined ||
      boardData === undefined ||
      map === undefined ||
      room <= 0 ||
      isBoardPaused(boardData)
    ) {
      continue;
    }
    const taken = new Set(active.map((posting) => posting.target.cellIndex));
    const cells = getAiService(engine)
      .pathfinding.reachable(data.mapId, data.cellIndex, fellRadiusCost)
      .filter((entry) => map.terrainAt(entry.cell) === forestId && !taken.has(entry.cell))
      .sort((left, right) =>
        left.cost === right.cost ? left.cell - right.cell : left.cost - right.cost,
      )
      .slice(0, room);
    for (const entry of cells) {
      const posting = postJob(
        engine,
        board.id,
        {
          jobTypeId: fellTreesJobId,
          target: { mapId: data.mapId, cellIndex: entry.cell, entityId: null, materialId: null },
        },
        tick,
      );
      created.push(posting.id);
    }
  }
  return created;
}

/**
 * Registers the executor of `fell.trees`: the worker walks to the forest cell, works
 * {@link fellBaseTicks} (scaled by `workDuration`), then the cell turns into the terrain the
 * forest `clearsTo` (grassland) and the job's `outputs` (oak_log x3) go into the worker's
 * inventory as far as they fit. A cell that is no longer forest fails the posting with
 * `target_invalid`.
 *
 * @param engine - The engine.
 */
export function registerFellTrees(engine: GameEngine): void {
  registerJobType(
    engine,
    fellTreesJobId,
    createWorkAtLocationExecutor(engine, {
      baseTicks: fellBaseTicks,
      complete: (target, context, job) => {
        const map = target.maps.get(job.posting.target.mapId);
        const forestId = job.jobType.zoneContext.ref;
        const clearsTo =
          forestId === undefined
            ? undefined
            : target.content.terrainContent.find(forestId)?.clearsTo;
        if (
          map === undefined ||
          forestId === undefined ||
          clearsTo === undefined ||
          clearsTo === null ||
          map.terrainAt(job.posting.target.cellIndex) !== forestId
        ) {
          return null;
        }
        map.setTerrain(job.posting.target.cellIndex, clearsTo);
        const outputs: JobOutput[] = [];
        for (const output of job.jobType.outputs) {
          const result = storeUpTo(
            { materials: target.materials, actor: null, bus: target.bus },
            context.entity,
            output.materialId,
            output.quantity,
          );
          if (result.stored > 0) {
            outputs.push({ materialId: output.materialId, quantity: result.stored });
          }
        }
        return outputs;
      },
    }),
  );
}
