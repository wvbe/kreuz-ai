import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { furnitureComponent } from "../storage/furnitureComponent";
import { countMatching } from "../zones/furnitureRequirements";
import type { FurniturePiece } from "../zones/furnitureRequirements";
import { zoneComponent } from "../zones/zoneComponent";
import { dwellingComponent } from "./dwellingComponent";
import { levelDefinition } from "./dwellingLevels";
import type { DwellingData } from "./housingTypes";
import type { ZoneData } from "../zones/zoneTypes";

/**
 * Tag of the furniture that gives a dwelling its capacity (spec 029 FR-012).
 */
export const bedTag = "bed";

/**
 * A dwelling: the zone entity with its `Zone` and `Dwelling` data.
 */
export type DwellingRecord = {
  entity: Entity;
  zone: ZoneData;
  dwelling: DwellingData;
};

/**
 * The dwelling with an id.
 *
 * @param engine - The engine.
 * @param dwellingId - A zone entity id.
 * @returns The record, or null when the entity is no live dwelling (no `Zone` or `Dwelling`).
 */
export function dwellingOf(engine: GameEngine, dwellingId: EntityId): DwellingRecord | null {
  const entity = engine.store.get(dwellingId);
  if (entity === undefined || engine.store.isPendingDelete(dwellingId)) {
    return null;
  }
  const zone = getComponent(entity, zoneComponent);
  const dwelling = getComponent(entity, dwellingComponent);
  return zone === undefined || dwelling === undefined ? null : { entity, zone, dwelling };
}

/**
 * Every live dwelling, ascending by zone entity id (the order of the daily evaluation).
 *
 * @param engine - The engine.
 * @returns The dwellings.
 */
export function listDwellings(engine: GameEngine): DwellingRecord[] {
  const records: DwellingRecord[] = [];
  for (const entity of engine.store.entities()) {
    const zone = getComponent(entity, zoneComponent);
    const dwelling = getComponent(entity, dwellingComponent);
    if (zone !== undefined && dwelling !== undefined) {
      records.push({ entity, zone, dwelling });
    }
  }
  return records;
}

/**
 * The furniture entities standing on the dwelling's tiles, ascending by entity id.
 *
 * @param engine - The engine.
 * @param zone - The dwelling's zone data.
 * @returns Entity ids with the furniture id and the tags of its content record.
 */
export function dwellingFurniture(
  engine: GameEngine,
  zone: ZoneData,
): (FurniturePiece & { entityId: EntityId })[] {
  const pieces: (FurniturePiece & { entityId: EntityId })[] = [];
  for (const tile of zone.tiles) {
    for (const id of engine.maps.occupants.occupantsOf(zone.mapId, tile)) {
      const entity = engine.store.get(id);
      const piece =
        entity === undefined || engine.store.isPendingDelete(id)
          ? undefined
          : getComponent(entity, furnitureComponent);
      if (piece !== undefined) {
        pieces.push({
          entityId: id,
          furnitureId: piece.furnitureId,
          tags: engine.content.furniture.find(piece.furnitureId)?.tags ?? [],
        });
      }
    }
  }
  return pieces.sort((left, right) => left.entityId - right.entityId);
}

/**
 * The storage furniture on the dwelling's tiles (furniture with an inventory), ascending by id.
 * This is the household's storage: reserved to the residents (spec 029 FR-017), active dwelling or
 * not.
 *
 * @param engine - The engine.
 * @param zone - The dwelling's zone data.
 * @returns The storage entities.
 */
export function dwellingStorage(engine: GameEngine, zone: ZoneData): Entity[] {
  return dwellingFurniture(engine, zone)
    .map((piece) => engine.store.get(piece.entityId))
    .filter(
      (entity): entity is Entity =>
        entity !== undefined && hasComponent(entity, inventoryComponent),
    );
}

/**
 * The beds on the dwelling's tiles (furniture tagged `bed`), ascending by id.
 *
 * @param engine - The engine.
 * @param zone - The dwelling's zone data.
 * @returns Bed entity ids.
 */
export function dwellingBeds(engine: GameEngine, zone: ZoneData): EntityId[] {
  return dwellingFurniture(engine, zone)
    .filter((piece) => piece.tags.includes(bedTag))
    .map((piece) => piece.entityId);
}

/**
 * The capacity of a dwelling: `min(level capacity, beds on its tiles)` (spec 029 FR-012).
 *
 * @param engine - The engine.
 * @param record - The dwelling.
 * @returns The number of residents it can hold.
 */
export function dwellingCapacity(engine: GameEngine, record: DwellingRecord): number {
  const beds = countMatching({ match: { tag: bedTag }, count: 1, perTiles: null }, [
    ...dwellingFurniture(engine, record.zone),
  ]);
  return Math.min(levelDefinition(engine, record.dwelling.level).capacity, beds);
}
