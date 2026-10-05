import type { Entity } from "../ecs/Entity";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { InventoryError } from "../inventory/InventoryError";
import { retrieve, store } from "../inventory/inventoryOperations";
import type { CraftItem } from "./productionTypes";

/**
 * Whether the outputs of a craft fit into a workstation inventory, tried on a copy: first the
 * inputs that the craft consumes leave (they free their slots), then the outputs go in one by one
 * in recipe order (slots and weight are shared, so the order matters for the answer).
 *
 * @param engine - The engine with the material registry.
 * @param station - The workstation entity (its inventory is not changed).
 * @param consumed - Inputs that will leave the inventory first (those already present).
 * @param outputs - The outputs to place.
 * @returns The material id of the first output that does not fit, or null when all fit.
 */
export function firstOutputMisfit(
  engine: GameEngine,
  station: Entity,
  consumed: readonly CraftItem[],
  outputs: readonly CraftItem[],
): string | null {
  const inventory = getComponent(station, inventoryComponent);
  const first = outputs[0];
  if (inventory === undefined) {
    return first === undefined ? null : first.materialId;
  }
  const copy: Entity = {
    id: station.id,
    prototype: station.prototype,
    components: { Inventory: structuredClone(inventory) },
  };
  const context = { materials: engine.materials, actor: null };
  try {
    for (const item of consumed) {
      retrieve(context, copy, item.materialId, item.quantity);
    }
  } catch (thrown) {
    if (!(thrown instanceof InventoryError)) {
      throw thrown;
    }
    // Inputs not present yet: judge the outputs against the inventory as it is.
    copy.components["Inventory"] = structuredClone(inventory);
  }
  for (const item of outputs) {
    try {
      store(context, copy, item.materialId, item.quantity);
    } catch (thrown) {
      if (!(thrown instanceof InventoryError)) {
        throw thrown;
      }
      return item.materialId;
    }
  }
  return null;
}
