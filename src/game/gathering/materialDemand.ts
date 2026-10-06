import type { GameEngine } from "../engine/GameEngine";
import { getComponent } from "../ecs/Entity";
import { listWorkstations } from "../production/productionQueries";
import { productionOrdersComponent } from "../production/productionOrdersComponent";
import { OrderStatus } from "../production/productionTypes";
import { materialStock } from "./materialStock";

/**
 * Units of a material that the unfinished production orders still need as recipe inputs
 * (`quantity x crafts remaining` over every active order, DECISIONS D-130).
 *
 * @param engine - The engine.
 * @param materialId - Material id.
 * @returns Whole units.
 */
export function ordersNeed(engine: GameEngine, materialId: string): number {
  let total = 0;
  for (const station of listWorkstations(engine)) {
    for (const order of getComponent(station, productionOrdersComponent)?.orders ?? []) {
      if (order.status !== OrderStatus.Active || order.remaining < 1) {
        continue;
      }
      const recipe = engine.content.recipes.find(order.recipeId);
      for (const input of recipe?.inputs ?? []) {
        if (input.materialId === materialId) {
          total += input.quantity * order.remaining;
        }
      }
    }
  }
  return total;
}

/**
 * Tells whether the settlement wants more of a raw material: the total in all inventories is below
 * what the active production orders need, or below the content constant `rawLowStock` (0 in the
 * shipped pack, so nothing is gathered "just in case"). It is the gate of the terrain gathering
 * posters (felling pine and birch, clay, sand, granite, metal veins), so they never flood the
 * boards and never change a settlement that has no use for the material (DECISIONS D-130).
 *
 * @param engine - The engine.
 * @param materialId - Material id.
 * @returns True when more is wanted.
 */
export function materialDemanded(engine: GameEngine, materialId: string): boolean {
  const stock = materialStock(engine, materialId);
  return stock < engine.content.constants.rawLowStock || stock < ordersNeed(engine, materialId);
}
