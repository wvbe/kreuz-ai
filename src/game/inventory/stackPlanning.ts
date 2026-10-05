import { floorDivide } from "./inventoryMath";
import type { MaterialDefinition, MaterialRegistry } from "./MaterialRegistry";
import type { Freshness, InventoryData, InventorySlot, StackPortion } from "./inventoryTypes";

/**
 * Normal decay rate of a stack in permille.
 */
export const normalDecayRateMilli = 1000;

/**
 * How much of a material fits into an inventory right now.
 */
export type FitCapacity = {
  /**
   * Quantity limited by free slots and partial stacks only.
   */
  slotFit: number;
  /**
   * Quantity limited by the weight limit, or null when weight does not constrain this material.
   */
  weightFit: number | null;
  /**
   * The smaller of both.
   */
  maxFittable: number;
};

/**
 * Copies a slot list so a mutation can be planned and committed (or dropped) as a whole.
 *
 * @param slots - Slots to copy.
 * @returns Independent copies in the same order.
 */
export function cloneSlots(slots: readonly InventorySlot[]): InventorySlot[] {
  return slots.map((slot) => ({ ...slot }));
}

/**
 * The freshness a new unit of a material starts with: full perishability time at the normal
 * decay rate, or null for non-perishable materials.
 *
 * @param material - Material definition.
 * @returns Fresh state or null.
 */
export function freshFreshness(material: MaterialDefinition): Freshness | null {
  return material.perishabilityTicks === undefined
    ? null
    : { remainingMilli: material.perishabilityTicks * 1000, decayRateMilli: normalDecayRateMilli };
}

/**
 * Number of unoccupied slots (never negative, even when capacity was reduced below contents).
 *
 * @param data - Inventory data.
 * @returns Free slot count.
 */
export function freeSlotCount(data: InventoryData): number {
  return Math.max(0, data.slotCount - data.slots.length);
}

/**
 * Total weight of general storage plus equipped items, in milli-units (spec 005 SC-011).
 *
 * @param materials - Material registry.
 * @param data - Inventory data.
 * @returns Exact weight.
 */
export function totalWeightMilli(materials: MaterialRegistry, data: InventoryData): number {
  let total = 0;
  for (const slot of data.slots) {
    total += materials.require(slot.materialId).weightMilli * slot.quantity;
  }
  for (const equipped of data.equipment) {
    if (equipped.materialId !== null) {
      total += materials.require(equipped.materialId).weightMilli;
    }
  }
  return total;
}

/**
 * Quantity of a material that fits by slots alone: room in partial stacks plus free slots.
 *
 * @param material - Material definition.
 * @param data - Inventory data.
 * @returns Quantity limited by slots.
 */
export function slotFitOf(material: MaterialDefinition, data: InventoryData): number {
  let fit = freeSlotCount(data) * material.stackLimit;
  for (const slot of data.slots) {
    if (slot.materialId === material.id) {
      fit += Math.max(0, material.stackLimit - slot.quantity);
    }
  }
  return fit;
}

/**
 * Computes how much of a material fits by slots and by weight.
 *
 * @param materials - Material registry.
 * @param data - Inventory data.
 * @param materialId - Material to fit.
 * @returns Slot fit, weight fit and the maximum.
 */
export function fitCapacityOf(
  materials: MaterialRegistry,
  data: InventoryData,
  materialId: string,
): FitCapacity {
  const material = materials.require(materialId);
  const slotFit = slotFitOf(material, data);
  if (data.weightLimitMilli === null || material.weightMilli === 0) {
    return { slotFit, weightFit: null, maxFittable: slotFit };
  }
  const free = Math.max(0, data.weightLimitMilli - totalWeightMilli(materials, data));
  const weightFit = floorDivide(free, material.weightMilli);
  return { slotFit, weightFit, maxFittable: Math.min(slotFit, weightFit) };
}

/**
 * Adds items to a (copied) slot list in place: existing partial stacks of the material first in
 * slot order, then new slots. Perishable stacks merge with the quantity-weighted floor of their
 * remaining time (spec 005 FR-020a). The caller has checked capacity.
 *
 * @param slots - Mutable copy of the slots.
 * @param material - Material being added.
 * @param quantity - Positive quantity.
 * @param freshness - Freshness of the incoming items, null for non-perishables.
 * @returns How many items merged into already existing stacks of a perishable material.
 */
export function addToSlots(
  slots: InventorySlot[],
  material: MaterialDefinition,
  quantity: number,
  freshness: Freshness | null,
): number {
  let left = quantity;
  let merged = 0;
  for (const slot of slots) {
    if (left === 0) {
      break;
    }
    if (slot.materialId !== material.id || slot.quantity >= material.stackLimit) {
      continue;
    }
    const added = Math.min(material.stackLimit - slot.quantity, left);
    if (slot.remainingMilli !== null && freshness !== null) {
      slot.remainingMilli = floorDivide(
        slot.quantity * slot.remainingMilli + added * freshness.remainingMilli,
        slot.quantity + added,
      );
      merged += added;
    }
    slot.quantity += added;
    left -= added;
  }
  while (left > 0) {
    const added = Math.min(material.stackLimit, left);
    slots.push({
      materialId: material.id,
      quantity: added,
      remainingMilli: freshness === null ? null : freshness.remainingMilli,
      decayRateMilli: freshness === null ? null : freshness.decayRateMilli,
    });
    left -= added;
  }
  return merged;
}

/**
 * Removes items from a (copied) slot list in place and reclaims emptied slots. Stacks are
 * drained soonest-to-expire first, then smallest first (less fragmentation), then lowest slot.
 * The caller has checked availability.
 *
 * @param slots - Mutable copy of the slots.
 * @param materialId - Material to take.
 * @param quantity - Positive quantity, at most the held amount.
 * @returns The portions taken, in the order they were taken.
 */
export function takeFromSlots(
  slots: InventorySlot[],
  materialId: string,
  quantity: number,
): StackPortion[] {
  const candidates = slots
    .map((slot, index) => ({ slot, index }))
    .filter((entry) => entry.slot.materialId === materialId)
    .sort(
      (left, right) =>
        (left.slot.remainingMilli ?? 0) - (right.slot.remainingMilli ?? 0) ||
        left.slot.quantity - right.slot.quantity ||
        left.index - right.index,
    );
  const portions: StackPortion[] = [];
  let left = quantity;
  for (const { slot } of candidates) {
    if (left === 0) {
      break;
    }
    const taken = Math.min(slot.quantity, left);
    portions.push({
      materialId,
      quantity: taken,
      freshness:
        slot.remainingMilli === null || slot.decayRateMilli === null
          ? null
          : { remainingMilli: slot.remainingMilli, decayRateMilli: slot.decayRateMilli },
    });
    slot.quantity -= taken;
    left -= taken;
  }
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index]?.quantity === 0) {
      slots.splice(index, 1);
    }
  }
  return portions;
}

/**
 * Sums the general-storage quantity of a material across all stacks.
 *
 * @param data - Inventory data.
 * @param materialId - Material id.
 * @returns Held quantity (equipment excluded).
 */
export function storedQuantity(data: InventoryData, materialId: string): number {
  let total = 0;
  for (const slot of data.slots) {
    if (slot.materialId === materialId) {
      total += slot.quantity;
    }
  }
  return total;
}
