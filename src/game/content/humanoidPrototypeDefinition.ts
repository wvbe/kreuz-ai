import type { PrototypeDefinition } from "../ecs/PrototypeRegistry";
import type { JsonValue } from "../engine/EventBus";
import type { MaterialRegistry } from "../inventory/MaterialRegistry";
import type { HumanoidPrototypeContent } from "./schemas/characterSchemas";

/**
 * Builds the entity prototype of a humanoid record: `Position`, `Inventory` (with the starting
 * equipment as stacked items, perishables fresh), `TaskQueue`, `AiState` pointing at the
 * prototype's behavior tree, `Skills` (the starting skills, milli-percent) and `Traits` (the
 * authored `defaultTraitIds`; `initializeCharacter` of `../skills` draws them when none are
 * authored). Needs and factions stay content data until tasks 2.4 and 2.5 add their components.
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
      Skills: { values: { ...humanoid.startingSkills } },
      Traits: { ids: [...humanoid.defaultTraitIds].sort() },
    },
  };
}
