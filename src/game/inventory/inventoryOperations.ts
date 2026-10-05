import type { Entity } from "../ecs/Entity";
import {
  DestinationFullError,
  EquipmentSlotIncompatibleError,
  InsufficientItemsError,
  InvalidTransferError,
  InventoryError,
  InventoryErrorKind,
  InventoryFullError,
  WeightLimitExceededError,
} from "./InventoryError";
import { assertPositiveQuantity } from "./inventoryMath";
import { assertOperationAllowed } from "./inventoryPermissions";
import { requireInventory } from "./inventoryQueries";
import { InventoryOperation } from "./inventoryTypes";
import type {
  EquipmentSlot,
  Freshness,
  InventoryContext,
  InventoryData,
  ItemQuantity,
  StoreUpToResult,
} from "./inventoryTypes";
import {
  addToSlots,
  cloneSlots,
  fitCapacityOf,
  freshFreshness,
  slotFitOf,
  storedQuantity,
  takeFromSlots,
} from "./stackPlanning";
import type { FitCapacity } from "./stackPlanning";

function throwNoRoom(
  entity: Entity,
  materialId: string,
  quantity: number,
  capacity: FitCapacity,
  asDestination: boolean,
): never {
  const message = `cannot store ${quantity} ${materialId} in entity ${entity.id}: ${capacity.maxFittable} fit`;
  if (capacity.slotFit < quantity) {
    throw asDestination ? new DestinationFullError(message) : new InventoryFullError(message);
  }
  throw new WeightLimitExceededError(message);
}

function emit(
  context: InventoryContext,
  name: string,
  payload: { [key: string]: string | number },
): void {
  context.bus?.emit(name, payload);
}

function findEquipmentSlot(entity: Entity, data: InventoryData, slotName: string): EquipmentSlot {
  const slot = data.equipment.find((candidate) => candidate.name === slotName);
  if (!slot) {
    throw new InventoryError(
      InventoryErrorKind.UnknownEquipmentSlot,
      `entity ${entity.id} has no equipment slot "${slotName}"`,
    );
  }
  return slot;
}

function storeChecked(
  context: InventoryContext,
  entity: Entity,
  materialId: string,
  quantity: number,
  freshness: Freshness | null | undefined,
): void {
  assertPositiveQuantity(quantity);
  const material = context.materials.require(materialId);
  const data = requireInventory(entity);
  assertOperationAllowed(context, entity, data, InventoryOperation.Store);
  const capacity = fitCapacityOf(context.materials, data, materialId);
  if (quantity > capacity.maxFittable) {
    throwNoRoom(entity, materialId, quantity, capacity, false);
  }
  const slots = cloneSlots(data.slots);
  const merged = addToSlots(slots, material, quantity, freshness ?? freshFreshness(material));
  data.slots = slots;
  emit(context, "inventory.item.stored", { entityId: entity.id, materialId, quantity });
  if (merged > 0) {
    emit(context, "inventory.item.stack.merged", {
      entityId: entity.id,
      materialId,
      quantity: merged,
    });
  }
}

/**
 * Stores the whole quantity or nothing (spec 005 FR-006/008): existing partial stacks of the
 * material fill first, then new slots; perishable stacks merge with a weighted remaining time.
 * Emits `inventory.item.stored` (and `inventory.item.stack.merged` when a perishable merge
 * happened) into the bus queue.
 *
 * @param context - Material registry, actor and bus.
 * @param entity - Entity with an inventory.
 * @param materialId - Registered material id.
 * @param quantity - Positive integer quantity.
 */
export function store(
  context: InventoryContext,
  entity: Entity,
  materialId: string,
  quantity: number,
): void {
  storeChecked(context, entity, materialId, quantity, undefined);
}

/**
 * Stores as much of the quantity as fits and reports the rest (spec 005 FR-015); never fails on
 * capacity. Permission, quantity and material checks still throw.
 *
 * @param context - Material registry, actor and bus.
 * @param entity - Entity with an inventory.
 * @param materialId - Registered material id.
 * @param quantity - Positive integer quantity.
 * @returns `{ stored, remainder }` with `stored + remainder === quantity`.
 */
export function storeUpTo(
  context: InventoryContext,
  entity: Entity,
  materialId: string,
  quantity: number,
): StoreUpToResult {
  assertPositiveQuantity(quantity);
  context.materials.require(materialId);
  const data = requireInventory(entity);
  assertOperationAllowed(context, entity, data, InventoryOperation.Store);
  const stored = Math.min(quantity, fitCapacityOf(context.materials, data, materialId).maxFittable);
  if (stored > 0) {
    storeChecked(context, entity, materialId, stored, undefined);
  }
  return { stored, remainder: quantity - stored };
}

/**
 * Removes items from general storage (spec 005 FR-007/009), soonest-to-expire then smallest
 * stacks first; emptied slots are reclaimed. Emits `inventory.item.retrieved`.
 *
 * @param context - Material registry, actor and bus.
 * @param entity - Entity with an inventory.
 * @param materialId - Registered material id.
 * @param quantity - Positive integer quantity.
 * @returns The removed items (one entry for the material).
 */
export function retrieve(
  context: InventoryContext,
  entity: Entity,
  materialId: string,
  quantity: number,
): ItemQuantity[] {
  assertPositiveQuantity(quantity);
  context.materials.require(materialId);
  const data = requireInventory(entity);
  assertOperationAllowed(context, entity, data, InventoryOperation.Retrieve);
  const held = storedQuantity(data, materialId);
  if (held < quantity) {
    throw new InsufficientItemsError(
      `entity ${entity.id} holds ${held} ${materialId}, ${quantity} requested`,
    );
  }
  const slots = cloneSlots(data.slots);
  takeFromSlots(slots, materialId, quantity);
  data.slots = slots;
  emit(context, "inventory.item.retrieved", { entityId: entity.id, materialId, quantity });
  return [{ materialId, quantity }];
}

/**
 * Moves items between two inventories atomically (spec 005 FR-014): the actor needs `Retrieve`
 * on the source and `Store` on the destination, the source must hold the quantity, the
 * destination must have room. All checks run before anything is written and both slot lists are
 * replaced together, so a failure leaves both inventories unchanged. Perishable items keep their
 * remaining time. Emits only `inventory.item.transferred`.
 *
 * @param context - Material registry, actor and bus.
 * @param source - Entity giving the items.
 * @param destination - Entity receiving the items.
 * @param materialId - Registered material id.
 * @param quantity - Positive integer quantity.
 */
export function transfer(
  context: InventoryContext,
  source: Entity,
  destination: Entity,
  materialId: string,
  quantity: number,
): void {
  assertPositiveQuantity(quantity);
  const material = context.materials.require(materialId);
  if (source.id === destination.id) {
    throw new InvalidTransferError(`entity ${source.id} cannot transfer to itself`);
  }
  const sourceData = requireInventory(source);
  const destinationData = requireInventory(destination);
  assertOperationAllowed(context, source, sourceData, InventoryOperation.Retrieve);
  assertOperationAllowed(context, destination, destinationData, InventoryOperation.Store);
  const held = storedQuantity(sourceData, materialId);
  if (held < quantity) {
    throw new InsufficientItemsError(
      `entity ${source.id} holds ${held} ${materialId}, ${quantity} requested`,
    );
  }
  const capacity = fitCapacityOf(context.materials, destinationData, materialId);
  if (quantity > capacity.maxFittable) {
    throwNoRoom(destination, materialId, quantity, capacity, true);
  }
  const sourceSlots = cloneSlots(sourceData.slots);
  const destinationSlots = cloneSlots(destinationData.slots);
  for (const portion of takeFromSlots(sourceSlots, materialId, quantity)) {
    addToSlots(destinationSlots, material, portion.quantity, portion.freshness);
  }
  sourceData.slots = sourceSlots;
  destinationData.slots = destinationSlots;
  emit(context, "inventory.item.transferred", {
    sourceId: source.id,
    destinationId: destination.id,
    materialId,
    quantity,
  });
}

/**
 * Moves one unit from general storage into a named equipment slot (spec 005 FR-024). The slot's
 * restriction category must be one of the material categories. An occupied slot swaps: the old
 * item returns to general storage (needs room, counted after the new item left). Equipped items
 * lose their perishable timer and restart fresh when unequipped. Emits
 * `inventory.item.unequipped` (swap) then `inventory.item.equipped`.
 *
 * @param context - Material registry, actor and bus.
 * @param entity - Entity with an inventory and equipment slots.
 * @param materialId - Registered material id.
 * @param slotName - Equipment slot name.
 */
export function equip(
  context: InventoryContext,
  entity: Entity,
  materialId: string,
  slotName: string,
): void {
  const material = context.materials.require(materialId);
  const data = requireInventory(entity);
  assertOperationAllowed(context, entity, data, InventoryOperation.Equip);
  const slot = findEquipmentSlot(entity, data, slotName);
  if (!material.categories.includes(slot.restrictionCategory)) {
    throw new EquipmentSlotIncompatibleError(
      `${materialId} cannot be equipped in slot "${slotName}" (needs category ${slot.restrictionCategory})`,
    );
  }
  if (storedQuantity(data, materialId) < 1) {
    throw new InsufficientItemsError(`entity ${entity.id} holds no ${materialId} to equip`);
  }
  const slots = cloneSlots(data.slots);
  takeFromSlots(slots, materialId, 1);
  const previousId = slot.materialId;
  if (previousId !== null) {
    const previous = context.materials.require(previousId);
    if (slotFitOf(previous, { ...data, slots }) < 1) {
      throw new InventoryFullError(
        `entity ${entity.id} has no room to return ${previousId} from slot "${slotName}"`,
      );
    }
    addToSlots(slots, previous, 1, freshFreshness(previous));
  }
  data.slots = slots;
  slot.materialId = materialId;
  if (previousId !== null) {
    emit(context, "inventory.item.unequipped", {
      entityId: entity.id,
      materialId: previousId,
      slotName,
    });
  }
  emit(context, "inventory.item.equipped", { entityId: entity.id, materialId, slotName });
}

/**
 * Moves the item of an equipment slot back into general storage (spec 005 FR-024). Rejects with
 * `InventoryFullError` when there is no room; the item stays equipped. Emits
 * `inventory.item.unequipped`.
 *
 * @param context - Material registry, actor and bus.
 * @param entity - Entity with an inventory and equipment slots.
 * @param slotName - Equipment slot name.
 */
export function unequip(context: InventoryContext, entity: Entity, slotName: string): void {
  const data = requireInventory(entity);
  assertOperationAllowed(context, entity, data, InventoryOperation.Equip);
  const slot = findEquipmentSlot(entity, data, slotName);
  if (slot.materialId === null) {
    throw new InventoryError(
      InventoryErrorKind.EmptyEquipmentSlot,
      `equipment slot "${slotName}" of entity ${entity.id} is empty`,
    );
  }
  const materialId = slot.materialId;
  const material = context.materials.require(materialId);
  if (slotFitOf(material, data) < 1) {
    throw new InventoryFullError(
      `entity ${entity.id} has no room to unequip ${materialId} from slot "${slotName}"`,
    );
  }
  const slots = cloneSlots(data.slots);
  addToSlots(slots, material, 1, freshFreshness(material));
  data.slots = slots;
  slot.materialId = null;
  emit(context, "inventory.item.unequipped", { entityId: entity.id, materialId, slotName });
}
