import { getNeedValue } from "../ai/needs/needAccess";
import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { retrieve, storeUpTo } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import { activePostingsOfType, isBoardPaused, listBoards } from "../jobs/jobBoards";
import { jobBoardComponent } from "../jobs/jobBoardComponent";
import { registerJobType } from "../jobs/jobExecutor";
import { postJob } from "../jobs/jobPostings";
import type { JobOutput } from "../jobs/jobTypes";
import { createWorkAtLocationExecutor } from "../jobs/workAtLocation";
import { positionComponent } from "../map/positionComponent";
import { stockpileComponent } from "../storage/stockpileComponent";
import { KnownNeed } from "../ai/aiTypes";
import {
  charityBaseTicks,
  charityDistributeJobId,
  charityFoodMaterialId,
  charityMaxActivePostings,
  gatheringPosterIntervalTicks,
} from "./gatheringTypes";

function stockpileHolding(engine: GameEngine, materialId: string): Entity | null {
  for (const entity of engine.store.entities()) {
    if (
      hasComponent(entity, stockpileComponent) &&
      hasComponent(entity, inventoryComponent) &&
      getTotal(entity, materialId) > 0
    ) {
      return entity;
    }
  }
  return null;
}

/**
 * Tells whether a citizen is needy for the charity job: a citizen whose hunger is below the
 * constant `charityHungerBelow` and who carries no bread.
 *
 * @param engine - The engine.
 * @param entity - Any entity.
 * @returns True for a hungry citizen without bread.
 */
export function isNeedy(engine: GameEngine, entity: Entity): boolean {
  const hunger = getNeedValue(entity, KnownNeed.Hunger);
  return (
    hasComponent(entity, citizenComponent) &&
    hasComponent(entity, inventoryComponent) &&
    hunger !== null &&
    hunger < engine.content.constants.charityHungerBelow &&
    getTotal(entity, charityFoodMaterialId) === 0
  );
}

/**
 * The auto-poster of `charity.distribute` jobs (DECISIONS D-130). Every 12 ticks, while some
 * stockpile holds bread, at most {@link charityMaxActivePostings} postings are active and a
 * citizen is needy (see {@link isNeedy}; ascending entity id, one posting per citizen), the job is
 * posted on the first running board of the citizen's map, targeting the citizen's cell.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postCharityJobs(engine: GameEngine, tick: number): number[] {
  if (
    tick % gatheringPosterIntervalTicks !== 0 ||
    stockpileHolding(engine, charityFoodMaterialId) === null
  ) {
    return [];
  }
  const active = activePostingsOfType(engine, charityDistributeJobId);
  const served = new Set(active.map((posting) => posting.target.entityId));
  let room = charityMaxActivePostings - active.length;
  const created: number[] = [];
  for (const entity of engine.store.entities()) {
    if (room <= 0) {
      break;
    }
    const place = getComponent(entity, positionComponent);
    if (place === undefined || served.has(entity.id) || !isNeedy(engine, entity)) {
      continue;
    }
    const board = listBoards(engine).find((candidate) => {
      const boardData = getComponent(candidate, jobBoardComponent);
      return (
        getComponent(candidate, positionComponent)?.mapId === place.mapId &&
        boardData !== undefined &&
        !isBoardPaused(boardData)
      );
    });
    if (board === undefined) {
      continue;
    }
    created.push(
      postJob(
        engine,
        board.id,
        {
          jobTypeId: charityDistributeJobId,
          target: {
            mapId: place.mapId,
            cellIndex: place.cellIndex,
            entityId: entity.id,
            materialId: charityFoodMaterialId,
          },
        },
        tick,
      ).id,
    );
    room -= 1;
  }
  return created;
}

/**
 * Registers the executor of `charity.distribute`: the worker walks to the cell of the needy
 * citizen and works {@link charityBaseTicks}; then up to `charityLoaves` bread move from the
 * lowest-id stockpile that holds some into the needy citizen's inventory (no payment: the
 * settlement gives it). The posting fails with `target_invalid` when the citizen is gone, is the
 * worker, is no longer needy, is not within one cell of the posted place or no bread is stored.
 *
 * @param engine - The engine.
 */
export function registerCharityJobs(engine: GameEngine): void {
  registerJobType(
    engine,
    charityDistributeJobId,
    createWorkAtLocationExecutor(engine, {
      baseTicks: charityBaseTicks,
      complete: (target, context, job): JobOutput[] | null => {
        const needyId = job.posting.target.entityId;
        const needy = needyId === null ? undefined : target.store.get(needyId);
        const map = target.maps.get(job.posting.target.mapId);
        const place = needy === undefined ? undefined : getComponent(needy, positionComponent);
        const source = stockpileHolding(target, charityFoodMaterialId);
        if (
          needy === undefined ||
          map === undefined ||
          place === undefined ||
          source === null ||
          needy.id === context.entity.id ||
          !isNeedy(target, needy) ||
          (place.cellIndex !== job.posting.target.cellIndex &&
            !map.neighbors(job.posting.target.cellIndex).includes(place.cellIndex))
        ) {
          return null;
        }
        const wanted = Math.min(
          target.content.constants.charityLoaves,
          getTotal(source, charityFoodMaterialId),
        );
        const inventory = { materials: target.materials, actor: null, bus: target.bus };
        retrieve(inventory, source, charityFoodMaterialId, wanted);
        const given = storeUpTo(inventory, needy, charityFoodMaterialId, wanted);
        if (given.remainder > 0) {
          storeUpTo(inventory, source, charityFoodMaterialId, given.remainder);
        }
        return given.stored > 0
          ? [{ materialId: charityFoodMaterialId, quantity: given.stored }]
          : null;
      },
    }),
  );
}
