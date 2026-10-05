import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getJobService } from "../jobs/jobServiceRegistry";
import { tierOrder } from "../jobs/JobService";
import type { RecipeContent } from "../content/schemas/economySchemas";
import { furnitureComponent } from "../storage/furnitureComponent";
import { ProductionError, ProductionErrorKind } from "./ProductionError";
import { productionOrdersComponent } from "./productionOrdersComponent";
import type { ProductionOrder, WorkstationData } from "./productionTypes";

/**
 * A production order together with the workstation that holds it.
 */
export type OrderLocation = {
  station: Entity;
  data: WorkstationData;
  order: ProductionOrder;
};

/**
 * All workstation entities (entities with a `ProductionOrders` component), ascending by id.
 *
 * @param engine - The engine.
 * @returns Live entities.
 */
export function listWorkstations(engine: GameEngine): Entity[] {
  return engine.store
    .entities()
    .filter((entity) => getComponent(entity, productionOrdersComponent) !== undefined);
}

/**
 * Looks a workstation up.
 *
 * @param engine - The engine.
 * @param workstationId - Entity id.
 * @returns The entity with its component data, or null when the entity does not exist or has no
 *   `ProductionOrders` component.
 */
export function findWorkstation(
  engine: GameEngine,
  workstationId: number,
): { station: Entity; data: WorkstationData } | null {
  const station = engine.store.get(workstationId);
  const data = station === undefined ? undefined : getComponent(station, productionOrdersComponent);
  return station === undefined || data === undefined ? null : { station, data };
}

/**
 * Looks a workstation up.
 *
 * @param engine - The engine.
 * @param workstationId - Entity id.
 * @returns The entity with its component data.
 * @throws ProductionError `UnknownEntity` when the entity does not exist or has no
 *   `ProductionOrders` component.
 */
export function requireWorkstation(
  engine: GameEngine,
  workstationId: number,
): { station: Entity; data: WorkstationData } {
  const found = findWorkstation(engine, workstationId);
  if (found === null) {
    throw new ProductionError(
      ProductionErrorKind.UnknownEntity,
      `entity ${workstationId} does not exist or is not a workstation`,
    );
  }
  return found;
}

/**
 * The furniture tags of a workstation entity (from its `furniture.json` record).
 *
 * @param engine - The engine.
 * @param station - A workstation entity.
 * @returns The tags, empty when the entity has no furniture record.
 */
export function stationTags(engine: GameEngine, station: Entity): readonly string[] {
  const furniture = getComponent(station, furnitureComponent);
  return furniture === undefined
    ? []
    : (engine.content.furniture.find(furniture.furnitureId)?.tags ?? []);
}

/**
 * Whether a workstation can make a recipe: its furniture carries the recipe's `workstationTag`.
 *
 * @param engine - The engine.
 * @param station - A workstation entity.
 * @param recipe - The recipe.
 * @returns True when the tag matches.
 */
export function canMake(engine: GameEngine, station: Entity, recipe: RecipeContent): boolean {
  return stationTags(engine, station).includes(recipe.workstationTag);
}

/**
 * The recipes a workstation can make, in content order.
 *
 * @param engine - The engine.
 * @param station - A workstation entity.
 * @returns Recipe records, locked ones included.
 */
export function compatibleRecipes(engine: GameEngine, station: Entity): RecipeContent[] {
  return engine.content.recipes.all().filter((recipe) => canMake(engine, station, recipe));
}

/**
 * The workstations that can make a recipe, ascending by id (a standing order picks one of them).
 *
 * @param engine - The engine.
 * @param recipeId - Recipe id.
 * @returns Workstation entities; empty for an unknown recipe.
 */
export function capableWorkstations(engine: GameEngine, recipeId: string): Entity[] {
  const recipe = engine.content.recipes.find(recipeId);
  return recipe === undefined
    ? []
    : listWorkstations(engine).filter((station) => canMake(engine, station, recipe));
}

/**
 * Finds an order by id over all workstations.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @returns The order with its workstation, or null when no workstation holds it.
 */
export function findOrder(engine: GameEngine, orderId: number): OrderLocation | null {
  for (const station of listWorkstations(engine)) {
    const data = getComponent(station, productionOrdersComponent);
    const order = data?.orders.find((candidate) => candidate.orderId === orderId);
    if (data !== undefined && order !== undefined) {
      return { station, data, order };
    }
  }
  return null;
}

/**
 * Finds an order by id.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @returns The order with its workstation.
 * @throws ProductionError `UnknownOrder` when no workstation holds the order.
 */
export function requireOrder(engine: GameEngine, orderId: number): OrderLocation {
  const found = findOrder(engine, orderId);
  if (found === null) {
    throw new ProductionError(
      ProductionErrorKind.UnknownOrder,
      `production order ${orderId} does not exist`,
    );
  }
  return found;
}

/**
 * Whether the settlement tier has not reached the tier a recipe needs (spec 027 FR-008).
 *
 * @param engine - The engine.
 * @param recipe - The recipe.
 * @returns True when the recipe is still locked.
 */
export function isRecipeLocked(engine: GameEngine, recipe: RecipeContent): boolean {
  return (
    recipe.unlockTier !== undefined &&
    tierOrder.indexOf(getJobService(engine).currentTier()) < tierOrder.indexOf(recipe.unlockTier)
  );
}
