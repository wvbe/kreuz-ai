import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getTotal } from "../inventory/inventoryQueries";
import { positionComponent } from "../map/positionComponent";
import { listWorkstations } from "../production/productionQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { haulJobId } from "../storage/storageTypes";
import { isLoosePile, listStorage } from "../storage/storageQueries";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { TaskStatus } from "../task/taskTypes";
import { zoneComponent } from "../zones/zoneComponent";
import { StandingOrderScope } from "./standingTypes";
import type { StandingOrder } from "./standingTypes";

// Units a haul courier carries towards storage: what citizens that run a `haul.deliver` task hold
// of the material (spec 026 FR-006c).
function carriedByHaulers(engine: GameEngine, materialId: string): number {
  let carried = 0;
  for (const entity of engine.store.entities()) {
    const queue = getComponent(entity, taskQueueComponent);
    const hauling = queue?.tasks.some(
      (task) =>
        task.type === haulJobId &&
        (task.status === TaskStatus.Running || task.status === TaskStatus.Waiting),
    );
    if (hauling === true) {
      carried += getTotal(entity, materialId);
    }
  }
  return carried;
}

/**
 * The stock a standing order counts (spec 026 FR-006), a pure read without randomness:
 * (a) the storage furniture inventories (household storage and loose piles left out), of the
 * whole settlement or, for a zone scope, of the furniture on the zone's tiles; (b) settlement
 * scope only: the unreserved units in workstation inventories (locked inputs excluded); (c)
 * settlement scope only: units carried by citizens running `haul.deliver`. Personal inventories,
 * build sites and goods still being crafted are not counted. A zone scope whose zone is gone
 * counts 0.
 *
 * @param engine - The engine.
 * @param order - The order (material, scope and zone).
 * @returns Counted units.
 */
export function countStock(engine: GameEngine, order: StandingOrder): number {
  const materialId = order.materialId;
  const zoneEntity = order.zoneId === null ? undefined : engine.store.get(order.zoneId);
  const zone = zoneEntity === undefined ? undefined : getComponent(zoneEntity, zoneComponent);
  if (order.scope === StandingOrderScope.Zone && zone === undefined) {
    return 0;
  }
  let total = 0;
  for (const entity of listStorage(engine)) {
    if (isLoosePile(entity)) {
      continue;
    }
    if (order.scope === StandingOrderScope.Zone) {
      const place = getComponent(entity, positionComponent);
      if (
        zone === undefined ||
        place === undefined ||
        place.mapId !== zone.mapId ||
        !zone.tiles.includes(place.cellIndex)
      ) {
        continue;
      }
    }
    total += getTotal(entity, materialId);
  }
  if (order.scope === StandingOrderScope.Settlement) {
    const reservations = getStorageService(engine).reservations;
    for (const station of listWorkstations(engine)) {
      total += reservations.availableTo(station.id, materialId, null);
    }
    total += carriedByHaulers(engine, materialId);
  }
  return total;
}
