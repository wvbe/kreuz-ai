import { aiSystemId } from "../ai/aiTypes";
import { registerAi } from "../ai/registerAi";
import { aiStateComponent } from "../behavior/aiStateComponent";
import { BehaviorError } from "../behavior/BehaviorError";
import { BehaviorHandlerRegistry } from "../behavior/BehaviorHandlerRegistry";
import { BehaviorInterpreter } from "../behavior/BehaviorInterpreter";
import { BehaviorTreeRegistry } from "../behavior/BehaviorTreeRegistry";
import { governmentFactionPrototypeId } from "../content/ContentRegistries";
import type { ContentRegistries } from "../content/ContentRegistries";
import { ContentValidationError } from "../content/ContentValidationError";
import { ContentFile } from "../content/contentTypes";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import type { ComponentData } from "../ecs/ComponentRegistry";
import { EcsError } from "../ecs/EcsError";
import type { Entity, EntityId } from "../ecs/Entity";
import { EntityStore } from "../ecs/EntityStore";
import { cloneJson } from "../ecs/jsonData";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { clearReferencesTo } from "../ecs/relationshipQueries";
import { RelationshipRegistry } from "../ecs/RelationshipRegistry";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { decayInventories } from "../inventory/inventoryDecay";
import type { DecayModifiers } from "../inventory/inventoryTypes";
import type { MaterialRegistry } from "../inventory/MaterialRegistry";
import { MapError, MapErrorKind } from "../map/MapError";
import { MapRegistry } from "../map/MapRegistry";
import type { MapState } from "../map/mapTypes";
import { positionComponent } from "../map/positionComponent";
import { Difficulty, initOptionsSchema } from "../save/initOptions";
import type { InitOptionsData } from "../save/initOptions";
import { loadGame as loadGameParts } from "../save/loadGame";
import type { LoadResult } from "../save/loadGame";
import type { MigrationRegistry } from "../save/migrations/MigrationRegistry";
import { saveGame as saveGameParts } from "../save/saveGame";
import { SaveSectionRegistry } from "../save/SaveSectionRegistry";
import type { GameSnapshotParts, SaveOptions } from "../save/saveTypes";
import { hashGameState } from "../save/stateHash";
import { TaskHandlerRegistry } from "../task/TaskHandlerRegistry";
import { TaskSystem } from "../task/TaskSystem";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { GameTime, hourOfDay } from "../time/GameTime";
import { generateWorld } from "../worldgen/generateWorld";
import { EventBus } from "./EventBus";
import type { EventBusErrorReport, EventBusErrorSink, JsonValue } from "./EventBus";
import { GameEngineError, GameEngineErrorKind } from "./GameEngineError";
import { IdCounters } from "./IdCounters";
import { registerFactions } from "../factions/registerFactions";
import { jobsSystemId } from "../jobs/jobTypes";
import { registerJobs } from "../jobs/registerJobs";
import { registerCrier } from "../crier/registerCrier";
import { registerStorage } from "../storage/registerStorage";
import { registerProduction } from "../production/registerProduction";
import { registerConstruction } from "../construction/registerConstruction";
import { registerGathering } from "../gathering/registerGathering";
import { registerDiplomacy } from "../diplomacy/registerDiplomacy";
import { registerSettlement } from "../settlement/registerSettlement";
import { registerTrade } from "../trade/registerTrade";
import { registerStatus } from "../status/registerStatus";
import { registerHousing } from "../housing/registerHousing";
import { registerZones } from "../zones/registerZones";
import { zonesSystemId } from "../zones/zoneTypes";
import { getStorageService } from "../storage/storageServiceRegistry";
import { storageSystemId } from "../storage/storageTypes";
import { factionsSystemId } from "../factions/factionTypes";
import { registerIdentity } from "../identity/registerIdentity";
import { identitySystemId } from "../identity/identityTypes";
import { registerSkills, skillsSystemId } from "../skills/registerSkills";
import { parseGameInitOptions } from "./options";
import type { GameInitOptions } from "./options";
import { Prng } from "./Prng";
import { InitMode } from "./engineSystemTypes";
import type {
  CommandRegistration,
  EngineSystemDefinition,
  EntityView,
  GameStateView,
  GameTimeView,
  QueryRegistration,
  SystemInitContext,
} from "./engineSystemTypes";
import { SystemRegistry } from "./SystemRegistry";
import { SystemRegistryError, SystemRegistryErrorKind } from "./SystemRegistryError";
import { TickPipeline, TickSlot } from "./TickPipeline";

/**
 * Optional dependencies injected into a {@link GameEngine} (DECISIONS D-06).
 */
export type GameEngineDeps = {
  /**
   * Source of the one random uint32 used when `newGame` gets no seed. The engine never reads a
   * clock or `Math.random` itself; hosts pass real randomness, tests a constant. Without it a
   * `newGame` without seed is rejected.
   */
  entropy?: () => number;
  /**
   * Additionally receives every event-bus error report (all reports are also kept in
   * {@link GameEngine.errors}).
   */
  errorSink?: EventBusErrorSink;
  /**
   * Save migrations to use instead of the built-in chain.
   */
  migrations?: MigrationRegistry;
};

/**
 * Result of {@link GameEngine.newGame}.
 */
export type NewGameResult = {
  /**
   * The options as stored in the game (the seed is the one actually used).
   */
  options: InitOptionsData;
  /**
   * Option names that are not part of {@link GameInitOptions} and were ignored (typos).
   */
  ignoredFields: string[];
};

const governmentIssueMessage =
  "newGame needs this prototype for the player government faction (DECISIONS D-06)";

function emptyInitOptions(): InitOptionsData {
  return { seed: 0, difficulty: Difficulty.Steady, startingTier: null, mapSize: null };
}

/**
 * One game host (spec 007, DECISIONS D-06): owns every subsystem of one simulation (clock, tick
 * pipeline, event bus, PRNG, id counters, component and prototype registries, entities, maps,
 * task and behavior runtime, save sections) and nothing is shared between instances.
 *
 * Lifecycle: `new GameEngine(content)`, register systems with {@link GameEngine.registerSystem},
 * then {@link GameEngine.newGame} or {@link GameEngine.loadGame}; both build into the current
 * state and restore the previous game when anything fails, so a failed call changes nothing. The
 * engine is idle until the host calls {@link GameEngine.tick}; there is no auto-run.
 */
export class GameEngine {
  /**
   * Content of this engine (registries are per engine, AD8).
   */
  readonly content: ContentRegistries;
  readonly bus: EventBus;
  readonly time: GameTime;
  readonly counters = new IdCounters();
  readonly components = new ComponentRegistry();
  readonly prototypes: PrototypeRegistry;
  readonly relationships = new RelationshipRegistry();
  readonly store: EntityStore;
  readonly maps: MapRegistry;
  readonly pipeline: TickPipeline;
  readonly taskHandlers = new TaskHandlerRegistry();
  readonly tasks: TaskSystem;
  readonly behaviorHandlers = new BehaviorHandlerRegistry();
  readonly behaviorTrees: BehaviorTreeRegistry;
  readonly behavior: BehaviorInterpreter;
  /**
   * Every event-bus error report (subscriber exceptions, depth overflow) since the last
   * successful `newGame` / `loadGame`.
   */
  readonly errors: EventBusErrorReport[] = [];
  /**
   * Non-fatal findings, e.g. behavior trees that could not be loaded because a system has not
   * registered the handlers they name yet.
   */
  readonly warnings: string[] = [];

  private readonly systems = new SystemRegistry<SystemInitContext>();
  private readonly sections = new SaveSectionRegistry();
  private readonly sectionInitial = new Map<string, JsonValue>();
  private readonly commandHandlerMap = new Map<string, CommandRegistration>();
  private readonly queryMap = new Map<string, QueryRegistration>();
  private readonly prngHolder: { prng: Prng };
  private readonly initHolder: { options: InitOptionsData };
  private readonly parts: GameSnapshotParts;
  private prototypesLoaded = false;
  private treesLoaded = false;
  private gameActive = false;

  /**
   * Creates an idle engine without a game. Nothing is validated against the content until the
   * first `newGame` / `loadGame`, so systems can still register components and handlers.
   *
   * @param content - The loaded content pack of this engine.
   * @param deps - Optional entropy source, extra error sink and migrations.
   */
  constructor(
    content: ContentRegistries,
    private readonly deps: GameEngineDeps = {},
  ) {
    this.content = content;
    this.bus = new EventBus((report) => {
      this.errors.push(report);
      deps.errorSink?.(report);
    });
    this.time = new GameTime(this.bus);
    for (const definition of [
      positionComponent,
      inventoryComponent,
      taskQueueComponent,
      aiStateComponent,
    ]) {
      this.components.register(definition);
    }
    this.prototypes = new PrototypeRegistry(this.components);
    this.store = new EntityStore({
      components: this.components,
      prototypes: this.prototypes,
      counters: this.counters,
      bus: this.bus,
    });
    this.maps = new MapRegistry({
      terrain: content.terrain,
      counters: this.counters,
      bus: this.bus,
    });
    this.pipeline = new TickPipeline({ time: this.time, bus: this.bus });
    this.tasks = new TaskSystem({
      store: this.store,
      bus: this.bus,
      counters: this.counters,
      time: this.time,
      handlers: this.taskHandlers,
    });
    this.behaviorTrees = new BehaviorTreeRegistry(this.behaviorHandlers);
    this.behavior = new BehaviorInterpreter({
      store: this.store,
      bus: this.bus,
      trees: this.behaviorTrees,
      handlers: this.behaviorHandlers,
    });
    this.prngHolder = { prng: Prng.create({ seed: 0 }) };
    this.initHolder = { options: emptyInitOptions() };
    this.parts = {
      time: this.time,
      prng: this.prngHolder,
      bus: this.bus,
      counters: this.counters,
      store: this.store,
      maps: this.maps,
      tasks: this.tasks,
      initOptions: this.initHolder,
      sections: this.sections,
    };
    this.registerBuiltInSystems();
  }

  /**
   * The random generator of the current game (replaced by `newGame` / `loadGame`, so do not keep
   * the reference). `engine.prng.seed` is the recorded seed.
   *
   * @returns The generator.
   */
  get prng(): Prng {
    return this.prngHolder.prng;
  }

  /**
   * Material registry of the content (convenience for systems and tests).
   *
   * @returns The registry.
   */
  get materials(): MaterialRegistry {
    return this.content.materials;
  }

  /**
   * Tells whether `newGame` or `loadGame` has succeeded and the game is running.
   *
   * @returns True when a game exists.
   */
  get hasGame(): boolean {
    return this.gameActive;
  }

  /**
   * The single extension point for new systems (spec 007 FR-015): one call registers the tick
   * function (`run` at `slot`/`order`), the init hook with its dependencies, the owned save
   * section, owned components and command handlers. Everything is checked first, so a rejected
   * definition changes nothing. Dependencies may name systems registered later; they are
   * checked when the next game starts.
   *
   * @param definition - The system, see {@link EngineSystemDefinition}.
   */
  registerSystem(definition: EngineSystemDefinition): void {
    if (definition.run !== undefined && definition.slot === undefined) {
      throw new SystemRegistryError(
        SystemRegistryErrorKind.InvalidDefinition,
        `system "${definition.id}" has a run function but no slot`,
      );
    }
    if (definition.run === undefined && definition.slot !== undefined) {
      throw new SystemRegistryError(
        SystemRegistryErrorKind.InvalidDefinition,
        `system "${definition.id}" has a slot but no run function`,
      );
    }
    const section = definition.saveSection;
    const handlerKinds = Object.keys(definition.commandHandlers ?? {});
    for (const kind of handlerKinds) {
      if (this.commandHandlerMap.has(kind)) {
        throw new GameEngineError(
          GameEngineErrorKind.DuplicateCommandHandler,
          `command handler "${kind}" is already registered`,
        );
      }
    }
    const queryNames = Object.keys(definition.queries ?? {});
    for (const name of queryNames) {
      if (this.queryMap.has(name)) {
        throw new GameEngineError(
          GameEngineErrorKind.DuplicateQuery,
          `query "${name}" is already registered`,
        );
      }
    }
    // The registry validates the id and rejects duplicates before anything else is touched.
    this.systems.register({
      id: definition.id,
      dependencies: definition.dependencies,
      init: definition.init,
    });
    try {
      for (const component of definition.components ?? []) {
        this.components.register(component);
      }
      if (definition.run !== undefined && definition.slot !== undefined) {
        this.pipeline.registerSystem({
          id: definition.id,
          slot: definition.slot,
          order: definition.order ?? 0,
          run: definition.run,
        });
      }
      if (section) {
        this.sections.register(section);
        this.sectionInitial.set(this.sectionName(section), cloneJson(section.serialize()));
      }
    } catch (failure) {
      this.pipeline.unregisterSystem(definition.id);
      throw failure;
    }
    for (const kind of handlerKinds) {
      const handler = definition.commandHandlers?.[kind];
      if (handler) {
        this.commandHandlerMap.set(kind, handler);
      }
    }
    for (const name of queryNames) {
      const query = definition.queries?.[name];
      if (query) {
        this.queryMap.set(name, query);
      }
    }
  }

  /**
   * Looks up a registered command.
   *
   * @param kind - Command kind.
   * @returns The registration (schema, mode, handler), or undefined.
   */
  getCommandHandler(kind: string): CommandRegistration | undefined {
    return this.commandHandlerMap.get(kind);
  }

  /**
   * Lists the registered command kinds.
   *
   * @returns Kinds, sorted.
   */
  commandKinds(): string[] {
    return [...this.commandHandlerMap.keys()].sort();
  }

  /**
   * Looks up a registered query.
   *
   * @param name - Query name.
   * @returns The registration, or undefined.
   */
  getQuery(name: string): QueryRegistration | undefined {
    return this.queryMap.get(name);
  }

  /**
   * Lists the registered query names.
   *
   * @returns Names, sorted.
   */
  queryNames(): string[] {
    return [...this.queryMap.keys()].sort();
  }

  /**
   * Starts a new game, replacing any previous one (spec 007 FR-001..003, FR-007..010, FR-012).
   * Options and the system graph are validated and the seed is drawn (from the entropy source,
   * exactly once, only when none was given) before anything changes. Then the world is reset,
   * the government faction entity is spawned, init hooks run in dependency order and `game.started`
   * is queued (delivered at the first `processQueue`). If a hook throws the previous game is
   * restored. Nothing ticks: the engine is idle until {@link GameEngine.tick}.
   *
   * @param options - See {@link GameInitOptions}; invalid values throw `InvalidOptionsError`.
   * @returns The stored options and the ignored option names.
   */
  newGame(options?: GameInitOptions): NewGameResult {
    const parsed = parseGameInitOptions(options);
    this.prepare();
    this.requireGovernmentPrototype();
    if (parsed.seed === null && this.deps.entropy === undefined) {
      throw new GameEngineError(
        GameEngineErrorKind.MissingEntropy,
        "newGame without a seed needs an entropy source: pass `entropy` to the GameEngine or give a seed",
      );
    }
    const prng = Prng.create({
      seed: parsed.seed ?? undefined,
      entropy: this.deps.entropy,
    });
    const stored: InitOptionsData = initOptionsSchema.parse({
      seed: prng.seed,
      difficulty: parsed.difficulty,
      startingTier: parsed.startingTier,
      mapSize: parsed.mapSize,
    });
    const backup = this.gameActive ? saveGameParts(this.parts) : null;
    try {
      this.resetWorld(prng, stored);
      this.store.spawn(governmentFactionPrototypeId);
      this.systems.runInit({ engine: this, mode: InitMode.NewGame, options: stored });
      this.bus.emit("game.started", {
        seed: stored.seed,
        difficulty: stored.difficulty,
        startingTier: parsed.startingTier,
      });
    } catch (failure) {
      this.recover(backup);
      throw new GameEngineError(
        GameEngineErrorKind.InitFailed,
        `newGame failed and the previous game was kept: ${failure instanceof Error ? failure.message : String(failure)}`,
        failure instanceof Error ? failure : undefined,
      );
    }
    this.gameActive = true;
    this.errors.length = 0;
    return { options: { ...stored }, ignoredFields: parsed.ignoredFields };
  }

  /**
   * Loads a save (spec 007 FR-004..006): parse, migrate and validate everything, then apply;
   * any failure leaves the current game exactly as it was and throws `InvalidSaveFormatError` or
   * `UnsupportedSaveVersionError`. On success init hooks run with {@link InitMode.LoadGame},
   * `game.loaded` is emitted and the event queue is drained once, so that an immediate
   * {@link GameEngine.saveGame} equals the loaded save (apart from its timestamp).
   *
   * @param save - Save text (JSON) or an already parsed save object.
   * @returns The load summary (original version, whether it was migrated, timestamp).
   */
  loadGame(save: string | JsonValue): LoadResult {
    this.prepare();
    const previous = saveGameParts(this.parts);
    const result = loadGameParts(save, this.parts, { migrations: this.deps.migrations });
    try {
      this.systems.runInit({
        engine: this,
        mode: InitMode.LoadGame,
        options: this.initHolder.options,
      });
    } catch (failure) {
      this.recover(previous);
      throw new GameEngineError(
        GameEngineErrorKind.InitFailed,
        `loadGame failed and the previous game was kept: ${failure instanceof Error ? failure.message : String(failure)}`,
        failure instanceof Error ? failure : undefined,
      );
    }
    this.gameActive = true;
    this.errors.length = 0;
    this.bus.emit("game.loaded", { tick: this.time.tickCount });
    this.bus.processQueue();
    return result;
  }

  /**
   * Serializes the game (spec 006): canonical text, no side effects. Only between ticks.
   *
   * @param options - Optional ISO timestamp supplied by the host.
   * @returns The save text.
   */
  saveGame(options?: SaveOptions): string {
    this.requireGame("save");
    return saveGameParts(this.parts, options);
  }

  /**
   * Alias of {@link GameEngine.saveGame} (the DECISIONS D-06 name).
   *
   * @param options - Optional ISO timestamp supplied by the host.
   * @returns The save text.
   */
  save(options?: SaveOptions): string {
    return this.saveGame(options);
  }

  /**
   * Hash of the complete game state (timestamp neutral) for determinism checks.
   *
   * @returns 16 hex characters.
   */
  getStateHash(): string {
    return hashGameState(this.parts);
  }

  /**
   * Runs one tick through the pipeline (DECISIONS section 2).
   *
   * @returns False when the game is paused (nothing happened).
   */
  tick(): boolean {
    this.requireGame("tick");
    return this.pipeline.tick();
  }

  /**
   * Runs up to `count` ticks, stopping early when paused.
   *
   * @param count - Number of ticks.
   * @returns How many ticks ran.
   */
  runTicks(count: number): number {
    this.requireGame("runTicks");
    return this.pipeline.runTicks(count);
  }

  /**
   * The clock as a plain snapshot.
   *
   * @returns Tick, pause flag, speed and calendar values.
   */
  getTime(): GameTimeView {
    return {
      tick: this.time.tickCount,
      paused: this.time.paused,
      speed: this.time.speed,
      tickIntervalMs: this.time.tickIntervalMs,
      day: this.time.toDay(),
      tickOfDay: this.time.tickOfDay(),
      hourOfDay: hourOfDay(this.time.tickCount),
    };
  }

  /**
   * A summary snapshot of the game (the complete state is {@link GameEngine.saveGame}).
   *
   * @returns Time, the options in force and counts.
   */
  getState(): GameStateView {
    return {
      hasGame: this.gameActive,
      time: this.getTime(),
      initOptions: { ...this.initHolder.options },
      entityCount: this.store.entities().length,
      mapCount: this.maps.size,
    };
  }

  /**
   * One entity as an independent copy.
   *
   * @param id - Entity id.
   * @returns The copy, or undefined when it does not exist.
   */
  getEntity(id: EntityId): EntityView | undefined {
    const entity = this.store.get(id);
    return entity && !this.store.isPendingDelete(id) ? this.copyEntity(entity) : undefined;
  }

  /**
   * All entities, ascending by id, as independent copies.
   *
   * @returns The copies.
   */
  getEntities(): EntityView[] {
    return this.store.entities().map((entity) => this.copyEntity(entity));
  }

  /**
   * The components of one entity as an independent copy.
   *
   * @param id - Entity id.
   * @returns Components by name, or undefined when the entity does not exist.
   */
  getComponents(id: EntityId): { [componentName: string]: ComponentData } | undefined {
    return this.getEntity(id)?.components;
  }

  /**
   * One map in its serialized form (terrain, params, links) as an independent copy.
   *
   * @param id - Map id.
   * @returns The map state, or undefined when the map does not exist.
   */
  getMap(id: number): MapState | undefined {
    return this.maps.get(id)?.serialize();
  }

  private sectionName(section: { key: string; location: string }): string {
    return `${section.location}:${section.key}`;
  }

  private copyEntity(entity: Entity): EntityView {
    return {
      id: entity.id,
      prototype: entity.prototype,
      components: cloneJson(entity.components),
    };
  }

  private requireGame(operation: string): void {
    if (!this.gameActive) {
      throw new GameEngineError(
        GameEngineErrorKind.NoGame,
        `${operation} needs a game: call newGame or loadGame first`,
      );
    }
  }

  private registerBuiltInSystems(): void {
    this.tasks.registerWith(this.pipeline);
    this.systems.register({ id: "task.execution" });
    this.registerSystem({
      id: "inventory.decay",
      slot: TickSlot.Decay,
      run: () => {
        const difficultyDecayMilli = this.content.difficultyModes.require(
          this.initHolder.options.difficulty,
        ).decayMultiplier;
        const storage = getStorageService(this);
        decayInventories(this.store.entities(), this.bus, (entity): DecayModifiers => ({
          zoneModifierMilli: storage.decayModifierMilli(entity),
          difficultyDecayMilli,
        }));
      },
    });
    this.registerSystem({
      id: "entities.removal",
      slot: TickSlot.Removal,
      run: () => {
        for (const entity of this.store.flushDeletions()) {
          if (entity.components["Position"] !== undefined) {
            try {
              this.maps.removeEntity(entity.id);
            } catch (failure) {
              if (!(failure instanceof MapError) || failure.kind !== MapErrorKind.UnknownOccupant) {
                throw failure;
              }
            }
          }
          clearReferencesTo(this.store, this.relationships, entity.id);
        }
      },
    });
    // Identity first: its before-delete hook must read the offices of a deleted leader before the
    // factions hook empties `leaderId`.
    registerIdentity(this);
    registerFactions(this);
    registerSkills(this);
    registerAi(this);
    registerJobs(this);
    registerCrier(this);
    registerStorage(this);
    registerZones(this);
    registerProduction(this);
    registerConstruction(this);
    registerGathering(this);
    registerTrade(this);
    registerDiplomacy(this);
    registerSettlement(this);
    registerStatus(this);
    registerHousing(this);
    this.registerSystem({
      id: "world.starting-map",
      dependencies: [
        skillsSystemId,
        factionsSystemId,
        identitySystemId,
        aiSystemId,
        jobsSystemId,
        storageSystemId,
        zonesSystemId,
      ],
      init: ({ engine, mode, options }) => {
        if (mode !== InitMode.NewGame || options.mapSize === null) {
          return;
        }
        generateWorld(engine, options.mapSize, options.seed);
      },
    });
  }

  private prepare(): void {
    this.systems.resolveOrder();
    if (!this.prototypesLoaded) {
      try {
        this.content.registerPrototypes(new PrototypeRegistry(this.components));
        this.content.registerPrototypes(this.prototypes);
      } catch (failure) {
        if (failure instanceof EcsError) {
          throw new ContentValidationError([
            {
              file: ContentFile.EnginePrototypes,
              id: null,
              field: "components",
              message: `${failure.message} (register the component through GameEngine.registerSystem first)`,
            },
          ]);
        }
        throw failure;
      }
      this.prototypesLoaded = true;
    }
    if (!this.treesLoaded) {
      try {
        this.behaviorTrees.registerAll(
          this.content.behaviorTrees.all().map((tree) => structuredClone(tree)),
        );
        this.treesLoaded = true;
        this.warnings.length = 0;
      } catch (failure) {
        if (!(failure instanceof BehaviorError)) {
          throw failure;
        }
        const note = `behavior trees not loaded yet: ${failure.message}`;
        if (!this.warnings.includes(note)) {
          this.warnings.push(note);
        }
      }
    }
  }

  private requireGovernmentPrototype(): void {
    if (!this.prototypes.has(governmentFactionPrototypeId)) {
      throw new ContentValidationError([
        {
          file: ContentFile.EnginePrototypes,
          id: governmentFactionPrototypeId,
          field: "id",
          message: governmentIssueMessage,
        },
      ]);
    }
  }

  private resetWorld(prng: Prng, options: InitOptionsData): void {
    this.counters.restore(new IdCounters().serialize());
    this.time.restore(new GameTime().serialize());
    this.prngHolder.prng = prng;
    this.bus.restore({ queue: [] });
    this.store.restore({ entities: [] });
    this.maps.restore([]);
    this.maps.rebuildOccupants([]);
    this.tasks.rebuildWaitIndex();
    this.initHolder.options = options;
    for (const section of this.sections.list()) {
      const initial = this.sectionInitial.get(this.sectionName(section));
      if (initial !== undefined) {
        section.restore(cloneJson(initial));
      }
    }
  }

  private recover(backup: string | null): void {
    if (backup === null) {
      this.resetWorld(Prng.create({ seed: 0 }), emptyInitOptions());
      this.gameActive = false;
      return;
    }
    loadGameParts(backup, this.parts, { migrations: this.deps.migrations });
    this.systems.runInit({
      engine: this,
      mode: InitMode.LoadGame,
      options: this.initHolder.options,
    });
  }
}
