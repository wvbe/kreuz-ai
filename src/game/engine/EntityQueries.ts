/**
 * Entity query helpers for spatial and component-based lookups.
 */

import type { EntityManager, EntityId, Component } from "./EntityManager";
import { getComponent, getEntitiesWithComponent, hasTag } from "./EntityManager";

/**
 * Gets all entities in a specific cell on a specific map.
 */
export function getEntitiesInCell(
  manager: EntityManager,
  mapId: string,
  cellId: number,
): EntityId[] {
  const entities = getEntitiesWithComponent(manager, "position");
  return entities.filter((entityId) => {
    const position = getComponent(manager, entityId, "position");
    return position && position.mapId === mapId && position.cellId === cellId;
  });
}

/**
 * Gets all entities on a specific map.
 */
export function getEntitiesInMap(manager: EntityManager, mapId: string): EntityId[] {
  const entities = getEntitiesWithComponent(manager, "position");
  return entities.filter((entityId) => {
    const position = getComponent(manager, entityId, "position");
    return position && position.mapId === mapId;
  });
}

/**
 * Gets all entities that have a specific component type.
 */
export function getEntitiesByComponent(
  manager: EntityManager,
  componentType: string,
): EntityId[] {
  return getEntitiesWithComponent(manager, componentType);
}

/**
 * Gets all entities with a specific tag.
 */
export function getEntitiesByTagQuery(manager: EntityManager, tag: string): EntityId[] {
  const result: EntityId[] = [];
  for (const entityId of manager.entities) {
    if (hasTag(manager, entityId, tag)) {
      result.push(entityId);
    }
  }
  return result;
}

/**
 * Gets the position of an entity.
 */
export function getEntityPosition(
  manager: EntityManager,
  entityId: EntityId,
): { mapId: string; cellId: number } | undefined {
  const position = getComponent(manager, entityId, "position");
  if (!position || typeof position.mapId !== "string" || typeof position.cellId !== "number") {
    return undefined;
  }
  return { mapId: position.mapId as string, cellId: position.cellId as number };
}
