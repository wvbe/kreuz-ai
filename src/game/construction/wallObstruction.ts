import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { BlockReason } from "../map/mapTypes";
import { positionComponent } from "../map/positionComponent";
import { wallPrototypeId } from "./constructionTypes";

/**
 * Makes the cell of a wall entity non-traversable (`BlockReason.Wall`, DECISIONS D-21): a path
 * through the cell is invalidated at once (the map revision changes) and `map.cell.obstruction.changed`
 * is queued. Doors are passable and set nothing. Does nothing for other entities.
 *
 * @param engine - The engine.
 * @param entity - Any entity.
 * @returns True when an obstruction was set.
 */
export function applyWallObstruction(engine: GameEngine, entity: Entity): boolean {
  const place = getComponent(entity, positionComponent);
  if (entity.prototype !== wallPrototypeId || place === undefined) {
    return false;
  }
  return engine.maps.get(place.mapId)?.setObstruction(place.cellIndex, BlockReason.Wall) ?? false;
}

/**
 * Frees the cell of a wall entity that is removed, unless another wall stands on it. Does nothing
 * for other entities.
 *
 * @param engine - The engine.
 * @param entity - The wall about to be deleted.
 * @returns True when an obstruction was cleared.
 */
export function clearWallObstruction(engine: GameEngine, entity: Entity): boolean {
  const place = getComponent(entity, positionComponent);
  if (entity.prototype !== wallPrototypeId || place === undefined) {
    return false;
  }
  const another = engine.maps.occupants
    .occupantsOf(place.mapId, place.cellIndex)
    .some((id) => id !== entity.id && engine.store.get(id)?.prototype === wallPrototypeId);
  return another
    ? false
    : (engine.maps.get(place.mapId)?.setObstruction(place.cellIndex, null) ?? false);
}

/**
 * Derives the wall obstructions of every map from the wall entities (obstructions are not saved,
 * the entities are): run after `newGame` and `loadGame`.
 *
 * @param engine - The engine.
 * @returns How many wall cells were obstructed.
 */
export function rebuildWallObstructions(engine: GameEngine): number {
  let count = 0;
  for (const entity of engine.store.entities()) {
    if (!engine.store.isPendingDelete(entity.id) && applyWallObstruction(engine, entity)) {
      count += 1;
    }
  }
  return count;
}
