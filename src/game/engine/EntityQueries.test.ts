import { describe, it, expect } from "vitest";
import { createEntityManager, createEntity, addComponent, addTag } from "./EntityManager";
import { getEntitiesInCell, getEntitiesInMap, getEntitiesByComponent, getEntitiesByTagQuery, getEntityPosition } from "./EntityQueries";

describe("EntityQueries", () => {
  it("finds entities in a specific cell", () => {
    const manager = createEntityManager();
    const e1 = createEntity(manager);
    const e2 = createEntity(manager);
    const e3 = createEntity(manager);
    addComponent(manager, e1, "position", { mapId: "main", cellId: 5 });
    addComponent(manager, e2, "position", { mapId: "main", cellId: 5 });
    addComponent(manager, e3, "position", { mapId: "main", cellId: 10 });

    const result = getEntitiesInCell(manager, "main", 5);
    expect(result).toEqual([e1, e2]);
  });

  it("finds entities in a map", () => {
    const manager = createEntityManager();
    const e1 = createEntity(manager);
    const e2 = createEntity(manager);
    const e3 = createEntity(manager);
    addComponent(manager, e1, "position", { mapId: "main", cellId: 0 });
    addComponent(manager, e2, "position", { mapId: "cave1", cellId: 3 });
    addComponent(manager, e3, "position", { mapId: "main", cellId: 7 });

    expect(getEntitiesInMap(manager, "main")).toEqual([e1, e3]);
    expect(getEntitiesInMap(manager, "cave1")).toEqual([e2]);
  });

  it("finds entities by component", () => {
    const manager = createEntityManager();
    const e1 = createEntity(manager);
    const e2 = createEntity(manager);
    addComponent(manager, e1, "health", { current: 100, max: 100 });
    addComponent(manager, e2, "position", { mapId: "main", cellId: 0 });

    expect(getEntitiesByComponent(manager, "health")).toEqual([e1]);
  });

  it("finds entities by tag", () => {
    const manager = createEntityManager();
    const e1 = createEntity(manager);
    const e2 = createEntity(manager);
    addTag(manager, e1, "colonist");
    addTag(manager, e2, "animal");

    expect(getEntitiesByTagQuery(manager, "colonist")).toEqual([e1]);
  });

  it("gets entity position", () => {
    const manager = createEntityManager();
    const entity = createEntity(manager);
    addComponent(manager, entity, "position", { mapId: "main", cellId: 42 });

    const pos = getEntityPosition(manager, entity);
    expect(pos).toEqual({ mapId: "main", cellId: 42 });
  });

  it("returns undefined for entity without position", () => {
    const manager = createEntityManager();
    const entity = createEntity(manager);
    expect(getEntityPosition(manager, entity)).toBeUndefined();
  });
});
