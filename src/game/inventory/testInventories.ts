import type { Entity } from "../ecs/Entity";
import { EventBus } from "../engine/EventBus";
import type { GameEvent } from "../engine/EventBus";
import { inventoryComponent } from "./inventoryComponent";
import type { InventoryContext, InventoryData } from "./inventoryTypes";
import { MaterialRegistry } from "./MaterialRegistry";

/**
 * Builds the small material set the inventory tests share: `wood` (limit 50, weight 1),
 * `cheese` (limit 20, perishable 576 ticks), `stone` (limit 10, weight 5), `feather` (limit 100,
 * weight 0.1), `silver_penny` (limit 1000), `sword`/`dagger` (weapons, limit 1) and `bread`.
 *
 * @returns A filled registry whose currency is `silver_penny`.
 */
export function createTestMaterials(): MaterialRegistry {
  const materials = new MaterialRegistry();
  materials.registerAll([
    { id: "wood", name: "Wood", categories: ["building"], stackLimit: 50, weightMilli: 1000 },
    {
      id: "cheese",
      name: "Cheese",
      categories: ["food"],
      stackLimit: 20,
      weightMilli: 500,
      perishabilityTicks: 576,
    },
    { id: "stone", name: "Stone", categories: ["building"], stackLimit: 10, weightMilli: 5000 },
    { id: "feather", name: "Feather", categories: [], stackLimit: 100, weightMilli: 100 },
    {
      id: "silver_penny",
      name: "Silver penny",
      categories: ["currency"],
      stackLimit: 1000,
      weightMilli: 0,
      valueMilli: 1000,
    },
    { id: "sword", name: "Sword", categories: ["weapon"], stackLimit: 1, weightMilli: 3000 },
    { id: "dagger", name: "Dagger", categories: ["weapon"], stackLimit: 1, weightMilli: 1000 },
    { id: "bread", name: "Bread", categories: ["food"], stackLimit: 10, weightMilli: 400 },
  ]);
  return materials;
}

/**
 * Creates an entity carrying an `Inventory` component with the defaults overridden.
 *
 * @param id - Entity id.
 * @param overrides - Inventory fields to override (default: 8 empty slots, no limits).
 * @returns A plain entity.
 */
export function createInventoryEntity(id: number, overrides: Partial<InventoryData> = {}): Entity {
  return {
    id,
    prototype: "test_holder",
    components: { Inventory: { ...inventoryComponent.defaults(), ...overrides } },
  };
}

/**
 * Creates a system-actor context with a bus that records every emitted event.
 *
 * @param materials - Material registry to use.
 * @returns The context and the captured events (filled when the bus queue is processed).
 */
export function createTestContext(materials: MaterialRegistry = createTestMaterials()): {
  context: InventoryContext;
  bus: EventBus;
  events: GameEvent[];
} {
  const bus = new EventBus();
  const events: GameEvent[] = [];
  bus.subscribe("**", (_payload, event) => {
    events.push(event);
  });
  return { context: { materials, actor: null, bus }, bus, events };
}
