import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getAllItems } from "../inventory/inventoryQueries";
import { defaultEligibility } from "../jobs/eligibility";
import { activePostingsOfType, findPosting } from "../jobs/jobBoards";
import { postJob } from "../jobs/jobPostings";
import { EligibilityKind, PostingStatus } from "../jobs/jobTypes";
import type { Eligibility } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { nearestRunningBoard, postHaulJob } from "../storage/haulPoster";
import { chooseRoute } from "../storage/storageRouting";
import { getStorageService } from "../storage/storageServiceRegistry";
import { haulJobId } from "../storage/storageTypes";
import { interruptCraft } from "./craftCleanup";
import { orderBlockers } from "./productionBlockers";
import { productionOrdersComponent } from "./productionOrdersComponent";
import { listWorkstations } from "./productionQueries";
import {
  craftJobId,
  crafterLostReason,
  OrderStatus,
  productionPosterIntervalTicks,
} from "./productionTypes";
import type { ProductionOrder } from "./productionTypes";

const postingGoneCraftReason = "posting_gone";

function isUnfinished(order: ProductionOrder): boolean {
  return order.status === OrderStatus.Active || order.status === OrderStatus.Paused;
}

function craftEligibility(engine: GameEngine, order: ProductionOrder): Eligibility[] {
  const recipe = engine.content.recipes.find(order.recipeId);
  const eligibility = defaultEligibility();
  if (recipe !== undefined && recipe.skillId !== null && recipe.minSkillLevel > 0) {
    eligibility.push({
      kind: EligibilityKind.MinSkill,
      skillId: recipe.skillId,
      level: recipe.minSkillLevel,
    });
  }
  return eligibility;
}

/**
 * Posts `craft.produce` jobs for the orders (DECISIONS D-10: every active order posts a craft job;
 * system postings go to the nearest running board at once, D-08). For each workstation that is
 * not crafting and has no posting out: its active orders by priority desc then id, the first one
 * with no blocker (see `orderBlockers`) gets one single-craft posting (target: the workstation
 * cell and entity) with the order's priority; skilled recipes add the `MinSkill` predicate.
 * A posting that vanished (failed, cancelled by somebody else) is forgotten first. This keeps one
 * posting, and so one crafter, per workstation (spec 014 FR-012). Runs every
 * {@link productionPosterIntervalTicks} ticks.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postCraftJobs(engine: GameEngine, tick: number): number[] {
  if (!engine.content.jobs.has(craftJobId) || tick % productionPosterIntervalTicks !== 0) {
    return [];
  }
  const created: number[] = [];
  for (const station of listWorkstations(engine)) {
    const data = getComponent(station, productionOrdersComponent);
    const place = getComponent(station, positionComponent);
    if (data === undefined || place === undefined) {
      continue;
    }
    for (const order of data.orders) {
      if (order.postingId !== null && findPosting(engine, order.postingId) === null) {
        order.postingId = null;
      }
    }
    if (data.craft !== null || data.orders.some((order) => order.postingId !== null)) {
      continue;
    }
    const candidates = data.orders
      .filter((order) => order.status === OrderStatus.Active && order.remaining > 0)
      .sort((left, right) => right.priority - left.priority || left.orderId - right.orderId);
    const boardId = candidates.length === 0 ? null : nearestRunningBoard(engine, station);
    if (boardId === null) {
      continue;
    }
    for (const order of candidates) {
      if (orderBlockers(engine, station, order).length > 0) {
        continue;
      }
      const posting = postJob(
        engine,
        boardId,
        {
          jobTypeId: craftJobId,
          target: {
            mapId: place.mapId,
            cellIndex: place.cellIndex,
            entityId: station.id,
            materialId: null,
          },
          priority: order.priority,
          eligibility: craftEligibility(engine, order),
        },
        tick,
      );
      order.postingId = posting.id;
      created.push(posting.id);
      break;
    }
  }
  return created;
}

function neededMaterials(engine: GameEngine, data: { orders: ProductionOrder[] }): Set<string> {
  const needed = new Set<string>();
  for (const order of data.orders) {
    const recipe = isUnfinished(order) ? engine.content.recipes.find(order.recipeId) : undefined;
    for (const item of recipe?.inputs ?? []) {
      needed.add(item.materialId);
    }
    for (const tool of recipe?.toolMaterialIds ?? []) {
      needed.add(tool);
    }
  }
  return needed;
}

/**
 * Posts `haul.deliver` jobs for goods lying in workstation inventories: outputs of finished
 * crafts and inputs nobody needs any more (a cancelled order's leftovers, interrupted crafts).
 * What an unfinished order of the workstation still needs as input or tool stays. Locked units
 * never leave. A good with an active haul posting or without an accepting storage is skipped (the
 * order then reports `OutputBlocked` once the inventory is full). Runs every
 * {@link productionPosterIntervalTicks} ticks.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the haul postings created.
 */
export function postOutputHauls(engine: GameEngine, tick: number): number[] {
  if (!engine.content.jobs.has(haulJobId) || tick % productionPosterIntervalTicks !== 0) {
    return [];
  }
  const reservations = getStorageService(engine).reservations;
  const active = activePostingsOfType(engine, haulJobId);
  const created: number[] = [];
  for (const station of listWorkstations(engine)) {
    const data = getComponent(station, productionOrdersComponent);
    const place = getComponent(station, positionComponent);
    if (data === undefined || place === undefined) {
      continue;
    }
    const needed = neededMaterials(engine, data);
    for (const item of getAllItems(station)) {
      const quantity = reservations.availableTo(station.id, item.materialId, null);
      if (
        quantity < 1 ||
        needed.has(item.materialId) ||
        active.some(
          (posting) =>
            posting.target.entityId === station.id && posting.target.materialId === item.materialId,
        ) ||
        chooseRoute(engine, {
          materialId: item.materialId,
          quantity,
          actorId: null,
          mapId: place.mapId,
          fromCell: place.cellIndex,
        }) === null
      ) {
        continue;
      }
      const boardId = nearestRunningBoard(engine, station);
      if (boardId !== null) {
        created.push(postHaulJob(engine, boardId, station.id, item.materialId, tick).id);
      }
    }
  }
  return created;
}

function hasCraftTask(engine: GameEngine, crafterId: number, postingId: number): boolean {
  return (
    engine.tasks
      .getQueue(crafterId)
      ?.tasks.some(
        (task) =>
          task.type === craftJobId &&
          typeof task.data === "object" &&
          task.data !== null &&
          !Array.isArray(task.data) &&
          task.data["postingId"] === postingId,
      ) ?? false
  );
}

/**
 * Frees workstations whose craft lost its crafter: the crafter was deleted, or its posting was
 * cancelled or taken away, or its craft task is gone. The locks are released (the inputs stay in
 * the work inventory), `production.crafting.interrupted` is queued with `crafter_lost` or
 * `posting_gone`, and the order carries on (its posting, if it still exists, goes back to the
 * board by the usual rules). Runs every tick.
 *
 * @param engine - The engine.
 * @returns How many crafts were interrupted.
 */
export function sweepStaleCrafts(engine: GameEngine): number {
  let swept = 0;
  for (const station of listWorkstations(engine)) {
    const data = getComponent(station, productionOrdersComponent);
    const craft = data?.craft;
    if (data === undefined || craft === null || craft === undefined) {
      continue;
    }
    const posting = findPosting(engine, craft.postingId)?.posting;
    const crafter: Entity | undefined = engine.store.get(craft.crafterId);
    let reason: string | null = null;
    if (crafter === undefined) {
      reason = crafterLostReason;
    } else if (
      posting === undefined ||
      posting.status !== PostingStatus.Claimed ||
      posting.claimantId !== crafter.id
    ) {
      reason = postingGoneCraftReason;
    } else if (!hasCraftTask(engine, crafter.id, craft.postingId)) {
      reason = crafterLostReason;
    }
    if (reason !== null && interruptCraft(engine, station, data, reason)) {
      swept += 1;
    }
  }
  return swept;
}
