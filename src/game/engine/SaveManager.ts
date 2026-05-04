/**
 * SaveManager: Serialize and deserialize full game state to/from JSON.
 * Handles Map and Set serialization for round-trip fidelity.
 */

import type { GameState } from "./GameLoop.js";
import { createEntityManager, addComponent, addTag, createEntity } from "./EntityManager.js";
import type { EntityManager, EntityId } from "./EntityManager.js";
import { createEventBus } from "./EventBus.js";
import type { PrngState } from "./Prng.js";

export type SaveData = {
  version: number;
  tick: number;
  prng: PrngState;
  entities: SerializedEntityManager;
  maps: Array<[string, unknown]>;
};

type SerializedEntityManager = {
  nextId: number;
  entities: EntityId[];
  components: Array<[string, Array<[EntityId, Record<string, unknown>]>]>;
  tags: Array<[EntityId, string[]]>;
};

/**
 * Serializes the full game state to a JSON-compatible object.
 */
export function serialize(state: GameState): SaveData {
  return {
    version: 1,
    tick: state.tick,
    prng: { seed: state.prng.seed, state: state.prng.state },
    entities: serializeEntityManager(state.entities),
    maps: [...state.maps.entries()] as Array<[string, unknown]>,
  };
}

/**
 * Deserializes save data back into a full game state.
 */
export function deserialize(data: SaveData): GameState {
  const entities = deserializeEntityManager(data.entities);
  return {
    tick: data.tick,
    entities,
    eventBus: createEventBus(),
    prng: { seed: data.prng.seed, state: data.prng.state },
    maps: new Map(data.maps),
    paused: false,
    speed: 1,
  };
}

/**
 * Converts save data to a JSON string.
 */
export function saveToJson(state: GameState): string {
  return JSON.stringify(serialize(state));
}

/**
 * Loads game state from a JSON string.
 */
export function loadFromJson(json: string): GameState {
  const data = JSON.parse(json) as SaveData;
  return deserialize(data);
}

function serializeEntityManager(manager: EntityManager): SerializedEntityManager {
  const components: Array<[string, Array<[EntityId, Record<string, unknown>]>]> = [];
  for (const [type, store] of manager.components) {
    components.push([type, [...store.entries()]]);
  }
  const tags: Array<[EntityId, string[]]> = [];
  for (const [entityId, tagSet] of manager.tags) {
    tags.push([entityId, [...tagSet]]);
  }
  return {
    nextId: manager.nextId,
    entities: [...manager.entities],
    components,
    tags,
  };
}

function deserializeEntityManager(data: SerializedEntityManager): EntityManager {
  const manager = createEntityManager();
  manager.nextId = data.nextId;
  for (const entityId of data.entities) {
    manager.entities.add(entityId);
  }
  for (const [type, entries] of data.components) {
    for (const [entityId, componentData] of entries) {
      addComponent(manager, entityId, type, componentData);
    }
  }
  for (const [entityId, tags] of data.tags) {
    for (const tag of tags) {
      addTag(manager, entityId, tag);
    }
  }
  return manager;
}
