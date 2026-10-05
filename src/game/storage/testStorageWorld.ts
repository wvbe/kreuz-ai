import type { Entity } from "../ecs/Entity";
import { hasComponent } from "../ecs/Entity";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { store } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import { createJobWorld } from "../jobs/testJobWorld";
import type { JobTestWorld, JobTestWorldOptions } from "../jobs/testJobWorld";
import type { SpawnOverrides } from "../ai/testAiWorld";

/**
 * A job test world (square map, board at cell 0) plus storage helpers.
 */
export type StorageTestWorld = JobTestWorld & {
  /**
   * Spawns a `chest` (a stockpile) on a cell; `overrides` change its components, for example
   * `{ Stockpile: { priority: 80, filter: null } }` or `{ Inventory: { slotCount: 1 } }`.
   */
  chest: (cell: number, overrides?: SpawnOverrides) => Entity;
  /**
   * Spawns a `loose_pile` on a cell holding the given items.
   */
  pile: (cell: number, items: { materialId: string; quantity: number }[]) => Entity;
  /**
   * Puts items into an entity's inventory (system actor).
   */
  give: (entity: Entity, materialId: string, quantity: number) => void;
  /**
   * Total of a material over every inventory of the world (storage, citizens, everything): the
   * number the conservation tests keep constant.
   */
  count: (materialId: string) => number;
};

/**
 * Builds a {@link JobTestWorld} with `chest`, `pile` and `give` helpers for the storage tests.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createStorageWorld(options: JobTestWorldOptions = {}): StorageTestWorld {
  const world = createJobWorld(options);
  const give = (entity: Entity, materialId: string, quantity: number): void => {
    store({ materials: world.engine.materials, actor: null }, entity, materialId, quantity);
  };
  return {
    ...world,
    give,
    count: (materialId) =>
      world.engine.store
        .entities()
        .reduce(
          (sum, entity) =>
            sum + (hasComponent(entity, inventoryComponent) ? getTotal(entity, materialId) : 0),
          0,
        ),
    chest: (cell, overrides = {}) => world.spawn("chest", cell, overrides),
    pile: (cell, items) => {
      const pile = world.spawn("loose_pile", cell);
      for (const item of items) {
        give(pile, item.materialId, item.quantity);
      }
      return pile;
    },
  };
}
