import { describe, it, expect } from "vitest";
import {
  createEntityManager,
  createEntity,
  destroyEntity,
  addComponent,
  getComponent,
  removeComponent,
  hasComponent,
  getEntitiesWithComponent,
  queryEntities,
  addTag,
  hasTag,
  getEntitiesByTag,
  entityExists,
} from "./EntityManager.js";

describe("EntityManager", () => {
  it("creates entities with sequential IDs", () => {
    const manager = createEntityManager();
    const first = createEntity(manager);
    const second = createEntity(manager);
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it("destroys entities completely", () => {
    const manager = createEntityManager();
    const entity = createEntity(manager);
    addComponent(manager, entity, "position", { mapId: "main", cellId: 0 });
    addTag(manager, entity, "colonist");
    destroyEntity(manager, entity);
    expect(entityExists(manager, entity)).toBe(false);
    expect(getComponent(manager, entity, "position")).toBeUndefined();
    expect(hasTag(manager, entity, "colonist")).toBe(false);
  });

  it("adds and retrieves components", () => {
    const manager = createEntityManager();
    const entity = createEntity(manager);
    addComponent(manager, entity, "position", { mapId: "main", cellId: 5 });
    const position = getComponent(manager, entity, "position");
    expect(position).toEqual({ mapId: "main", cellId: 5 });
  });

  it("removes components", () => {
    const manager = createEntityManager();
    const entity = createEntity(manager);
    addComponent(manager, entity, "health", { current: 100, max: 100 });
    removeComponent(manager, entity, "health");
    expect(hasComponent(manager, entity, "health")).toBe(false);
  });

  it("queries entities by component", () => {
    const manager = createEntityManager();
    const entity1 = createEntity(manager);
    const entity2 = createEntity(manager);
    const entity3 = createEntity(manager);
    addComponent(manager, entity1, "position", { mapId: "a", cellId: 0 });
    addComponent(manager, entity1, "health", { current: 100, max: 100 });
    addComponent(manager, entity2, "position", { mapId: "a", cellId: 1 });
    addComponent(manager, entity3, "health", { current: 50, max: 50 });

    expect(getEntitiesWithComponent(manager, "position")).toEqual([entity1, entity2]);
    expect(queryEntities(manager, ["position", "health"])).toEqual([entity1]);
  });

  it("manages tags", () => {
    const manager = createEntityManager();
    const entity1 = createEntity(manager);
    const entity2 = createEntity(manager);
    addTag(manager, entity1, "colonist");
    addTag(manager, entity2, "animal");
    addTag(manager, entity2, "colonist");

    expect(hasTag(manager, entity1, "colonist")).toBe(true);
    expect(hasTag(manager, entity1, "animal")).toBe(false);
    expect(getEntitiesByTag(manager, "colonist")).toEqual([entity1, entity2]);
  });
});
