import { maxMeterMilli } from "../ai/aiTypes";
import type { PrototypeDefinition } from "../ecs/PrototypeRegistry";
import type { AnimalPrototypeContent } from "./schemas/characterSchemas";

/**
 * Inventory slots of an animal: room for its periodic products (wool, milk, eggs).
 */
export const animalInventorySlots = 4;

/**
 * Builds the entity prototype of an animal record (spec 022 US11): `Position`, an empty
 * `Inventory` for the periodic products, `TaskQueue`, `AiState` pointing at the animal's behavior
 * tree, `Health` (full) and `Animal`. It has no `Citizen`, `Identity`, `Needs` or `Mood`, so the
 * settlement systems never count it as a settler (DECISIONS D-140).
 *
 * @param animal - Validated animal record.
 * @returns A prototype ready for `PrototypeRegistry.register`.
 */
export function animalPrototypeDefinition(animal: AnimalPrototypeContent): PrototypeDefinition {
  return {
    id: animal.id,
    components: {
      Position: {},
      Inventory: { slotCount: animalInventorySlots, slots: [] },
      TaskQueue: {},
      AiState: { treeId: animal.behaviorTreeId },
      Health: { valueMilli: maxMeterMilli },
      Animal: {
        prototypeId: animal.id,
        kind: animal.kind,
        hungerMilli: 0,
        nextProductTick: 0,
        attackReadyTick: 0,
      },
    },
  };
}
