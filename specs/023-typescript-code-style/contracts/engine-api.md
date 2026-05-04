# Engine Public API Contract

The game engine (`src/game/`) exposes the following public interfaces to renderers. This is the ONLY coupling surface between engine and renderer.

## GameEngine (entry point)

```typescript
export type GameEngine = {
    /** Initialize engine with a seed and content data directory */
    create(config: EngineConfig): GameInstance;

    /** Load a previously saved game state */
    load(saveData: string): GameInstance;
};

export type EngineConfig = {
    seed: number;
    contentPath: string;
    mapGeneratorId: string;
    mapOptions: MapGeneratorOptions;
};

export type GameInstance = {
    /** Get current immutable game state snapshot */
    getState(): Readonly<GameState>;

    /** Advance simulation by one tick */
    tick(): void;

    /** Dispatch a player command */
    dispatch(command: CommandInput): string; // returns command ID

    /** Cancel a pending command */
    cancelCommand(commandId: string): boolean;

    /** Subscribe to state changes */
    subscribe(listener: () => void): () => void; // returns unsubscribe

    /** Serialize full state to JSON string */
    save(): string;

    /** Get content registries (read-only) */
    getContent(): ContentRegistries;
};
```

## CommandInput (player → engine)

```typescript
export type CommandInput =
    | { type: "pauseBoard"; boardId: string }
    | { type: "resumeBoard"; boardId: string }
    | { type: "setTradePolicy"; factionId: string; policy: TradePolicy }
    | { type: "diplomatic"; factionId: string; directive: DiplomaticDirective }
    | { type: "postJob"; boardId: string; jobTypeId: string }
    | {
          type: "placeFurniture";
          furnitureTypeId: string;
          mapId: string;
          cellId: number;
      }
    | {
          type: "createZone";
          zoneTypeId: string;
          mapId: string;
          cellIds: number[];
      }
    | { type: "placeWall"; mapId: string; cellId: number; edge: Direction }
    | { type: "placeDoor"; mapId: string; cellId: number; edge: Direction }
    | { type: "cancelCommand"; commandId: string };
```

## MapQuery (renderer reads map data)

```typescript
export type MapQuery = {
    /** Get all cells visible in a bounding box (for frustum culling) */
    getCellsInBounds(mapId: string, bounds: BoundingBox): CellView[];

    /** Get cell at a world coordinate (for raycasting) */
    getCellAtPoint(mapId: string, x: number, y: number): CellView | null;

    /** Get entities in a specific cell */
    getEntitiesInCell(mapId: string, cellId: number): EntityView[];

    /** Get navigable path between two cells (for rendering movement previews) */
    getPath(mapId: string, from: number, to: number): number[];

    /** Get sub-maps linked from a cell */
    getSubMaps(mapId: string, cellId: number): MapInfo[];
};
```

## EntityView (renderer reads entity state)

```typescript
export type EntityView = {
    id: string;
    prototypeId: string;
    position: { mapId: string; cellId: number; x: number; y: number };
    displayName: string;
    tags: string[];

    // Optional components (present only if entity has them)
    needs?: Record<string, number>;
    skills?: Record<string, number>;
    inventory?: { items: ItemStack[]; capacity: number };
    currentTask?: { description: string; progress: number };
    factions?: { factionId: string; role: string }[];
    traits?: string[];
    jobClaim?: { jobId: string; progress: number };
};
```

## ContentRegistries (read-only access to all 12 registries)

```typescript
export type ContentRegistries = {
    materials: ReadonlyRegistry<Material>;
    skills: ReadonlyRegistry<Skill>;
    needs: ReadonlyRegistry<Need>;
    terrain: ReadonlyRegistry<TerrainType>;
    traits: ReadonlyRegistry<Trait>;
    furniture: ReadonlyRegistry<FurnitureType>;
    zones: ReadonlyRegistry<ZoneType>;
    factions: ReadonlyRegistry<Faction>;
    jobs: ReadonlyRegistry<JobType>;
    recipes: ReadonlyRegistry<Recipe>;
    behaviorTrees: ReadonlyRegistry<BehaviorTree>;
    entityPrototypes: ReadonlyRegistry<EntityPrototype>;
};

export type ReadonlyRegistry<T> = {
    get(id: string): T | undefined;
    getAll(): readonly T[];
    search(query: string): readonly T[];
    has(id: string): boolean;
    count(): number;
};
```

## Event Contract (engine → renderer notifications)

The renderer subscribes to engine state changes via `subscribe()`. For fine-grained updates, the engine also exposes an event stream:

```typescript
export type GameEvent =
    | { type: "entityMoved"; entityId: string; from: number; to: number }
    | { type: "entitySpawned"; entityId: string }
    | { type: "entityRemoved"; entityId: string }
    | { type: "needChanged"; entityId: string; needId: string; value: number }
    | { type: "jobCompleted"; jobId: string; entityId: string }
    | { type: "commandCompleted"; commandId: string }
    | { type: "zoneActivated"; zoneId: string }
    | { type: "tickCompleted"; tick: number };
```

## MapGenerator Contract (pluggable generators)

```typescript
export type MapGenerator = {
    id: string;
    generate(options: MapGeneratorOptions, prng: Prng): TileMap;
};

export type MapGeneratorOptions = {
    cellCount?: number; // voronoi: number of seed points (default 600)
    width?: number; // square: grid width (default 30)
    height?: number; // square: grid height (default 30)
    iterations?: number; // Lloyd relaxation iterations (default 2)
    fillRatio?: number; // cave: percentage of floor vs wall (default 0.45)
    roomCount?: number; // cellar: number of rooms (default 4)
};
```
