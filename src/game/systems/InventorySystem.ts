/**
 * Inventory system: item storage, stacking, capacity, and transfers.
 */

import type { EntityManager, EntityId } from "../engine/EntityManager";
import { getComponent, addComponent } from "../engine/EntityManager";

export type InventoryItem = {
  materialId: string;
  quantity: number;
};

export type InventoryComponent = {
  items: InventoryItem[];
  capacity: number;
  currentWeight: number;
};

/**
 * Creates a new empty inventory component.
 */
export function createInventory(capacity: number): InventoryComponent {
  return { items: [], capacity, currentWeight: 0 };
}

/**
 * Adds items to an entity's inventory. Returns the quantity actually added.
 */
export function addItem(
  manager: EntityManager,
  entityId: EntityId,
  materialId: string,
  quantity: number,
): number {
  const inventory = getComponent(manager, entityId, "inventory") as InventoryComponent | undefined;
  if (!inventory) return 0;

  const available = inventory.capacity - inventory.currentWeight;
  const toAdd = Math.min(quantity, available);
  if (toAdd <= 0) return 0;

  const existing = inventory.items.find((item) => item.materialId === materialId);
  if (existing) {
    existing.quantity += toAdd;
  } else {
    inventory.items.push({ materialId, quantity: toAdd });
  }
  inventory.currentWeight += toAdd;
  return toAdd;
}

/**
 * Removes items from an entity's inventory. Returns the quantity actually removed.
 */
export function removeItem(
  manager: EntityManager,
  entityId: EntityId,
  materialId: string,
  quantity: number,
): number {
  const inventory = getComponent(manager, entityId, "inventory") as InventoryComponent | undefined;
  if (!inventory) return 0;

  const existing = inventory.items.find((item) => item.materialId === materialId);
  if (!existing) return 0;

  const toRemove = Math.min(quantity, existing.quantity);
  existing.quantity -= toRemove;
  inventory.currentWeight -= toRemove;

  if (existing.quantity <= 0) {
    inventory.items = inventory.items.filter((item) => item.materialId !== materialId);
  }
  return toRemove;
}

/**
 * Transfers items between two entities' inventories.
 */
export function transferItem(
  manager: EntityManager,
  fromEntity: EntityId,
  toEntity: EntityId,
  materialId: string,
  quantity: number,
): number {
  const removed = removeItem(manager, fromEntity, materialId, quantity);
  if (removed === 0) return 0;
  const added = addItem(manager, toEntity, materialId, removed);
  // Return unused back to source
  if (added < removed) {
    addItem(manager, fromEntity, materialId, removed - added);
  }
  return added;
}

/**
 * Gets the quantity of a specific material in an entity's inventory.
 */
export function getItemQuantity(
  manager: EntityManager,
  entityId: EntityId,
  materialId: string,
): number {
  const inventory = getComponent(manager, entityId, "inventory") as InventoryComponent | undefined;
  if (!inventory) return 0;
  return inventory.items.find((item) => item.materialId === materialId)?.quantity ?? 0;
}

/**
 * Checks if an entity's inventory has enough of a material.
 */
export function hasEnough(
  manager: EntityManager,
  entityId: EntityId,
  materialId: string,
  quantity: number,
): boolean {
  return getItemQuantity(manager, entityId, materialId) >= quantity;
}
