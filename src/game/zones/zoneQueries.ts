import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { zoneComponent } from "./zoneComponent";
import { getZoneService } from "./zoneServiceRegistry";

/**
 * The zone that covers a cell (spec 015 FR-016 `zoneAt`).
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The zone id, or null for an unzoned cell.
 */
export function zoneAt(engine: GameEngine, mapId: number, cellIndex: number): EntityId | null {
  return getZoneService(engine).zoneIdAt(mapId, cellIndex);
}

/**
 * The zone an entity stands in (spec 015 FR-016 `zoneOfEntity`).
 *
 * @param engine - The engine.
 * @param entityId - Any entity with a `Position`.
 * @returns The zone id, or null when the entity has no position or stands outside every zone.
 */
export function zoneOfEntity(engine: GameEngine, entityId: EntityId): EntityId | null {
  const entity = engine.store.get(entityId);
  const place = entity === undefined ? undefined : getComponent(entity, positionComponent);
  return place === undefined ? null : zoneAt(engine, place.mapId, place.cellIndex);
}

/**
 * The active zones of a type, ascending by id (spec 015 FR-016 `activeZonesOfType`).
 *
 * @param engine - The engine.
 * @param zoneTypeId - Zone type id.
 * @returns Zone ids.
 */
export function activeZonesOfType(engine: GameEngine, zoneTypeId: string): EntityId[] {
  return getZoneService(engine)
    .zones()
    .filter((entity) => {
      const data = getComponent(entity, zoneComponent);
      return data?.zoneTypeId === zoneTypeId && data.active;
    })
    .map((entity) => entity.id);
}

/**
 * Tells whether a cell is in an active zone of a type (the room restriction of recipes, DECISIONS
 * D-10: a workstation must stand in an active zone of the recipe's zone type). The effects of a
 * zone count from the tick after it became active.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @param zoneTypeId - Zone type id.
 * @returns True when the cell's zone is of that type, active and past its activation tick.
 */
export function isInActiveZoneOfType(
  engine: GameEngine,
  mapId: number,
  cellIndex: number,
  zoneTypeId: string,
): boolean {
  const service = getZoneService(engine);
  const zoneId = service.zoneIdAt(mapId, cellIndex);
  const zone = zoneId === null ? null : service.getZone(zoneId);
  return (
    zone !== null &&
    zone.data.zoneTypeId === zoneTypeId &&
    zone.data.active &&
    zone.data.activeSinceTick !== null &&
    engine.time.tickCount > zone.data.activeSinceTick
  );
}
