import type { PrototypeDefinition } from "../ecs/PrototypeRegistry";
import type { JsonValue } from "../engine/EventBus";
import type { MaterialRegistry } from "../inventory/MaterialRegistry";
import type { HumanoidPrototypeContent } from "./schemas/characterSchemas";

/**
 * Builds the entity prototype of a humanoid record: `Position`, `Inventory` (with the starting
 * equipment as stacked items, perishables fresh), `TaskQueue` and `AiState` pointing at the
 * prototype's behavior tree. Skills, needs, factions and traits are kept as content data and
 * attached by their own systems (tasks 2.3 to 2.5), not as components here.
 *
 * @param humanoid - Validated humanoid record.
 * @param materials - Registry that supplies stack limits and perishability of the equipment.
 * @returns A prototype ready for `PrototypeRegistry.register`.
 */
export function humanoidPrototypeDefinition(
  humanoid: HumanoidPrototypeContent,
  materials: MaterialRegistry,
): PrototypeDefinition {
  const slots: JsonValue[] = [];
  for (const item of humanoid.equipment) {
    const material = materials.require(item.materialId);
    let remaining = item.quantity;
    while (remaining > 0) {
      const quantity = Math.min(remaining, material.stackLimit);
      remaining -= quantity;
      const perishable = material.perishabilityTicks !== undefined;
      slots.push({
        materialId: item.materialId,
        quantity,
        remainingMilli: perishable ? (material.perishabilityTicks ?? 0) * 1000 : null,
        decayRateMilli: perishable ? 1000 : null,
      });
    }
  }
  return {
    id: humanoid.id,
    components: {
      Position: {},
      Inventory: { slotCount: humanoid.inventorySlots, slots },
      TaskQueue: {},
      AiState: { treeId: humanoid.behaviorTreeId },
    },
  };
}
