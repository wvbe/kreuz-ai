import type { Entity, EntityId } from "../ecs/Entity";
import { MapError, MapErrorKind } from "./MapError";
import type { MapLocation } from "./mapTypes";

/**
 * Derived index from cell to the entities standing in it (DECISIONS D-05: derived, rebuilt on
 * load, never serialized). Co-location is unlimited; occupants of a cell ascend by entity id.
 * Lookups by cell and by entity are O(1) plus the (small) occupant list.
 */
export class OccupantIndex {
  private readonly cells = new Map<number, Map<number, EntityId[]>>();
  private readonly locations = new Map<EntityId, MapLocation>();

  /**
   * Number of indexed entities.
   *
   * @returns The count.
   */
  get size(): number {
    return this.locations.size;
  }

  /**
   * Adds an entity to a cell.
   *
   * @param entityId - Entity id.
   * @param location - Map and cell to stand in.
   */
  add(entityId: EntityId, location: MapLocation): void {
    if (this.locations.has(entityId)) {
      throw new MapError(
        MapErrorKind.InvalidState,
        `entity ${entityId} is already placed; use move`,
      );
    }
    this.locations.set(entityId, { mapId: location.mapId, cellIndex: location.cellIndex });
    this.insert(entityId, location);
  }

  /**
   * Moves an entity to another cell, possibly of another map, in one step.
   *
   * @param entityId - Entity id; must be placed.
   * @param location - Destination.
   * @returns The previous location.
   */
  move(entityId: EntityId, location: MapLocation): MapLocation {
    const previous = this.remove(entityId);
    this.add(entityId, location);
    return previous;
  }

  /**
   * Removes an entity from the index.
   *
   * @param entityId - Entity id; must be placed.
   * @returns The location it left.
   */
  remove(entityId: EntityId): MapLocation {
    const previous = this.locations.get(entityId);
    if (!previous) {
      throw new MapError(MapErrorKind.UnknownOccupant, `entity ${entityId} is not on any map`);
    }
    this.locations.delete(entityId);
    const cell = this.cells.get(previous.mapId);
    const list = cell?.get(previous.cellIndex);
    if (cell && list) {
      list.splice(list.indexOf(entityId), 1);
      if (list.length === 0) {
        cell.delete(previous.cellIndex);
      }
      if (cell.size === 0) {
        this.cells.delete(previous.mapId);
      }
    }
    return previous;
  }

  /**
   * Entities standing in a cell.
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   * @returns Entity ids ascending (a copy).
   */
  occupantsOf(mapId: number, cellIndex: number): EntityId[] {
    return [...(this.cells.get(mapId)?.get(cellIndex) ?? [])];
  }

  /**
   * Where an entity stands.
   *
   * @param entityId - Entity id.
   * @returns The location, or null when the entity is not placed.
   */
  locationOf(entityId: EntityId): MapLocation | null {
    const found = this.locations.get(entityId);
    return found ? { mapId: found.mapId, cellIndex: found.cellIndex } : null;
  }

  /**
   * Counts the entities standing on one map.
   *
   * @param mapId - Map id.
   * @returns The number of entities.
   */
  countOnMap(mapId: number): number {
    let total = 0;
    for (const list of this.cells.get(mapId)?.values() ?? []) {
      total += list.length;
    }
    return total;
  }

  /**
   * Empties the index.
   */
  clear(): void {
    this.cells.clear();
    this.locations.clear();
  }

  /**
   * Rebuilds the index from the `Position` components of the given entities (after load).
   *
   * @param entities - Entities to scan, normally `EntityStore.entities()`.
   */
  rebuild(entities: readonly Entity[]): void {
    this.clear();
    for (const entity of entities) {
      const position = entity.components["Position"];
      if (position === undefined) {
        continue;
      }
      const mapId = position["mapId"];
      const cellIndex = position["cellIndex"];
      if (typeof mapId !== "number" || typeof cellIndex !== "number") {
        throw new MapError(
          MapErrorKind.InvalidState,
          `entity ${entity.id} has a malformed Position component`,
        );
      }
      this.add(entity.id, { mapId, cellIndex });
    }
  }

  private insert(entityId: EntityId, location: MapLocation): void {
    let onMap = this.cells.get(location.mapId);
    if (!onMap) {
      onMap = new Map();
      this.cells.set(location.mapId, onMap);
    }
    const list = onMap.get(location.cellIndex) ?? [];
    list.push(entityId);
    list.sort((left, right) => left - right);
    onMap.set(location.cellIndex, list);
  }
}
