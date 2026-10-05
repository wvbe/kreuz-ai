import type { Entity } from "../ecs/Entity";
import { InsufficientFundsError } from "./InventoryError";
import { assertPositiveQuantity } from "./inventoryMath";
import { assertOperationAllowed } from "./inventoryPermissions";
import { requireInventory } from "./inventoryQueries";
import { retrieve, store } from "./inventoryOperations";
import { InventoryOperation } from "./inventoryTypes";
import type { InventoryContext } from "./inventoryTypes";
import { storedQuantity } from "./stackPlanning";

/**
 * Balance in whole coins: the quantity of the currency material in general storage (DECISIONS
 * D-04: coin holdings are whole items, not milli).
 *
 * @param context - Context whose registry names the currency material.
 * @param entity - Entity with an inventory.
 * @returns Whole coins held.
 */
export function getBalance(context: InventoryContext, entity: Entity): number {
  return storedQuantity(requireInventory(entity), context.materials.currencyId);
}

/**
 * Adds coins (spec 005 FR-012). All-or-nothing like `store`: when the coins do not fit the call
 * throws and the balance is unchanged (DECISIONS D-35).
 *
 * @param context - Material registry, actor and bus.
 * @param entity - Entity receiving coins.
 * @param amount - Positive whole coins.
 */
export function credit(context: InventoryContext, entity: Entity, amount: number): void {
  store(context, entity, context.materials.currencyId, amount);
}

/**
 * Removes coins (spec 005 FR-012/013). Throws `InsufficientFundsError` when the balance is too
 * low; the balance never goes negative.
 *
 * @param context - Material registry, actor and bus.
 * @param entity - Entity paying coins.
 * @param amount - Positive whole coins.
 */
export function debit(context: InventoryContext, entity: Entity, amount: number): void {
  assertPositiveQuantity(amount);
  const data = requireInventory(entity);
  assertOperationAllowed(context, entity, data, InventoryOperation.Retrieve);
  const balance = getBalance(context, entity);
  if (balance < amount) {
    throw new InsufficientFundsError(`entity ${entity.id} has ${balance} coins, ${amount} needed`);
  }
  retrieve(context, entity, context.materials.currencyId, amount);
}
