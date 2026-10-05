import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { furnitureComponent } from "../storage/furnitureComponent";
import { explainOrder, explainWorkstation } from "./productionBlockers";
import { productionOrdersComponent } from "./productionOrdersComponent";
import {
  compatibleRecipes,
  findOrder,
  isRecipeLocked,
  findWorkstation,
  listWorkstations,
  stationTags,
} from "./productionQueries";
import { OrderStatus } from "./productionTypes";
import type {
  ActiveCraft,
  CraftItem,
  ProductionBlockedReason,
  ProductionOrder,
} from "./productionTypes";

/**
 * The craft a workstation works on, for views.
 */
export type CraftingView = {
  crafterId: number;
  recipeId: string;
  startedTick: number;
  /**
   * Ticks done so far, `0..durationTicks` (integer, +1 per tick).
   */
  progressTicks: number;
  durationTicks: number;
};

/**
 * One order as a plain view (queries `production-orders` and `order`).
 */
export type OrderView = {
  orderId: number;
  workstationId: number;
  recipeId: string;
  quantity: number;
  remaining: number;
  priority: number;
  status: OrderStatus;
  postingId: number | null;
  createdTick: number;
  crafting: CraftingView | null;
};

/**
 * The query `order {orderId}`: the order plus why it does not progress (spec 025 reasons).
 */
export type OrderDetailView = OrderView & {
  blocked: ProductionBlockedReason[];
};

/**
 * One recipe a workstation can make (query `recipes-for`).
 */
export type RecipeView = {
  id: string;
  name: string;
  inputs: CraftItem[];
  outputs: CraftItem[];
  durationTicks: number;
  skillId: string | null;
  minSkillLevel: number;
  roomZoneId: string | null;
  toolMaterialIds: string[];
  unlockTier: string | null;
  locked: boolean;
};

/**
 * One workstation as a view (query `workstations`).
 */
export type WorkstationView = {
  entityId: number;
  furnitureId: string | null;
  tags: string[];
  mapId: number | null;
  cellIndex: number | null;
  crafting: CraftingView | null;
  unfinishedOrders: number;
  blocked: ProductionBlockedReason[];
};

function craftingView(engine: GameEngine, craft: ActiveCraft | null): CraftingView | null {
  return craft === null
    ? null
    : {
        crafterId: craft.crafterId,
        recipeId: craft.recipeId,
        startedTick: craft.startedTick,
        progressTicks: Math.max(
          0,
          Math.min(craft.durationTicks, engine.time.tickCount - craft.startedTick),
        ),
        durationTicks: craft.durationTicks,
      };
}

function orderView(engine: GameEngine, station: Entity, order: ProductionOrder): OrderView {
  const craft = getComponent(station, productionOrdersComponent)?.craft ?? null;
  return {
    orderId: order.orderId,
    workstationId: order.workstationId,
    recipeId: order.recipeId,
    quantity: order.quantity,
    remaining: order.remaining,
    priority: order.priority,
    status: order.status,
    postingId: order.postingId,
    createdTick: order.createdTick,
    crafting:
      craft !== null && craft.orderId === order.orderId ? craftingView(engine, craft) : null,
  };
}

/**
 * The production orders of one workstation or of all, ascending by workstation id then order id
 * (query `production-orders`).
 *
 * @param engine - The engine.
 * @param workstationId - Restrict to one workstation (none when it is no workstation), or all
 *   when omitted.
 * @returns Order views, finished orders included (bounded per workstation).
 */
export function buildOrderViews(engine: GameEngine, workstationId?: number): OrderView[] {
  const one = workstationId === undefined ? null : findWorkstation(engine, workstationId);
  const stations =
    workstationId === undefined ? listWorkstations(engine) : one === null ? [] : [one.station];
  return stations.flatMap((station) =>
    (getComponent(station, productionOrdersComponent)?.orders ?? []).map((order) =>
      orderView(engine, station, order),
    ),
  );
}

/**
 * One order with its blocked reasons (query `order {orderId}`).
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @returns The view, or null when no workstation holds the order.
 */
export function buildOrderDetail(engine: GameEngine, orderId: number): OrderDetailView | null {
  const found = findOrder(engine, orderId);
  return found === null
    ? null
    : {
        ...orderView(engine, found.station, found.order),
        blocked: explainOrder(engine, orderId).reasons,
      };
}

/**
 * The recipes a workstation can make, in content order (query `recipes-for {workstationId}`).
 *
 * @param engine - The engine.
 * @param workstationId - Workstation entity id.
 * @returns Recipe views with their lock state, or null when it is not a workstation.
 */
export function buildRecipeViews(engine: GameEngine, workstationId: number): RecipeView[] | null {
  const found = findWorkstation(engine, workstationId);
  if (found === null) {
    return null;
  }
  return compatibleRecipes(engine, found.station).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    inputs: recipe.inputs.map((item) => ({ ...item })),
    outputs: recipe.outputs.map((item) => ({ ...item })),
    durationTicks: recipe.durationTicks,
    skillId: recipe.skillId,
    minSkillLevel: recipe.minSkillLevel,
    roomZoneId: recipe.roomZoneId ?? null,
    toolMaterialIds: [...recipe.toolMaterialIds],
    unlockTier: recipe.unlockTier ?? null,
    locked: isRecipeLocked(engine, recipe),
  }));
}

/**
 * All workstations, ascending by id, with the craft in progress and the reasons they stall (query
 * `workstations`).
 *
 * @param engine - The engine.
 * @returns Workstation views.
 */
export function buildWorkstationViews(engine: GameEngine): WorkstationView[] {
  return listWorkstations(engine).map((station) => {
    const place = getComponent(station, positionComponent);
    const data = getComponent(station, productionOrdersComponent);
    return {
      entityId: station.id,
      furnitureId: getComponent(station, furnitureComponent)?.furnitureId ?? null,
      tags: [...stationTags(engine, station)],
      mapId: place?.mapId ?? null,
      cellIndex: place?.cellIndex ?? null,
      crafting: craftingView(engine, data?.craft ?? null),
      unfinishedOrders: (data?.orders ?? []).filter(
        (order) => order.status === OrderStatus.Active || order.status === OrderStatus.Paused,
      ).length,
      blocked: explainWorkstation(engine, station.id),
    };
  });
}
