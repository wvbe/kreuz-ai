import { loadContent } from "../content/ContentLoader";
import type { ContentRegistries } from "../content/ContentRegistries";
import type { Entity, EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import { GridType } from "../map/mapTypes";
import { Difficulty } from "../save/initOptions";

/**
 * Component overrides for {@link AiTestWorld.spawn}.
 */
export type SpawnOverrides = { [componentName: string]: { [field: string]: JsonValue } };

/**
 * A small engine for AI tests: one square grassland map and a way to put humanoids on it.
 */
export type AiTestWorld = {
  engine: GameEngine;
  mapId: number;
  /**
   * Spawns a prototype on a cell of the test map and registers it with the occupant index;
   * `overrides` are extra component overrides, e.g. `{ AiState: { treeId: null } }` to keep the
   * AI away from the entity.
   */
  spawn: (prototypeId: string, cell: number, overrides?: SpawnOverrides) => Entity;
  /**
   * Runs ticks.
   */
  run: (ticks: number) => void;
};

/**
 * Options of {@link createAiWorld}.
 */
export type AiTestWorldOptions = {
  width?: number;
  height?: number;
  difficulty?: Difficulty;
  seed?: number;
  /**
   * Content registries of the engine (default: the bundled pack).
   */
  content?: ContentRegistries;
};

/**
 * Builds an engine with a started game (no world generation) and a square `grassland` map of
 * 10x10 cells by default. Settlers spawned with it have no traits unless their prototype lists
 * some; their tree is the prototype's (`basic_needs`).
 *
 * @param options - Map size, difficulty and seed.
 * @returns The engine, the map id and helpers.
 */
export function createAiWorld(options: AiTestWorldOptions = {}): AiTestWorld {
  const engine = new GameEngine(options.content ?? loadContent(), { entropy: () => 1 });
  engine.newGame({
    seed: options.seed ?? 7,
    difficulty: options.difficulty ?? Difficulty.Steady,
  });
  const map = engine.maps.createMap({
    gridType: GridType.Square,
    terrainId: "grassland",
    width: options.width ?? 10,
    height: options.height ?? 10,
  });
  return {
    engine,
    mapId: map.id,
    spawn: (prototypeId: string, cell: number, overrides: SpawnOverrides = {}): Entity => {
      const entity = engine.store.spawn(prototypeId, {
        ...overrides,
        Position: { mapId: map.id, cellIndex: cell },
      });
      engine.maps.placeEntity(entity.id, map.id, cell);
      return entity;
    },
    run: (ticks: number): void => {
      engine.runTicks(ticks);
    },
  };
}

/**
 * Removes every item of a material from an entity's inventory (test helper for starvation).
 *
 * @param world - The test world.
 * @param entityId - Entity to empty.
 * @param materialId - Material to remove.
 */
export function removeItems(world: AiTestWorld, entityId: EntityId, materialId: string): void {
  const entity = world.engine.store.require(entityId);
  const inventory = entity.components["Inventory"] as { slots: { materialId: string }[] };
  inventory.slots = inventory.slots.filter((slot) => slot.materialId !== materialId);
}
