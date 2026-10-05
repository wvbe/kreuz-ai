# Feature Specification: GameEngine Bootstrap

**Created**: 2026-05-02
**Input**: User description: "The game engine bootstrap feature. I want it to be easy to start different kinds of games, and rely on procedurally generated content."

## User Scenarios & Testing

### User Story 1 - Bootstrap and Start a New Game (Priority: P1)

A game engine can be bootstrapped to start a fresh game by calling `GameEngine.newGame(options)`, which initializes the core game loop, creates an entity collection holding only the player government faction (FR-002), starts with zero elapsed game time, and is ready to accept commands. The method accepts optional initialization parameters (difficulty, map size, starting entity counts, PRNG seed) and returns an idle GameEngine instance, ready to tick (FR-001).

**Why this priority**: Core mechanic—without bootstrap, no way to start a game at all. Blocking all gameplay features.

**Independent Test**: Can be fully tested headlessly by: calling `GameEngine.newGame()` with minimal options, verifying the game loop is ready to tick (it does not run automatically, FR-001), verifying game time is 0 and the entities list holds only the player government faction (FR-002), and verifying the engine accepts tick commands.

**Acceptance Scenarios**:

1. **Given** a new GameEngine bootstrapped with `newGame()`, **When** the engine's game loop is checked, **Then** the loop is initialized and ready to tick; game time is 0.
2. **Given** a new game bootstrapped with options `{ difficulty: Difficulty.Harsh, seed: 12345 }`, **When** the engine is checked, **Then** the seed is passed to the PRNG and difficulty is stored for downstream systems.
3. **Given** a new game with no explicit seed provided, **When** bootstrap runs, **Then** the engine generates a seed exactly once at bootstrap and records it in the game state (`initOptions`); all subsequent randomness derives from it, so the game is reproducible from its save.
4. **Given** an engine running a game, **When** a second `newGame()` call is made, **Then** the previous game state is completely unloaded; only the new game exists in that engine instance.
5. **Given** a new game with initialization parameters, **When** parameters are serialized and saved, **Then** they can be recovered to recreate the same initial conditions.

---

### User Story 2 - Load an Existing Game from a Save (Priority: P1)

A game engine can load a previously saved game by calling `GameEngine.loadGame(save)`, which accepts the GameState JSON (feature 006) as a string or parsed object — reading it from disk or browser storage is the host's job — deserializes all entities and components, restores game time and async tasks, and resumes the game loop from the saved state. The loaded game is fully playable immediately.

**Why this priority**: Companion to new game. Without load, save/load cycle is broken and players lose progress.

**Independent Test**: Can be fully tested headlessly by: saving a game (feature 006), calling `loadGame()` with the saved JSON, verifying entities/components/game time match the pre-save state, and verifying the game loop continues from the saved state.

**Acceptance Scenarios**:

1. **Given** a saved game (from feature 006), **When** `loadGame(save)` is called, **Then** the JSON is parsed and game state is restored.
2. **Given** a loaded game, **When** the game loop advances one tick, **Then** entity behavior resumes deterministically from the saved state.
3. **Given** a load operation on empty or non-JSON input, **When** `loadGame(save)` is called, **Then** an `InvalidSaveFormatError` is raised with a clear message; the current game state is unchanged.
4. **Given** a corrupted or invalid save, **When** `loadGame()` is called, **Then** an `InvalidSaveFormatError` is raised; the engine does not attempt to enter an inconsistent state.
5. **Given** a loaded game from a save, **When** it is saved again, **Then** the new save is identical to the original, excluding the wall-clock `timestamp` metadata (round-trip consistency).

---

### User Story 3 - Configure Initialization Parameters for Different Game Types (Priority: P2)

The `newGame()` method accepts an options object containing initialization parameters: difficulty (`Difficulty` enum: Peaceful, Steady, Harsh; spec 027), map size (`MapSize` enum: Small, Medium, Large), starting entity counts, PRNG seed, and other game configuration. These parameters are passed to systems and map generators to customize the initial game world. Different parameter combinations allow easy creation of varied game scenarios.

**Why this priority**: Enables flexibility and testability. Different game types (sandbox, survival, scenario) can be initialized with different parameters. P2 because a fixed default game (P1) is enough to start playing, but variety is needed before scaling to multiple game types.

**Independent Test**: Can be fully tested by: bootstrapping multiple games with different parameter combinations, verifying each initializes with the correct parameters, verifying parameters affect downstream behavior (e.g., difficulty scales perishable decay, need decay and faction hostility, spec 027), and verifying parameters can be queried after bootstrap.

**Acceptance Scenarios**:

1. **Given** options `{ difficulty: Difficulty.Peaceful, mapSize: MapSize.Small }`, **When** `newGame(options)` is called, **Then** the game is created with peaceful difficulty and a small starting map (generated with the spec 004 map generators, because a map option was given).
2. **Given** a game bootstrapped with `{ seed: 42 }`, **When** the PRNG is queried, **Then** the seed is 42 (verifiable by calling `engine.prng.getSeed()`).
3. **Given** different difficulty levels, **When** games are bootstrapped with each, **Then** perishable decay, need decay and NPC faction hostility are scaled by the difficulty multipliers of spec 027 FR-015; map generation and starting entities are identical across difficulties (spec 027 FR-016).
4. **Given** invalid parameter values (e.g., an unknown difficulty value such as `"impossible"` arriving from untyped input), **When** `newGame()` is called, **Then** validation rejects with a clear error message.
5. **Given** a parameter-heavy options object, **When** `newGame()` is called and the game is saved, **Then** parameters are preserved in the GameState so the game can be resumed with identical initialization context.

---

### User Story 4 - Validate Initialization Parameters Before Starting (Priority: P1)

All initialization parameters are validated at bootstrap time. Invalid or missing critical parameters are rejected with clear error messages, preventing silent failures or undefined behavior. Validation uses a schema-based approach (e.g., Zod) to provide structured, debuggable errors.

**Why this priority**: Prevents cryptic failures during game startup. Invalid parameters must be caught early, not during gameplay when state is inconsistent. Blocking P1 for reliability.

**Independent Test**: Can be fully tested by: providing valid and invalid parameter combinations, verifying valid ones pass and invalid ones reject, and verifying error messages are clear enough for a developer to fix the issue.

**Acceptance Scenarios**:

1. **Given** parameters with a valid difficulty value (e.g., `Difficulty.Harsh`), **When** validated, **Then** validation passes.
2. **Given** parameters with an invalid difficulty value (e.g., "super-hard"), **When** validated, **Then** validation rejects with error message: "Invalid difficulty: 'super-hard'. Valid values: peaceful, steady, harsh."
3. **Given** parameters with missing required fields (if any are required), **When** validated, **Then** validation fails with a message listing which fields are missing.
4. **Given** parameters with the wrong data type (e.g., `mapSize: 123` instead of `MapSize.Large`), **When** validated, **Then** validation rejects with a type error.
5. **Given** valid parameters, **When** validation completes successfully, **Then** parameters are guaranteed to be usable by downstream systems without re-validation.

---

### User Story 5 - Support Headless Game Engine Startup (Priority: P1)

The bootstrap process supports pure headless operation: no renderer, no UI, no window initialization required. A game engine can be started in a Node.js environment or a test harness, with no host APIs beyond the JavaScript runtime (any file I/O is done by the host, not the engine). This enables deterministic testing, automated scenario validation, and server-side simulation.

**Why this priority**: Critical to Constitution Principle III (Headless-First). Without headless bootstrap, cannot test game logic independently of rendering. Blocking.

**Independent Test**: Can be fully tested by: calling `newGame()` in a headless environment (Node.js CLI, test runner), verifying the game loop runs without attempting to access any rendering APIs or window objects, and verifying the game state can be inspected and manipulated via the engine's public API.

**Acceptance Scenarios**:

1. **Given** a headless Node.js environment with no window object, **When** `newGame()` is called, **Then** the game initializes successfully without errors.
2. **Given** a bootstrapped game in headless mode, **When** the game is ticked multiple times, **Then** entity behavior executes correctly and game state evolves deterministically.
3. **Given** a headless game, **When** state is queried via the engine API (e.g., `engine.getEntities()`, `engine.getGameTime()`), **Then** complete state is returned without any rendering dependencies.
4. **Given** a headless game, **When** it is saved, **Then** the save output (JSON string/object) can be written to disk by the host and loaded in a different headless session.
5. **Given** a headless game, **When** it is run side by side with another headless game (a separate engine instance in the same process), **Then** both run independently with no cross-contamination of game state.

---

### Edge Cases

- What happens if `newGame()` is called while a game is already running? → Previous game is completely unloaded; new game starts fresh. Previous game state in memory is released.
- What happens if `loadGame()` is called while a game is running? → Similar to newGame; previous game is unloaded, new game is loaded.
- What happens if a PRNG seed is not provided? → The engine generates a seed exactly once at bootstrap and records it in the game state (`initOptions`, and therefore every save); thereafter all randomness derives from it. This is the constitution's only permitted non-deterministic input.
- What happens if initialization parameters include unknown fields (forward compatibility)? → Validation ignores unknown fields gracefully (allows old save files to be loaded by newer engines without error).
- What happens if the engine's memory is exhausted during bootstrap? → Bootstrap fails with an `OutOfMemoryError` before entering an inconsistent state; any partially-initialized state is rolled back.
- What happens if two callers call `newGame()` simultaneously (concurrency)? → JavaScript is single-threaded, so calls on one engine instance are sequential: the later call replaces the earlier game (FR-003). Separate engine instances each hold their own game and never contend.

## Requirements

### Functional Requirements

- **FR-001**: GameEngine MUST expose a `newGame(options?)` method that initializes and starts a fresh game with the provided parameters or sensible defaults. The method returns an idle engine instance ready to accept `tick()` calls; the game loop does NOT run automatically.
- **FR-002**: `newGame()` MUST initialize the game loop infrastructure, set game time to 0, create an entity collection holding exactly one entity — the player government faction (spec 021 FR-002), carrying `SettlementProgress` (spec 027 FR-002) and `SettlementChronicle` (spec 028 FR-018) — and return the engine. Bootstrap creates no other entities. Caller MUST explicitly call `engine.tick()` to advance the game loop; bootstrap does not start automatic ticking.
- **FR-003**: `newGame()` MUST completely unload any previously running game before starting the new game (no state leakage).
- **FR-004**: GameEngine MUST expose a `loadGame(save)` method that loads a saved game from its JSON (string or parsed object) and resumes from that state. The engine performs no file I/O; the host reads the save. The engine returns idle; caller must call `engine.tick()` to resume gameplay.
- **FR-005**: `loadGame()` MUST parse the GameState JSON (feature 006), deserialize all entities and components, restore game time, and restore async task state.
- **FR-006**: `loadGame()` MUST reject with a typed error if the input is not valid JSON, fails validation, or is from a newer save-format version (older versions are migrated, feature 006).
- **FR-007**: Bootstrap MUST accept initialization parameters as an options object, including: `difficulty` (enum `Difficulty`: Peaceful, Steady, Harsh; default Steady; multipliers per spec 027 FR-013–FR-016), `startingTier` (optional `SettlementTier`, default Hamlet, spec 027 FR-022), `mapSize` (enum `MapSize`: Small, Medium, Large), `seed` (optional integer for PRNG), and other game-specific parameters.
- **FR-008**: If no PRNG seed is provided, bootstrap MUST generate one exactly once and record it in `initOptions` in the game state (and therefore in every save); thereafter all randomness derives from it (constitution seed carve-out).
- **FR-009**: Bootstrap MUST pass the PRNG seed to the game engine's PRNG system (feature 011) before starting the game loop.
- **FR-010**: Bootstrap MUST validate all initialization parameters against a schema (using Zod or equivalent) and reject invalid parameters with clear error messages before creating the game.
- **FR-011**: Bootstrap MUST support headless operation: no window, no renderer, no UI initialization required. Game loop and entity state must work in any environment (Node.js, test runner, CLI).
- **FR-012**: Initialization parameters MUST be serializable to JSON and stored in GameState (feature 006) so that a resumed game can be queried for its initialization context.
- **FR-013**: Bootstrap MUST not require external systems to be pre-initialized; the engine MUST initialize only what is necessary for the game loop and entity/component system to function (prototypes/materials registry must be pre-registered separately, out of scope).
- **FR-014**: Multiple `newGame()` or `loadGame()` calls in sequence MUST each cleanly transition from the previous game state without memory leaks or state residue.
- **FR-015**: Bootstrap MUST expose a system initialization hook allowing systems to register initialization functions with dependency declarations. Bootstrap topologically sorts registered functions and executes them in dependency order. If a system declares a dependency that doesn't exist, bootstrap rejects with a clear error.
- **FR-016**: After `newGame()` returns, GameEngine MUST expose query methods: `getEntities()`, `getState()`, `getTime()`, `getEntityAt(id)`, `getMap(id)`, `getComponents(entityId)` to allow systems and external code to query the initialized game state.
- **FR-017**: If a required prototype (e.g., 'Citizen') is not registered before `newGame()` is called, bootstrap MUST start the game anyway (no validation); failure occurs at runtime when code attempts to instantiate the missing prototype.

### Key Entities

- **GameEngine**: Main bootstrap and runtime orchestrator. Exposes `newGame()`, `loadGame()`, `tick()`, and query methods (`getEntities()`, `getState()`, `getTime()`, `getEntityAt()`, `getMap()`, `getComponents()`). Maintains the current game instance, game state, and game loop infrastructure. Does NOT auto-tick; caller drives the loop via `tick()`.
- **GameInitOptions**: Options object passed to `newGame()`, containing difficulty, starting tier, map size, seed, and other parameters. Validated and stored in GameState.
- **GameState**: Serializable root container (from feature 006) that includes initialization parameters so resumed games know their starting context.
- **SystemRegistry**: Hook system allowing systems to register initialization functions with dependencies. Bootstrap topologically sorts and executes registered functions in dependency order.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A headless game can be bootstrapped and returned idle in under 100ms (cold startup time, not including manual `tick()` calls).
- **SC-002**: Invalid initialization parameters are detected and rejected with error messages within 50ms (validation performance).
- **SC-003**: A game can be saved and loaded with identical initialization parameters (deterministic resume).
- **SC-004**: After `newGame()`, the game loop infrastructure is ready and `engine.tick()` can be called immediately to start simulation (no async delays).
- **SC-005**: Switching from one game to another via consecutive `newGame()` calls does not leak memory or leave orphaned state (verified by memory profiling across multiple transitions).
- **SC-006**: Headless games run in any JavaScript environment (Node.js, Deno, browsers, etc.) without requiring native modules, file system access, or OS-specific dependencies; file I/O for saves is done by the host.
- **SC-007**: Query methods (`getEntities()`, `getState()`, etc.) return results in under 5ms even with 1000+ entities (direct access, no iteration overhead).
- **SC-008**: System initialization hooks can declare dependencies; bootstrap topologically sorts and executes in correct order. A cycle in dependencies is detected and rejected with clear error.

## Assumptions

- **Prototypes and materials registry are pre-registered**: Bootstrap assumes that entity prototypes (Citizen, Tree, Building, etc.) and the materials registry are already loaded and registered before `newGame()` is called. Bootstrap does NOT validate that required prototypes exist; it starts the game and fails at runtime if code attempts to instantiate a missing prototype. This is out of scope for bootstrap; it's a separate dependency.
- **PRNG system exists and is injectable**: Bootstrap assumes the PRNG system (feature 011) exists and can accept a seed at initialization time. Bootstrap will pass the seed but does not implement PRNG itself.
- **Map generation is separate**: Procedural map generation is a separate feature (spec 004; out of scope here per user clarification). Bootstrap initializes the engine; when map options such as `mapSize` are given, `newGame()` creates a starting map by calling the spec 004 generators; otherwise map creation is left to downstream systems after bootstrap.
- **Synchronous initialization**: Bootstrap completes synchronously and returns an idle engine (ready to tick) immediately. Async initialization (e.g., loading large config files) is not in scope; all data is assumed to be in-memory.
- **Game loop infrastructure is ready, but not ticking**: Bootstrap does NOT start the game loop automatically. After `newGame()` returns, the caller must explicitly call `engine.tick()` to advance simulation. This allows precise control over timing and integration with host event loops.
- **Event system exists**: Bootstrap assumes an event system (feature 010) is available to emit `game.started` and `game.loaded` events; bootstrap calls into the event system but does not implement it.
- **One active game per engine instance**: Each GameEngine instance holds one active game at a time. Multiple independent engine instances may coexist in the same process (e.g., headless tests running games side by side); they share no mutable game state.
- **Zod validation library available**: Validation uses Zod (or equivalent schema validation library). If not available, a minimal custom validator is acceptable.
- **Bare-minimum defaults**: When `newGame()` is called with no options or minimal options, bootstrap creates an empty game state with no map (a starting map is created only when map options such as `mapSize` are given), no entities other than the player government faction (FR-002), and systems holding only empty state (their init hooks have run, see System initialization hooks). Caller/systems are responsible for populating the world post-bootstrap.
- **System initialization hooks**: Systems register init functions with a dependency system. Bootstrap builds a dependency graph, detects cycles, and executes in topological order. Init functions run synchronously before bootstrap returns.
- **Manual ticking model**: The caller owns the game loop. Bootstrap returns an idle engine; caller controls when `tick()` is called and at what frequency. This enables integration with any event loop (browser, Node.js, game framework).

## Clarifications

### Session 2026-05-02

- Q: How does the game loop execution model work after bootstrap? → A: Manual ticking. `newGame()` returns an idle engine instance; it does NOT start automatic ticking. The caller owns the game loop and must explicitly call `engine.tick()` in a loop. This enables precise control and integration with any host event loop (browser, Node.js timers, game framework).
- Q: How should multiple systems coordinate during bootstrap initialization? → A: Dependency-aware system registry. Systems register initialization functions with dependency declarations. Bootstrap topologically sorts all registered init functions by their declared dependencies, detects cycles, and executes them in dependency order. If a dependency is not found, bootstrap rejects with a clear error before starting the game.
- Q: Should bootstrap validate that required prototypes are registered? → A: No validation at bootstrap time. Bootstrap assumes prototypes are pre-registered and starts the game. If code later attempts to instantiate a missing prototype, it fails at runtime. No fail-fast check during bootstrap.
- Q: What should default behavior be for `newGame()` with minimal parameters? → A: Bare minimum. No map (unless map options such as `mapSize` are given, in which case a starting map is created with the spec 004 generators), no entities except the player government faction (FR-002; it holds settlement progress and the chronicle), systems holding only empty state (init hooks run, but no system populates the world). Caller and downstream systems are responsible for populating the world (creating maps, spawning entities, etc.) after bootstrap returns.
- Q: What should the GameEngine's public API surface be for accessing running game state? → A: Rich query API. GameEngine exposes `getEntities()`, `getState()`, `getTime()`, `getEntityAt(id)`, `getMap(id)`, `getComponents(entityId)` for direct state queries. Query methods return results quickly (<5ms) even with 1000+ entities, enabling systems and external code to efficiently inspect game state.
