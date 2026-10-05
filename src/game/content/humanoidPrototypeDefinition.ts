import type { PrototypeDefinition } from "../ecs/PrototypeRegistry";
import type { JsonValue } from "../engine/EventBus";
import type { MaterialRegistry } from "../inventory/MaterialRegistry";
import { initialNeedValues } from "../ai/needs/needAccess";
import { maxMeterMilli, neutralMoodMilli } from "../ai/aiTypes";
import type { HumanoidPrototypeContent, NeedContent } from "./schemas/characterSchemas";

/**
 * What the humanoid prototype needs from the need registry: the records and the start level.
 */
export type HumanoidNeedsContent = {
  needs: readonly NeedContent[];
  /**
   * Level every need starts at (`needStartValue`, milli-percent).
   */
  startValueMilli: number;
};

/**
 * Builds the entity prototype of a humanoid record: `Position`, `Inventory` (with the starting
 * equipment as stacked items, perishables fresh), `TaskQueue`, `AiState` pointing at the
 * prototype's behavior tree, `Skills` (the starting skills, milli-percent) and `Traits` (the
 * authored `defaultTraitIds`; `initializeCharacter` of `../skills` draws them when none are
 * authored). `Citizen` (no factions yet) and `Identity` (name list; the name itself is drawn by
 * `assignIdentity` at spawn). The AI components: `Needs` (every need of the pack at the start
 * level), `Mood` (neutral) and `Health` (full), plus an empty `Relationships`.
 *
 * @param humanoid - Validated humanoid record.
 * @param materials - Registry that supplies stack limits and perishability of the equipment.
 * @param needs - Need records and start level for the `Needs` component.
 * @returns A prototype ready for `PrototypeRegistry.register`.
 */
export function humanoidPrototypeDefinition(
  humanoid: HumanoidPrototypeContent,
  materials: MaterialRegistry,
  needs: HumanoidNeedsContent,
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
      Citizen: {},
      Identity: { nameListId: humanoid.nameListId },
      Needs: { values: initialNeedValues(needs.needs, needs.startValueMilli) },
      Mood: { valueMilli: neutralMoodMilli, influences: [] },
      Health: { valueMilli: maxMeterMilli },
      Relationships: { entries: [] },
    },
  };
}
