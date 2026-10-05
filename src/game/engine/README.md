# src/game/engine

Engine kernel building blocks.

- `Prng.ts` - PCG32 generator with named, persisted streams (spec 011). Integer-only API.
- `EventBus.ts` - typed pub/sub with a FIFO queue drained at the tick boundary (spec 010).
- `TickPipeline.ts` - the single `tick()` primitive. `TickSlot` pins the 21 canonical slots of DECISIONS section 2 (a test compares the enum to that document); systems register with an explicit `{ id, slot, order }`. Slot 0 skips the tick when paused and flushes `tick.begin`, slot 2 advances `GameTime`, slot 20 drains the bus.
- `AutoRunner.ts` - optional real-time driver and the only file in `src/game` allowed to use timers (lint override). All timing goes through an injected `Scheduler`; tests use a fake one.
- `IdCounters.ts` - persisted, never-reused monotonic ID counters (`CounterName` = the root `counters` keys of DECISIONS D-05). IDs start at 1.
- `fixedPoint.ts` - `FixedUnit`, exact `decimalToFixed` for authored decimals, `fixedPointSchema`, `floorDiv/ceilDiv/truncDiv` (spec 006 FR-014).

- `GameEngine.ts` - the per-engine host (spec 007, D-06, D-38): `new GameEngine(content, {entropy?, errorSink?, migrations?})`, instance `newGame(options?)` / `loadGame(save)` / `saveGame()` (`save()` alias) / `tick()` / `runTicks(n)`, query facade (`getTime`, `getState`, `getEntity`, `getEntities`, `getComponents`, `getMap`, all copies) and `registerSystem`. The subsystems are public readonly fields (`bus`, `time`, `store`, `maps`, `tasks`, `taskHandlers`, `behavior`, `behaviorHandlers`, `components`, `prototypes`, `relationships`, `counters`, `pipeline`, `content`, `errors`, `warnings`; `prng` is a getter because load replaces it) for systems and the session facade (1.9); hosts should use the query methods.
- `SystemRegistry.ts` - generic dependency-ordered init registry (topological sort, ties by registration order, `SystemRegistryError` for cycles, missing dependencies, duplicates).
- `engineSystemTypes.ts` - `EngineSystemDefinition`, `SystemInitContext`, `InitMode`, `CommandRegistration` / `CommandMode` / `QueryRegistration` (consumed by the session facade in `../api`, build them with `defineCommand` / `defineQuery`), view types.
- `options.ts` - `GameInitOptions`, `parseGameInitOptions` (Zod, exact messages, `InvalidOptionsError`).
- `GameEngineError.ts`, `SystemRegistryError.ts`, `InvalidOptionsError.ts` - typed errors.

## Registering a system (the one extension point)

Later tasks add behavior with a single call, before the first `newGame` / `loadGame` (or between games):

```ts
engine.registerSystem({
  id: "needs.decay", // unique, dotted lowercase; also the dependency name
  slot: TickSlot.NeedsAndMood, // with `run`
  order: 0, // inside the slot, default 0
  run: (context) => {}, // once per tick
  dependencies: ["world.starting-map"], // init order; may name systems registered later
  init: ({ engine, mode, options }) => {}, // synchronous; NewGame and LoadGame
  components: [needsComponent], // registered with engine.components
  saveSection: { key, location, schema, serialize, restore }, // see ../save
  commandHandlers: { "needs.set": defineCommand({ schema, handler }) }, // see ../api
  queries: { "needs.table": defineQuery({ schema, run }) }, // named views, see ../api
});
```

Everything is validated before anything is changed. `init` runs after the world is reset and the government faction is spawned (`NewGame`: generators go here) or after all saved state is restored (`LoadGame`: rebuild derived indexes). Task handlers, behavior handlers and wait predicates are registered directly on `engine.taskHandlers` / `engine.behaviorHandlers` before the first game. The engine itself registers `task.execution` (slot 6), `inventory.decay` (slot 3), `entities.removal` (slot 17: flush deletions, free map cells, `clearReferencesTo` for every relationship registered on `engine.relationships`) and `world.starting-map` (init; with a `mapSize` it runs the world generator of `../worldgen`: outdoor map, village, iron ore, job board and six settlers). The bus drain at slot 20 belongs to the pipeline.

Prototypes and behavior trees of the content pack are registered on the first game start, after systems had the chance to register components and handlers. Trees whose handlers are not registered yet are skipped with an entry in `engine.warnings` (until task 2.4 registers them).

Depends on `../time` for the clock. Used by every other folder under `src/game`.
