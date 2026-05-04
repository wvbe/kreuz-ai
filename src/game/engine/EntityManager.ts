/**
 * Entity Component System (ECS) - EntityManager.
 * Pure data entity storage with component-based architecture.
 * Entities are just numeric IDs; all data lives in components.
 */

export type EntityId = number;

export type Component = Record<string, unknown>;

export type EntityManager = {
  nextId: EntityId;
  entities: Set<EntityId>;
  components: Map<string, Map<EntityId, Component>>;
  tags: Map<EntityId, Set<string>>;
};

/**
 * Creates a new entity manager.
 */
export function createEntityManager(): EntityManager {
  return {
    nextId: 1,
    entities: new Set(),
    components: new Map(),
    tags: new Map(),
  };
}

/**
 * Creates a new entity and returns its ID.
 */
export function createEntity(manager: EntityManager): EntityId {
  const entityId = manager.nextId++;
  manager.entities.add(entityId);
  return entityId;
}

/**
 * Destroys an entity, removing all its components and tags.
 */
export function destroyEntity(manager: EntityManager, entityId: EntityId): void {
  manager.entities.delete(entityId);
  for (const store of manager.components.values()) {
    store.delete(entityId);
  }
  manager.tags.delete(entityId);
}

/**
 * Adds a component to an entity.
 */
export function addComponent(
  manager: EntityManager,
  entityId: EntityId,
  componentType: string,
  data: Component,
): void {
  let store = manager.components.get(componentType);
  if (!store) {
    store = new Map();
    manager.components.set(componentType, store);
  }
  store.set(entityId, data);
}

/**
 * Gets a component from an entity, or undefined if not present.
 */
export function getComponent(
  manager: EntityManager,
  entityId: EntityId,
  componentType: string,
): Component | undefined {
  return manager.components.get(componentType)?.get(entityId);
}

/**
 * Removes a component from an entity.
 */
export function removeComponent(
  manager: EntityManager,
  entityId: EntityId,
  componentType: string,
): void {
  manager.components.get(componentType)?.delete(entityId);
}

/**
 * Checks if an entity has a specific component.
 */
export function hasComponent(
  manager: EntityManager,
  entityId: EntityId,
  componentType: string,
): boolean {
  return manager.components.get(componentType)?.has(entityId) ?? false;
}

/**
 * Gets all entities that have a specific component.
 */
export function getEntitiesWithComponent(
  manager: EntityManager,
  componentType: string,
): EntityId[] {
  const store = manager.components.get(componentType);
  return store ? [...store.keys()] : [];
}

/**
 * Gets all entities that have ALL specified components.
 */
export function queryEntities(
  manager: EntityManager,
  componentTypes: string[],
): EntityId[] {
  if (componentTypes.length === 0) return [...manager.entities];
  const [first, ...rest] = componentTypes;
  const candidates = getEntitiesWithComponent(manager, first!);
  return candidates.filter((entityId) =>
    rest.every((type) => hasComponent(manager, entityId, type)),
  );
}

/**
 * Adds a tag to an entity.
 */
export function addTag(manager: EntityManager, entityId: EntityId, tag: string): void {
  let tags = manager.tags.get(entityId);
  if (!tags) {
    tags = new Set();
    manager.tags.set(entityId, tags);
  }
  tags.add(tag);
}

/**
 * Checks if an entity has a specific tag.
 */
export function hasTag(manager: EntityManager, entityId: EntityId, tag: string): boolean {
  return manager.tags.get(entityId)?.has(tag) ?? false;
}

/**
 * Gets all entities with a specific tag.
 */
export function getEntitiesByTag(manager: EntityManager, tag: string): EntityId[] {
  const result: EntityId[] = [];
  for (const [entityId, tags] of manager.tags) {
    if (tags.has(tag)) {
      result.push(entityId);
    }
  }
  return result;
}

/**
 * Returns true if the entity exists.
 */
export function entityExists(manager: EntityManager, entityId: EntityId): boolean {
  return manager.entities.has(entityId);
}
