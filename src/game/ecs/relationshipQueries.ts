import { EcsError, EcsErrorKind } from "./EcsError";
import type { Entity, EntityId } from "./Entity";
import type { EntityStore } from "./EntityStore";
import { RelationshipDirection } from "./RelationshipRegistry";
import type { RelationshipDefinition, RelationshipRegistry } from "./RelationshipRegistry";

/**
 * Deepest relationship chain {@link traverseRelated} follows (spec 002 SC-004).
 */
export const maxTraversalDepth = 5;

function readReferences(entity: Entity, definition: RelationshipDefinition): EntityId[] {
  if (!Object.hasOwn(entity.components, definition.component)) {
    return [];
  }
  const value = entity.components[definition.component]?.[definition.field];
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === "number") {
    return [value];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return value as EntityId[];
  }
  throw new EcsError(
    EcsErrorKind.InvalidComponentData,
    `${definition.component}.${definition.field} of entity ${entity.id} is not an entity id or id list`,
  );
}

function sortedUnique(ids: EntityId[]): EntityId[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

/**
 * Ids related to an entity by a named relationship, ascending and without duplicates. Forward
 * relationships read the entity's own field (ids are returned even if the target is gone);
 * inverse relationships scan for entities whose field references it.
 *
 * @param store - Entity store.
 * @param relationships - Registry holding the relationship.
 * @param entityId - Entity to start from.
 * @param name - Relationship name.
 * @returns Related ids in ascending order.
 */
export function getRelatedIds(
  store: EntityStore,
  relationships: RelationshipRegistry,
  entityId: EntityId,
  name: string,
): EntityId[] {
  const definition = relationships.require(name);
  const origin = store.require(entityId);
  if (definition.direction === RelationshipDirection.Forward) {
    return sortedUnique(readReferences(origin, definition));
  }
  const found: EntityId[] = [];
  for (const candidate of store.entities()) {
    if (readReferences(candidate, definition).includes(entityId)) {
      found.push(candidate.id);
    }
  }
  return found;
}

/**
 * Entities related to an entity by a named relationship, in ascending id order. A forward
 * reference to a deleted entity is an integrity bug and throws (spec 002 FR-005).
 *
 * @param store - Entity store.
 * @param relationships - Registry holding the relationship.
 * @param entityId - Entity to start from.
 * @param name - Relationship name.
 * @returns Live related entities.
 */
export function getRelatedEntities(
  store: EntityStore,
  relationships: RelationshipRegistry,
  entityId: EntityId,
  name: string,
): Entity[] {
  return getRelatedIds(store, relationships, entityId, name).map((relatedId) => {
    const related = store.get(relatedId);
    if (!related) {
      throw new EcsError(
        EcsErrorKind.DanglingReference,
        `relationship "${name}" of entity ${entityId} references deleted entity ${relatedId}`,
      );
    }
    return related;
  });
}

/**
 * The single related entity of a relationship; with several targets the lowest id wins
 * (DECISIONS E-02).
 *
 * @param store - Entity store.
 * @param relationships - Registry holding the relationship.
 * @param entityId - Entity to start from.
 * @param name - Relationship name.
 * @returns The related entity, or null when there is none.
 */
export function getRelatedEntity(
  store: EntityStore,
  relationships: RelationshipRegistry,
  entityId: EntityId,
  name: string,
): Entity | null {
  return getRelatedEntities(store, relationships, entityId, name)[0] ?? null;
}

/**
 * Follows one relationship transitively (breadth first) up to `maxDepth` hops. Each entity is
 * reported once, the start entity is never included, and cycles terminate through a visited set.
 *
 * @param store - Entity store.
 * @param relationships - Registry holding the relationship.
 * @param startId - Entity to start from.
 * @param name - Relationship name followed at every hop.
 * @param maxDepth - Hops to follow, 1 to {@link maxTraversalDepth}.
 * @returns Reached entities ordered by depth, then ascending id.
 */
export function traverseRelated(
  store: EntityStore,
  relationships: RelationshipRegistry,
  startId: EntityId,
  name: string,
  maxDepth: number = maxTraversalDepth,
): Entity[] {
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > maxTraversalDepth) {
    throw new EcsError(
      EcsErrorKind.InvalidState,
      `traversal depth must be an integer from 1 to ${maxTraversalDepth}, got ${String(maxDepth)}`,
    );
  }
  const visited = new Set<EntityId>([startId]);
  const reached: Entity[] = [];
  let frontier: EntityId[] = [startId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const next: EntityId[] = [];
    for (const current of frontier) {
      for (const related of getRelatedEntities(store, relationships, current, name)) {
        if (!visited.has(related.id)) {
          visited.add(related.id);
          reached.push(related);
          next.push(related.id);
        }
      }
    }
    frontier = next.sort((left, right) => left - right);
  }
  return reached;
}

/**
 * Clears every forward reference to a deleted entity (spec 002 FR-006a): single fields become
 * null and list fields drop the id. Call at removal time (pipeline slot 17) for each removed id.
 *
 * @param store - Entity store.
 * @param relationships - Registry whose forward relationships are cleaned.
 * @param targetId - Id of the entity that was deleted.
 * @returns How many references were cleared.
 */
export function clearReferencesTo(
  store: EntityStore,
  relationships: RelationshipRegistry,
  targetId: EntityId,
): number {
  let cleared = 0;
  for (const definition of relationships.forwardDefinitions()) {
    for (const holder of store.entities({ includePendingDelete: true })) {
      const data = holder.components[definition.component];
      const value = data?.[definition.field];
      if (!data) {
        continue;
      }
      if (value === targetId) {
        data[definition.field] = null;
        cleared += 1;
      } else if (Array.isArray(value) && value.includes(targetId)) {
        data[definition.field] = value.filter((item) => item !== targetId);
        cleared += 1;
      }
    }
  }
  return cleared;
}
