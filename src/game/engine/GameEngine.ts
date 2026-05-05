/**
 * GameEngine: Top-level API that ties all systems together.
 * Provides create, load, tick, dispatch, and subscribe operations.
 */

import { createPrng, randomInt, pickRandom, type PrngState } from "./Prng";
import { createEntityManager, createEntity, addComponent, addTag, type EntityManager, type EntityId } from "./EntityManager";
import { createEventBus, emit, subscribe as busSubscribe, flush, type EventBusState, type GameEvent, type EventHandler } from "./EventBus";
import { createGameLoop, registerSystem, tick as gameTick, type GameState, type GameLoopState } from "./GameLoop";
import { loadAllContent, type ContentRegistries } from "../content/ContentLoader";
import { generateOutdoorMap } from "../map/generators/VoronoiOutdoorGenerator";
import { generateVillageLayout, type VillageLayout } from "../map/generators/VillageLayoutGenerator";
import { generateCave } from "../map/generators/CaveGenerator";
import { type TileMap, TerrainType } from "../map/TileMap";
import { createMapRegistry, addMapLink, type MapRegistry } from "../map/MapLink";
import { updateNeeds, createColonistNeeds } from "../systems/NeedSystem";
import { createSkillsComponent } from "../systems/SkillSystem";
import { createInventory } from "../systems/InventorySystem";
import { createJobBoard, type JobBoardComponent } from "../systems/JobSystem";
import { createFactionSystem, createFaction, joinFaction, type FactionSystem } from "../systems/FactionSystem";
import { createZoneSystem, createZone, type ZoneSystem } from "../systems/ZoneSystem";
import { createTradeSystem, type TradeSystem } from "../systems/TradeSystem";
import { createConstructionSystem, type ConstructionSystem } from "../systems/ConstructionSystem";
import { createStockpileSystem, type StockpileSystem } from "../systems/StockpileSystem";
import { saveToJson, loadFromJson } from "./SaveManager";

export type GameInstance = {
  state: GameState;
  loop: GameLoopState;
  content: ContentRegistries;
  maps: Map<string, TileMap>;
  mapRegistry: MapRegistry;
  factions: FactionSystem;
  zones: ZoneSystem;
  trade: TradeSystem;
  construction: ConstructionSystem;
  stockpiles: StockpileSystem;
  jobBoards: Map<string, JobBoardComponent>;
  villageLayout?: VillageLayout;
  subscribers: Set<(state: GameState) => void>;
};

export type GameConfig = {
  seed: number;
  mapCellCount: number;
  mapWidth: number;
  mapHeight: number;
  initialColonists: number;
};

export const defaultGameConfig: GameConfig = {
  seed: 42,
  mapCellCount: 600,
  mapWidth: 200,
  mapHeight: 200,
  initialColonists: 12,
};

/**
 * Creates a new game from a configuration, generating the world.
 */
export function createGame(config: GameConfig = defaultGameConfig): GameInstance {
  const prng = createPrng(config.seed);
  const entities = createEntityManager();
  const eventBus = createEventBus();
  const content = loadAllContent();

  // Generate the main outdoor map
  const { map: mainMap, prng: afterMap } = generateOutdoorMap(
    {
      mapId: "main",
      cellCount: config.mapCellCount,
      width: config.mapWidth,
      height: config.mapHeight,
      waterLevel: 0.25,
      mountainLevel: 0.75,
    },
    prng,
  );

  // Generate village layout on the map
  const { layout: villageLayout, prng: afterVillage } = generateVillageLayout(mainMap, afterMap);

  // Generate a cave sub-map
  const { data: caveData, prng: afterCave } = generateCave(
    {
      mapId: "cave-1",
      width: 30,
      height: 30,
      fillPercent: 0.45,
      smoothIterations: 4,
      parentMapId: "main",
      entranceCellId: villageLayout.townCenter,
    },
    afterVillage,
  );

  const maps = new Map<string, TileMap>();
  maps.set("main", mainMap);
  maps.set("cave-1", caveData.map);

  const mapRegistry = createMapRegistry();
  addMapLink(mapRegistry, "main", "cave-1", villageLayout.townCenter, 0, "Mysterious Cave");

  // Create game state
  const state: GameState = {
    tick: 0,
    entities,
    eventBus,
    prng: afterCave,
    maps: maps as unknown as Map<string, unknown>,
    paused: false,
    speed: 1,
  };

  // Set up game loop
  const loop = createGameLoop();
  registerSystem(loop, updateNeeds);
  registerSystem(loop, (gameState) => flush(gameState.eventBus));

  // Set up game sub-systems
  const factions = createFactionSystem();
  createFaction(factions, "village_council", "Village Council");
  createFaction(factions, "merchants_guild", "Merchants Guild");
  createFaction(factions, "craftsmen_guild", "Craftsmen Guild");
  createFaction(factions, "church", "The Church");

  const zones = createZoneSystem();
  const trade = createTradeSystem();
  const construction = createConstructionSystem();
  const stockpiles = createStockpileSystem();
  const jobBoards = new Map<string, JobBoardComponent>();
  jobBoards.set("main", createJobBoard("main"));

  // Spawn initial colonists
  let currentPrng = afterCave;
  const walkableCells = mainMap.cells.filter((cell) => cell.walkable);
  const villageCells = walkableCells.filter((cell) =>
    villageLayout.roads.includes(cell.cellId) ||
    cell.adjacentCells.some((adj) => villageLayout.roads.includes(adj)),
  );
  const spawnCells = villageCells.length > 0 ? villageCells : walkableCells;

  const colonistNames = [
    "Aldric", "Beatrice", "Conrad", "Daria", "Edmund", "Freya",
    "Gunther", "Helena", "Ingvar", "Johanna", "Klaus", "Liselotte",
    "Magnus", "Nadine", "Otto", "Petra", "Reinhardt", "Sigrid",
    "Theodor", "Ursula", "Viktor", "Wanda", "Xaver", "Yvonne",
  ];

  const skillIds = ["smithing", "carpentry", "cooking", "weaving", "mining", "farming", "woodcutting", "hauling", "combat", "construction"];

  for (let index = 0; index < config.initialColonists; index++) {
    const entityId = createEntity(entities);
    const { value: spawnCell, prng: p1 } = pickRandom(currentPrng, spawnCells);
    currentPrng = p1;

    addComponent(entities, entityId, "position", { mapId: "main", cellId: spawnCell.cellId });
    addComponent(entities, entityId, "health", { current: 100, max: 100 });
    addComponent(entities, entityId, "needs", createColonistNeeds());
    addComponent(entities, entityId, "skills", createSkillsComponent(skillIds));
    addComponent(entities, entityId, "inventory", createInventory(20));
    addComponent(entities, entityId, "identity", { name: colonistNames[index % colonistNames.length], profession: "settler" });
    addTag(entities, entityId, "colonist");
    addTag(entities, entityId, "humanoid");
    joinFaction(factions, "village_council", entityId);
  }

  // Spawn some animals
  const animalTypes = [
    { tag: "livestock", name: "Chicken", health: 20 },
    { tag: "livestock", name: "Cow", health: 80 },
    { tag: "livestock", name: "Sheep", health: 50 },
    { tag: "wild", name: "Deer", health: 40 },
    { tag: "wild", name: "Wolf", health: 60 },
  ];

  for (let index = 0; index < 15; index++) {
    const entityId = createEntity(entities);
    const { value: cell, prng: p1 } = pickRandom(currentPrng, walkableCells);
    currentPrng = p1;
    const { value: animalType, prng: p2 } = pickRandom(currentPrng, animalTypes);
    currentPrng = p2;

    addComponent(entities, entityId, "position", { mapId: "main", cellId: cell.cellId });
    addComponent(entities, entityId, "health", { current: animalType.health, max: animalType.health });
    addComponent(entities, entityId, "identity", { name: animalType.name, profession: "" });
    addTag(entities, entityId, "animal");
    addTag(entities, entityId, animalType.tag);
  }

  // Spawn some furniture/resources on the map
  for (const zone of villageLayout.zones) {
    const entityId = createEntity(entities);
    addComponent(entities, entityId, "position", { mapId: "main", cellId: zone.cellId });
    addComponent(entities, entityId, "identity", { name: zone.label, profession: "zone_marker" });
    addTag(entities, entityId, "structure");
    addTag(entities, entityId, zone.zoneType);
  }

  state.prng = currentPrng;

  const instance: GameInstance = {
    state,
    loop,
    content,
    maps,
    mapRegistry,
    factions,
    zones,
    trade,
    construction,
    stockpiles,
    jobBoards,
    villageLayout,
    subscribers: new Set(),
  };

  return instance;
}

/**
 * Advances the game by one tick and notifies subscribers.
 */
export function tickGame(instance: GameInstance): void {
  gameTick(instance.loop, instance.state);
  for (const subscriber of instance.subscribers) {
    subscriber(instance.state);
  }
}

/**
 * Subscribes to state changes.
 */
export function subscribeToState(
  instance: GameInstance,
  callback: (state: GameState) => void,
): () => void {
  instance.subscribers.add(callback);
  return () => instance.subscribers.delete(callback);
}

/**
 * Dispatches a player command.
 */
export function dispatchCommand(
  instance: GameInstance,
  command: { type: string; payload: Record<string, unknown> },
): void {
  emit(instance.state.eventBus, {
    type: `command.${command.type}`,
    payload: command.payload,
    tick: instance.state.tick,
  });

  // Handle specific commands
  switch (command.type) {
    case "pause":
      instance.state.paused = true;
      break;
    case "resume":
      instance.state.paused = false;
      break;
    case "set_speed":
      instance.state.speed = (command.payload.speed as number) ?? 1;
      break;
    case "pause_board": {
      const board = instance.jobBoards.get(command.payload.boardId as string);
      if (board) board.paused = true;
      break;
    }
    case "resume_board": {
      const board = instance.jobBoards.get(command.payload.boardId as string);
      if (board) board.paused = false;
      break;
    }
  }
}

/**
 * Saves the game state to a JSON string.
 */
export function saveGame(instance: GameInstance): string {
  return saveToJson(instance.state);
}
