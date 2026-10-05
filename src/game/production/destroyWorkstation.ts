import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { store } from "../inventory/inventoryOperations";
import { getAllItems } from "../inventory/inventoryQueries";
import { findPosting } from "../jobs/jobBoards";
import { cancelPosting } from "../jobs/jobPostings";
import { positionComponent } from "../map/positionComponent";
import { loosePilePrototypeId } from "../storage/storageTypes";
import { cancelCraftTask, interruptCraft } from "./craftCleanup";
import { cancelOrderAt } from "./productionOrders";
import { productionOrdersComponent } from "./productionOrdersComponent";
import { OrderStatus } from "./productionTypes";

/**
 * Reason of the interruption and posting cancel when the workstation entity is deleted.
 */
export const workstationDestroyedReason = "workstation_destroyed";

/**
 * What happens to production when a workstation entity is deleted (DECISIONS D-10, run from a
 * before-delete hook): its unfinished orders are cancelled, the running craft is interrupted
 * (locks released, the crafter's task stopped, its posting cancelled) and the contents of the
 * work inventory are dropped as a `loose_pile` on the workstation's cell, where the haul poster
 * takes them to storage. Nothing is lost and nothing is duplicated.
 *
 * @param engine - The engine.
 * @param entity - The entity about to be deleted; nothing happens when it is no workstation.
 * @returns The id of the loose pile, or null when nothing was dropped.
 */
export function destroyWorkstation(engine: GameEngine, entity: Entity): number | null {
  const data = getComponent(entity, productionOrdersComponent);
  if (data === undefined) {
    return null;
  }
  for (const order of [...data.orders]) {
    if (order.status === OrderStatus.Active || order.status === OrderStatus.Paused) {
      cancelOrderAt(engine, { station: entity, data, order });
    }
  }
  const craft = data.craft;
  if (craft !== null) {
    interruptCraft(engine, entity, data, workstationDestroyedReason);
    cancelCraftTask(engine, craft.crafterId, craft.postingId);
    if (findPosting(engine, craft.postingId) !== null) {
      cancelPosting(engine, craft.postingId, workstationDestroyedReason, engine.time.tickCount);
    }
  }
  const inventory = getComponent(entity, inventoryComponent);
  const place = getComponent(entity, positionComponent);
  const items = inventory === undefined ? [] : getAllItems(entity);
  if (items.length === 0 || place === undefined) {
    return null;
  }
  const pile = engine.store.spawn(loosePilePrototypeId, {
    Position: { mapId: place.mapId, cellIndex: place.cellIndex },
  });
  engine.maps.placeEntity(pile.id, place.mapId, place.cellIndex);
  for (const item of items) {
    store(
      { materials: engine.materials, actor: null, bus: engine.bus },
      pile,
      item.materialId,
      item.quantity,
    );
  }
  return pile.id;
}
