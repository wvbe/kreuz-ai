import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { EventBus } from "../engine/EventBus";
import { inventoryComponent } from "./inventoryComponent";
import { combineMilli } from "./inventoryMath";
import type { DecayModifiers, InventoryData, ItemQuantity } from "./inventoryTypes";

/**
 * Modifiers that leave decay unchanged.
 */
export const neutralDecayModifiers: DecayModifiers = {
  zoneModifierMilli: 1000,
  difficultyDecayMilli: 1000,
};

/**
 * Decays the perishable stacks of one inventory by one tick (spec 005 FR-020/021, DECISIONS
 * D-07): `remaining -= combine(combine(combine(1000, zone), difficulty), stack decay rate)`.
 * A stack whose remaining time reaches zero is removed whole and `inventory.item.expired` is
 * emitted. Runs at pipeline slot 3.
 *
 * @param entity - Entity with an inventory (without one nothing happens).
 * @param bus - Receives `inventory.item.expired`.
 * @param modifiers - Zone and difficulty multipliers in permille.
 * @returns The expired stacks in slot order.
 */
export function decayInventory(
  entity: Entity,
  bus: EventBus | undefined,
  modifiers: DecayModifiers = neutralDecayModifiers,
): ItemQuantity[] {
  const data: InventoryData | undefined = getComponent(entity, inventoryComponent);
  if (data === undefined) {
    return [];
  }
  const base = combineMilli(
    combineMilli(1000, modifiers.zoneModifierMilli),
    modifiers.difficultyDecayMilli,
  );
  const expired: ItemQuantity[] = [];
  const kept = [];
  for (const slot of data.slots) {
    if (slot.remainingMilli === null || slot.decayRateMilli === null) {
      kept.push(slot);
      continue;
    }
    const remaining = slot.remainingMilli - combineMilli(base, slot.decayRateMilli);
    if (remaining <= 0) {
      expired.push({ materialId: slot.materialId, quantity: slot.quantity });
    } else {
      kept.push({ ...slot, remainingMilli: remaining });
    }
  }
  data.slots = kept;
  for (const item of expired) {
    bus?.emit("inventory.item.expired", {
      entityId: entity.id,
      materialId: item.materialId,
      quantity: item.quantity,
    });
  }
  return expired;
}

/**
 * Decays every entity with an inventory in the given (ascending id) order; the slot 3 system
 * calls this once per tick.
 *
 * @param entities - Entities in ascending id order.
 * @param bus - Receives `inventory.item.expired`.
 * @param modifiersFor - Optional per-entity modifiers (zone, difficulty); neutral by default.
 */
export function decayInventories(
  entities: readonly Entity[],
  bus: EventBus | undefined,
  modifiersFor: (entity: Entity) => DecayModifiers = () => neutralDecayModifiers,
): void {
  for (const entity of entities) {
    decayInventory(entity, bus, modifiersFor(entity));
  }
}
