import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { InventoryError, InventoryErrorKind } from "./InventoryError";
import { inventoryComponent } from "./inventoryComponent";
import { assertPositiveQuantity } from "./inventoryMath";
import type { MaterialRegistry } from "./MaterialRegistry";
import { fitCapacityOf, freeSlotCount, storedQuantity, totalWeightMilli } from "./stackPlanning";
import type {
  CanRetrieveResult,
  CanStoreResult,
  InventoryData,
  ItemQuantity,
} from "./inventoryTypes";

/**
 * Reads the live `Inventory` data of an entity and throws when it has none.
 *
 * @param entity - Entity to read.
 * @returns The live inventory data.
 */
export function requireInventory(entity: Entity): InventoryData {
  const data = getComponent(entity, inventoryComponent);
  if (data === undefined) {
    throw new InventoryError(
      InventoryErrorKind.NoInventory,
      `entity ${entity.id} has no Inventory component`,
    );
  }
  return data;
}

/**
 * Number of unoccupied general slots (spec 005 US3 AC4).
 *
 * @param entity - Entity with an inventory.
 * @returns Free slots, never negative.
 */
export function availableSlots(entity: Entity): number {
  return freeSlotCount(requireInventory(entity));
}

/**
 * Total weight of general storage plus equipped items in milli-units.
 *
 * @param materials - Material registry.
 * @param entity - Entity with an inventory.
 * @returns Exact current weight.
 */
export function currentWeight(materials: MaterialRegistry, entity: Entity): number {
  return totalWeightMilli(materials, requireInventory(entity));
}

/**
 * Remaining weight capacity in milli-units (spec 005 FR-018).
 *
 * @param materials - Material registry.
 * @param entity - Entity with an inventory.
 * @returns Remaining capacity (0 when over the limit), or null when the inventory has no weight limit.
 */
export function availableWeight(materials: MaterialRegistry, entity: Entity): number | null {
  const data = requireInventory(entity);
  if (data.weightLimitMilli === null) {
    return null;
  }
  return Math.max(0, data.weightLimitMilli - totalWeightMilli(materials, data));
}

/**
 * Total quantity of a material across all general stacks and equipment slots.
 *
 * @param entity - Entity with an inventory.
 * @param materialId - Material id.
 * @returns Combined quantity.
 */
export function getTotal(entity: Entity, materialId: string): number {
  const data = requireInventory(entity);
  const equipped = data.equipment.filter((slot) => slot.materialId === materialId).length;
  return storedQuantity(data, materialId) + equipped;
}

/**
 * Lists every held material (general storage plus equipment) with combined totals.
 *
 * @param entity - Entity with an inventory.
 * @returns Totals sorted ascending by material id.
 */
export function getAllItems(entity: Entity): ItemQuantity[] {
  const data = requireInventory(entity);
  const totals = new Map<string, number>();
  for (const slot of data.slots) {
    totals.set(slot.materialId, (totals.get(slot.materialId) ?? 0) + slot.quantity);
  }
  for (const equipped of data.equipment) {
    if (equipped.materialId !== null) {
      totals.set(equipped.materialId, (totals.get(equipped.materialId) ?? 0) + 1);
    }
  }
  return [...totals.keys()]
    .sort()
    .map((materialId) => ({ materialId, quantity: totals.get(materialId) ?? 0 }));
}

/**
 * Asks whether a quantity would fit and how much would fit at most, honouring free slots,
 * partial stacks and the weight limit (DECISIONS D-07 corrected arithmetic: wood 8/50 with 2
 * free slots fits 42 + 2 * 50 = 142). Never modifies the inventory.
 *
 * @param materials - Material registry.
 * @param entity - Entity with an inventory.
 * @param materialId - Material to store.
 * @param quantity - Positive quantity.
 * @returns `{ fits, maxFittable }`.
 */
export function canStore(
  materials: MaterialRegistry,
  entity: Entity,
  materialId: string,
  quantity: number,
): CanStoreResult {
  assertPositiveQuantity(quantity);
  const capacity = fitCapacityOf(materials, requireInventory(entity), materialId);
  return { fits: quantity <= capacity.maxFittable, maxFittable: capacity.maxFittable };
}

/**
 * Asks whether a quantity can be retrieved from general storage (equipped items cannot).
 * Never modifies the inventory.
 *
 * @param materials - Material registry (the material id must be registered).
 * @param entity - Entity with an inventory.
 * @param materialId - Material to retrieve.
 * @param quantity - Positive quantity.
 * @returns `{ available, quantity }` where `quantity` is the held amount.
 */
export function canRetrieve(
  materials: MaterialRegistry,
  entity: Entity,
  materialId: string,
  quantity: number,
): CanRetrieveResult {
  assertPositiveQuantity(quantity);
  materials.require(materialId);
  const held = storedQuantity(requireInventory(entity), materialId);
  return { available: held >= quantity, quantity: held };
}
