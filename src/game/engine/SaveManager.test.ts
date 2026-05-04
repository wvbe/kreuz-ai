import { describe, it, expect } from "vitest";
import { serialize, deserialize, saveToJson, loadFromJson } from "./SaveManager.js";
import { createEntityManager, createEntity, addComponent, addTag, getComponent, hasTag } from "./EntityManager.js";
import { createEventBus } from "./EventBus.js";
import { createPrng } from "./Prng.js";
import type { GameState } from "./GameLoop.js";

function createTestState(): GameState {
  const entities = createEntityManager();
  const entity1 = createEntity(entities);
  const entity2 = createEntity(entities);
  addComponent(entities, entity1, "position", { mapId: "main", cellId: 5 });
  addComponent(entities, entity1, "health", { current: 80, max: 100 });
  addComponent(entities, entity2, "position", { mapId: "main", cellId: 12 });
  addTag(entities, entity1, "colonist");
  addTag(entities, entity2, "animal");

  return {
    tick: 42,
    entities,
    eventBus: createEventBus(),
    prng: createPrng(123),
    maps: new Map([["main", { type: "voronoi", cellCount: 500 }]]),
    paused: false,
    speed: 1,
  };
}

describe("SaveManager", () => {
  it("round-trips state through serialize/deserialize", () => {
    const original = createTestState();
    const saved = serialize(original);
    const restored = deserialize(saved);

    expect(restored.tick).toBe(42);
    expect(restored.prng.seed).toBe(123);
    expect(getComponent(restored.entities, 1, "position")).toEqual({ mapId: "main", cellId: 5 });
    expect(getComponent(restored.entities, 1, "health")).toEqual({ current: 80, max: 100 });
    expect(getComponent(restored.entities, 2, "position")).toEqual({ mapId: "main", cellId: 12 });
    expect(hasTag(restored.entities, 1, "colonist")).toBe(true);
    expect(hasTag(restored.entities, 2, "animal")).toBe(true);
  });

  it("round-trips through JSON string", () => {
    const original = createTestState();
    const json = saveToJson(original);
    const restored = loadFromJson(json);

    expect(restored.tick).toBe(original.tick);
    expect(restored.prng.seed).toBe(original.prng.seed);
    expect(restored.prng.state).toBe(original.prng.state);
    expect(getComponent(restored.entities, 1, "position")).toEqual({ mapId: "main", cellId: 5 });
  });

  it("preserves map data", () => {
    const original = createTestState();
    const restored = deserialize(serialize(original));
    expect(restored.maps.get("main")).toEqual({ type: "voronoi", cellCount: 500 });
  });

  it("produces valid JSON", () => {
    const state = createTestState();
    const json = saveToJson(state);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
