import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { store, transfer } from "../inventory/inventoryOperations";
import { canStore, getAllItems } from "../inventory/inventoryQueries";
import { positionComponent } from "../map/positionComponent";
import { chooseRoute } from "../storage/storageRouting";
import { loosePilePrototypeId } from "../storage/storageTypes";
import { buildSiteComponent } from "./buildSiteComponent";
import type { SiteMaterial } from "./constructionTypes";

/**
 * Spawns an empty `loose_pile` on a cell. The haul poster of storage takes what lands in it to a
 * stockpile.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The new pile entity.
 */
export function spawnLoosePile(engine: GameEngine, mapId: number, cellIndex: number): Entity {
  const pile = engine.store.spawn(loosePilePrototypeId, { Position: { mapId, cellIndex } });
  engine.maps.placeEntity(pile.id, mapId, cellIndex);
  return pile;
}

/**
 * Puts goods on the ground that already left their inventory: spawns a `loose_pile` and fills it.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @param items - What to drop; nothing happens for an empty list.
 * @returns The id of the pile, or null when there was nothing to drop.
 */
export function dropLoosePile(
  engine: GameEngine,
  mapId: number,
  cellIndex: number,
  items: readonly SiteMaterial[],
): number | null {
  if (items.length === 0) {
    return null;
  }
  const pile = spawnLoosePile(engine, mapId, cellIndex);
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

/**
 * Gives the materials staged on a build site back (DECISIONS D-27): each good goes to the best
 * storage that accepts it (`chooseRoute`, nearest by the usual routing rules), what no storage
 * takes is dropped as one `loose_pile` on the site's cell. The site inventory ends empty and
 * nothing is lost or duplicated.
 *
 * @param engine - The engine.
 * @param site - The build site entity (its inventory is emptied).
 * @returns The goods that were given back (what was staged).
 */
export function refundSite(engine: GameEngine, site: Entity): SiteMaterial[] {
  const place = getComponent(site, positionComponent);
  if (getComponent(site, inventoryComponent) === undefined) {
    return [];
  }
  const staged = getAllItems(site).map((item) => ({ ...item }));
  const leftover: SiteMaterial[] = [];
  const context = { materials: engine.materials, actor: null, bus: engine.bus };
  for (const item of staged) {
    let remaining = item.quantity;
    const route =
      place === undefined
        ? null
        : chooseRoute(engine, {
            materialId: item.materialId,
            quantity: item.quantity,
            actorId: null,
            mapId: place.mapId,
            fromCell: place.cellIndex,
          });
    const target = route === null ? undefined : engine.store.get(route.entityId);
    if (target !== undefined && getComponent(target, inventoryComponent) !== undefined) {
      const amount = Math.min(
        remaining,
        canStore(engine.materials, target, item.materialId, remaining).maxFittable,
      );
      if (amount > 0) {
        transfer(context, site, target, item.materialId, amount);
        remaining -= amount;
      }
    }
    if (remaining > 0) {
      leftover.push({ materialId: item.materialId, quantity: remaining });
    }
  }
  if (place !== undefined && leftover.length > 0) {
    const pile = spawnLoosePile(engine, place.mapId, place.cellIndex);
    for (const item of leftover) {
      transfer(context, site, pile, item.materialId, item.quantity);
    }
  }
  return staged;
}

/**
 * The before-delete hook of build sites: a site that is deleted for any reason other than its
 * own completion or cancellation (the entity was removed by a script or a debug command) still
 * gives its staged materials back, so nothing vanishes with the entity.
 *
 * @param engine - The engine.
 * @param entity - The entity about to be deleted; nothing happens when it is no build site.
 * @returns The goods that were given back.
 */
export function destroySite(engine: GameEngine, entity: Entity): SiteMaterial[] {
  return getComponent(entity, buildSiteComponent) === undefined ? [] : refundSite(engine, entity);
}
