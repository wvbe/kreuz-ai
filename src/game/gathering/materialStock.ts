import { hasComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { getTotal } from "../inventory/inventoryQueries";
import { traderComponent } from "../trade/traderComponent";

/**
 * Total quantity of a material in all inventories of the world (settlers, piles, storages): what
 * the stock-threshold auto-posters compare with their content constants, so goods that are
 * carried or waiting to be hauled count as already produced. Travelling traders are not part of
 * the settlement (what they bought has left the economy, D-13) and are not counted.
 *
 * @param engine - The engine.
 * @param materialId - Material id.
 * @returns Whole units.
 */
export function materialStock(engine: GameEngine, materialId: string): number {
  let total = 0;
  for (const entity of engine.store.entities()) {
    if (hasComponent(entity, inventoryComponent) && !hasComponent(entity, traderComponent)) {
      total += getTotal(entity, materialId);
    }
  }
  return total;
}
