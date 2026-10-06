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

/**
 * The type of the active zone that covers a cell, once its effects count (the tick after it
 * became active).
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The zone type id, or null when no active zone with effects covers the cell.
 */
function effectiveZoneTypeAt(engine: GameEngine, mapId: number, cellIndex: number): string | null {
  const service = getZoneService(engine);
  const zoneId = service.zoneIdAt(mapId, cellIndex);
  const zone = zoneId === null ? null : service.getZone(zoneId);
  if (
    zone === null ||
    !zone.data.active ||
    zone.data.activeSinceTick === null ||
    engine.time.tickCount <= zone.data.activeSinceTick
  ) {
    return null;
  }
  return zone.data.zoneTypeId;
}

/**
 * Tells whether an activity is permitted at a location (spec 015 FR-009): true when the cell lies
 * in an active zone whose type unlocks the activity (`activityUnlocks`, DECISIONS D-81), from the
 * tick after the zone became active.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @param activityId - Activity id, e.g. `baking`.
 * @returns True when a valid zone unlocks the activity here.
 */
export function isActivityPermittedAt(
  engine: GameEngine,
  mapId: number,
  cellIndex: number,
  activityId: string,
): boolean {
  const typeId = effectiveZoneTypeAt(engine, mapId, cellIndex);
  const type = typeId === null ? undefined : engine.content.zones.find(typeId);
  return type?.activityUnlocks.includes(activityId) ?? false;
}

/**
 * The value of an `entity.modifier` effect that applies to an entity while it stands in an active
 * zone (spec 015 FR-010, DECISIONS D-11): the modifier ends when the entity leaves the tiles. A
 * cell is in one zone only, so effects of several zones never stack; several effects of one
 * modifier in one zone add up.
 *
 * @param engine - The engine.
 * @param entityId - Entity with a `Position`.
 * @param modifierId - Modifier id, e.g. `mood.bonus`.
 * @returns Milli value, 0 when the entity stands outside an active zone with that effect.
 */
export function zoneModifierMilliFor(
  engine: GameEngine,
  entityId: EntityId,
  modifierId: string,
): number {
  const entity = engine.store.get(entityId);
  const place = entity === undefined ? undefined : getComponent(entity, positionComponent);
  const typeId =
    place === undefined ? null : effectiveZoneTypeAt(engine, place.mapId, place.cellIndex);
  const type = typeId === null ? undefined : engine.content.zones.find(typeId);
  return (type?.effects ?? [])
    .filter((effect) => effect.modifierId === modifierId)
    .reduce((sum, effect) => sum + effect.value, 0);
}
