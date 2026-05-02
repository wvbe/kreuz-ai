# Feature Specification: GameEngine Bootstrap

**Feature Branch**: `007-engine-bootstrap`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "The game engine bootstrap feature. I want it to be easy to start different kinds of games, and rely on procedurally generated content."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Bootstrap and Start a New Game (Priority: P1)

A game engine can be bootstrapped to start a fresh game by calling `GameEngine.newGame(options)`, which initializes the core game loop, creates an empty entity collection, starts with zero elapsed game time, and is ready to accept commands. The method accepts optional initialization parameters (difficulty, map size, starting entity counts, PRNG seed) and returns a running GameEngine instance.

**Why this priority**: Core mechanic—without bootstrap, no way to start a game at all. Blocking all gameplay features.

**Independent Test**: Can be fully tested headlessly by: calling `GameEngine.newGame()` with minimal options, verifying the game loop is running, verifying game time is 0 and entities list is empty, and verifying the engine accepts tick commands.

**Acceptance Scenarios**:

1. **Given** a new GameEngine bootstrapped with `newGame()`, **When** the engine's game loop is checked, **Then** the loop is initialized and ready to tick; game time is 0.
2. **Given** a new game bootstrapped with options `{ difficulty: "hard", seed: 12345 }`, **When** the engine is checked, **Then** the seed is passed to the PRNG and difficulty is stored for downstream systems.
3. **Given** a new game with no explicit seed provided, **When** bootstrap runs, **Then** a random seed is generated (or timestamp-based) and logged for reproducibility.
4. **Given** an engine running a game, **When** a second `newGame()` call is made, **Then** the previous game state is completely unloaded; only the new game exists in memory.
5. **Given** a new game with initialization parameters, **When** parameters are serialized and saved, **Then** they can be recovered to recreate the same initial conditions.

---

### User Story 2 - Load an Existing Game from Save File (Priority: P1)

A game engine can load a previously saved game by calling `GameEngine.loadGame(filePath)`, which parses the GameState JSON from disk, deserializes all entities and components, restores game time and async tasks, and resumes the game loop from the saved state. The loaded game is fully playable immediately.

**Why this priority**: Companion to new game. Without load, save/load cycle is broken and players lose progress.

**Independent Test**: Can be fully tested headlessly by: saving a game (feature 006), calling `loadGame()` with the save file path, verifying entities/components/game time match the pre-save state, and verifying the game loop continues from the saved state.

**Acceptance Scenarios**:

1. **Given** a saved game file (from feature 006), **When** `loadGame(filePath)` is called, **Then** the file is parsed and game state is restored.
2. **Given** a loaded game, **When** the game loop advances one tick, **Then** entity behavior resumes deterministically from the saved state.
3. **Given** a load operation on a nonexistent file, **When** `loadGame(filePath)` is called, **Then** a `FileNotFoundError` is raised with a clear message; the current game state is unchanged.
4. **Given** a corrupted or invalid save file, **When** `loadGame()` is called, **Then** an `InvalidSaveFormatError` is raised; the engine does not attempt to enter an inconsistent state.
5. **Given** a loaded game from a save file, **When** it is saved again, **Then** the new save is identical to the original (round-trip consistency).

---

### User Story 3 - Configure Initialization Parameters for Different Game Types (Priority: P2)

The `newGame()` method accepts an options object containing initialization parameters: difficulty (Peaceful, Normal, Hard), map size (Small, Medium, Large), starting entity counts, PRNG seed, and other game configuration. These parameters are passed to systems and map generators to customize the initial game world. Different parameter combinations allow easy creation of varied game scenarios.

**Why this priority**: Enables flexibility and testability. Different game types (sandbox, survival, scenario) can be initialized with different parameters. P2 because a fixed default game (P1) can run a POC, but variety is needed before scaling to multiple game types.

**Independent Test**: Can be fully tested by: bootstrapping multiple games with different parameter combinations, verifying each initializes with the correct parameters, verifying parameters affect downstream behavior (e.g., difficulty affects resource availability if a resource system exists), and verifying parameters can be queried after bootstrap.

**Acceptance Scenarios**:

1. **Given** options `{ difficulty: "peaceful", mapSize: "small" }`, **When** `newGame(options)` is called, **Then** the game is created with peaceful difficulty and a small starting map.
2. **Given** a game bootstrapped with `{ seed: 42 }`, **When** the PRNG is queried, **Then** the seed is 42 (verifiable by calling `engine.prng.getSeed()`).
3. **Given** different difficulty levels, **When** games are bootstrapped with each, **Then** downstream systems (e.g., resource scarcity, citizen spawn rate) reflect the difficulty setting.
4. **Given** invalid parameter values (e.g., `difficulty: "impossible"`), **When** `newGame()` is called, **Then** validation rejects with a clear error message.
5. **Given** a parameter-heavy options object, **When** `newGame()` is called and the game is saved, **Then** parameters are preserved in the GameState so the game can be resumed with identical initialization context.

---

### User Story 4 - Validate Initialization Parameters Before Starting (Priority: P1)

All initialization parameters are validated at bootstrap time. Invalid or missing critical parameters are rejected with clear error messages, preventing silent failures or undefined behavior. Validation uses a schema-based approach (e.g., Zod) to provide structured, debuggable errors.

**Why this priority**: Prevents cryptic failures during game startup. Invalid parameters must be caught early, not during gameplay when state is inconsistent. Blocking P1 for reliability.

**Independent Test**: Can be fully tested by: providing valid and invalid parameter combinations, verifying valid ones pass and invalid ones reject, and verifying error messages are clear enough for a developer to fix the issue.

**Acceptance Scenarios**:

1. **Given** parameters with a valid difficulty value (e.g., "hard"), **When** validated, **Then** validation passes.
2. **Given** parameters with an invalid difficulty value (e.g., "super-hard"), **When** validated, **Then** validation rejects with error message: "Invalid difficulty: 'super-hard'. Valid values: peaceful, normal, hard."
3. **Given** parameters with missing required fields (if any are required), **When** validated, **Then** validation fails with a message listing which fields are missing.
4. **Given** parameters with the wrong data type (e.g., `mapSize: 123` instead of `"large"`), **When** validated, **Then** validation rejects with a type error.
5. **Given** valid parameters, **When** validation completes successfully, **Then** parameters are guaranteed to be usable by downstream systems without re-validation.

---

### User Story 5 - Support Headless Game Engine Startup (Priority: P1)

The bootstrap process supports pure headless operation: no renderer, no UI, no window initialization required. A game engine can be started in a Node.js environment or a test harness, with only standard I/O and file system access. This enables deterministic testing, automated scenario validation, and server-side simulation.

**Why this priority**: Critical to Constitution Principle III (Headless-First). Without headless bootstrap, cannot test game logic independently of rendering. Blocking.

**Independent Test**: Can be fully tested by: calling `newGame()` in a headless environment (Node.js CLI, test runner), verifying the game loop runs without attempting to access any rendering APIs or window objects, and verifying the game state can be inspected and manipulated via the engine's public API.

**Acceptance Scenarios**:

1. **Given** a headless Node.js environment with no window object, **When** `newGame()` is called, **Then** the game initializes successfully without errors.
2. **Given** a bootstrapped game in headless mode, **When** the game is ticked multiple times, **Then** entity behavior executes correctly and game state evolves deterministically.
3. **Given** a headless game, **When** state is queried via the engine API (e.g., `engine.getEntities()`, `engine.getGameTime()`), **Then** complete state is returned without any rendering dependencies.
4. **Given** a headless game, **When** it is saved, **Then** the save file is written to disk and can be loaded in a different headless session.
5. **Given** a headless game, **When** it is run in parallel with another headless game, **Then** both run independently with no cross-contamination of game state.

---

### Edge Cases

- What happens if `newGame()` is called while a game is already running? → Previous game is completely unloaded; new game starts fresh. Previous game state in memory is released.
- What happens if `loadGame()` is called while a game is running? → Similar to newGame; previous game is unloaded, new game is loaded.
- What happens if a PRNG seed is not provided? → Engine generates a seed automatically (timestamp-based or cryptographic random) and stores it for reproducibility.
- What happens if initialization parameters include unknown fields (forward compatibility)? → Validation ignores unknown fields gracefully (allows old save files to be loaded by newer engines without error).
- What happens if the engine's memory is exhausted during bootstrap? → Bootstrap fails with an `OutOfMemoryError` before entering an inconsistent state; any partially-initialized state is rolled back.
- What happens if two threads call `newGame()` simultaneously (concurrency)? → Only one thread's game starts; the other either queues or rejects with a `GameAlreadyRunningError` (implementation detail, but must be safe).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: GameEngine MUST expose a `newGame(options?)` method that initializes and starts a fresh game with the provided parameters or sensible defaults.
- **FR-002**: `newGame()` MUST initialize the game loop, set game time to 0, create an empty entity collection, and return a running engine instance.
- **FR-003**: `newGame()` MUST completely unload any previously running game before starting the new game (no state leakage).
- **FR-004**: GameEngine MUST expose a `loadGame(filePath)` method that loads a saved game from a JSON file and resumes from that state.
- **FR-005**: `loadGame()` MUST parse the GameState JSON (feature 006), deserialize all entities and components, restore game time, and restore async task state.
- **FR-006**: `loadGame()` MUST reject with a typed error if the file does not exist, is not valid JSON, or has an incompatible version.
- **FR-007**: Bootstrap MUST accept initialization parameters as an options object, including: `difficulty` (string: "peaceful" | "normal" | "hard"), `mapSize` (string: "small" | "medium" | "large"), `seed` (optional integer for PRNG), and other game-specific parameters.
- **FR-008**: If no PRNG seed is provided, bootstrap MUST generate one automatically and store it for reproducibility.
- **FR-009**: Bootstrap MUST pass the PRNG seed to the game engine's PRNG system (feature A2) before starting the game loop.
- **FR-010**: Bootstrap MUST validate all initialization parameters against a schema (using Zod or equivalent) and reject invalid parameters with clear error messages before creating the game.
- **FR-011**: Bootstrap MUST support headless operation: no window, no renderer, no UI initialization required. Game loop and entity state must work in any environment (Node.js, test runner, CLI).
- **FR-012**: Initialization parameters MUST be serializable to JSON and stored in GameState (feature 006) so that a resumed game can be queried for its initialization context.
- **FR-013**: Bootstrap MUST not require external systems to be pre-initialized; the engine MUST initialize only what is necessary for the game loop and entity/component system to function (prototypes/materials registry must be pre-registered separately, out of scope).
- **FR-014**: Multiple `newGame()` or `loadGame()` calls in sequence MUST each cleanly transition from the previous game state without memory leaks or state residue.

### Key Entities

- **GameEngine**: Main bootstrap and runtime orchestrator. Exposes `newGame()`, `loadGame()`, and accessor methods for querying game state. Maintains the running game instance and game loop.
- **GameInitOptions**: Options object passed to `newGame()`, containing difficulty, map size, seed, and other parameters. Validated and stored in GameState.
- **GameState**: Serializable root container (from feature 006) that includes initialization parameters so resumed games know their starting context.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A headless game can be bootstrapped and started in under 100ms (cold startup time).
- **SC-002**: Invalid initialization parameters are detected and rejected with error messages within 50ms (validation performance).
- **SC-003**: A game can be saved and loaded with identical initialization parameters (deterministic resume).
- **SC-004**: After `newGame()`, the game loop is running and accepts tick commands immediately (no async initialization delays).
- **SC-005**: Switching from one game to another via consecutive `newGame()` calls does not leak memory or leave orphaned state (verified by memory profiling across multiple transitions).
- **SC-006**: Headless games run in any environment with standard file I/O (Node.js, Deno, browsers with FileAPI, etc.) without requiring native modules or OS-specific dependencies.

## Assumptions

- **Prototypes and materials registry are pre-registered**: Bootstrap assumes that entity prototypes (Citizen, Tree, Building, etc.) and the materials registry are already loaded and registered before `newGame()` is called. This is out of scope for bootstrap; it's a separate dependency.
- **PRNG system exists and is injectable**: Bootstrap assumes the PRNG system (feature A2) exists and can accept a seed at initialization time. Bootstrap will pass the seed but does not implement PRNG itself.
- **Map generation is separate**: Procedural map generation is a separate feature (out of scope per user clarification). Bootstrap initializes the engine; map generation happens in a downstream system (called after bootstrap).
- **Synchronous initialization**: Bootstrap completes synchronously and returns a running engine immediately. Async initialization (e.g., loading large config files) is not in scope for POC; all data is assumed to be in-memory.
- **Game loop is already implemented**: Bootstrap assumes the game loop (feature 001) is already implemented and can be started by bootstrap. Bootstrap calls into the game loop but does not implement it.
- **Event system exists**: Bootstrap assumes an event system (feature A4) is available to emit "game started" and "game loaded" events; bootstrap calls into the event system but does not implement it.
- **Single active game at a time**: For POC, bootstrap assumes only one game can run at a time. Support for multiple concurrent game instances is not in scope.
- **Zod validation library available**: Validation uses Zod (or equivalent schema validation library). If not available, a minimal custom validator is acceptable.

## Clarifications

**Q1 - Registry pre-registration**: Are prototypes and materials assumed to be loaded before bootstrap, or should bootstrap attempt to load them?
**Answer**: Pre-registered. Bootstrap is minimal and does not load external configs. Systems must register prototypes and materials before calling `newGame()`.

**Q2 - Map generation timing**: Should bootstrap generate the initial map, or is that a separate step?
**Answer**: Separate step. Map generation is out of scope for bootstrap. After `newGame()` completes, downstream systems (map generator) create the initial map.

**Q3 - Initialization parameters**: Should parameters be validated at bootstrap time or lazily when systems use them?
**Answer**: At bootstrap time. Validation is eager; invalid parameters are rejected immediately.

**Q4 - Headless operation**: Does "headless" mean the engine must not import any rendering libraries, or just not use them?
**Answer**: Must not import rendering libraries at all. Bootstrap is in core engine; rendering is in a separate module that is not imported by bootstrap.

**Q5 - Previous game cleanup**: Should calling `newGame()` while a game is running trigger any events or callbacks?
**Answer**: Yes, it should emit a "game unload" event before destroying the previous game. Systems can listen to clean up their state.
