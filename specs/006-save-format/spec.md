# Feature Specification: Game State & Save Format

**Feature Branch**: `006-save-format`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "I want to specify the game state & save format"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Save Game to File (Priority: P1)

A game in progress (entities present, map established, time passed, async tasks in flight) can be serialized to a JSON file. The save contains all entity state, component data, active task state, and game time at the moment the save is triggered. The game engine provides a `save(filePath)` method that atomically writes the state to disk.

**Why this priority**: Core mechanic—without save, no ability to persist progress or test determinism. Every feature depends on this working.

**Independent Test**: Can be fully tested headlessly by: creating a game world with entities, advancing game time, modifying entity state (inventory changes, position movement, task assignment), calling `save(filePath)`, and verifying the resulting JSON file contains all expected state.

**Acceptance Scenarios**:

1. **Given** a running game with 3 citizens, 1 map, 100 ticks of game time, **When** `save("game.json")` is called, **Then** a file is created with JSON root containing `version`, `timestamp`, `entities`, `maps`, and `gameTime`.
2. **Given** a citizen with an in-flight trade task (async operation pending), **When** `save()` is called mid-trade, **Then** the task state, including promise state and cancellation token, is serialized.
3. **Given** multiple inventory mutations and map transitions queued during a single tick, **When** `save()` is called, **Then** all state is captured atomically (no partial writes, no inconsistencies).
4. **Given** a JSON save file, **When** read as UTF-8 text, **Then** it is valid JSON and can be parsed without errors.
5. **Given** any game state, **When** serialized and deserialized, **Then** the deserialized game is identical to the original (bit-for-bit for JSON values, structural equivalence for object graphs).

---

### User Story 2 - Load Game from File (Priority: P1)

A saved game file can be loaded back into memory and the game resumes from exactly the state at which it was saved. All entities, components, async tasks, and game time are restored. The game engine provides a `load(filePath)` method that parses the JSON and rebuilds the full game state, including re-establishing task queue subscriptions and cancellation token listeners.

**Why this priority**: Companion to save. Without load, saves are useless. Blocking all further features until save/load work correctly.

**Independent Test**: Can be fully tested headlessly by: creating a game, saving it, calling `load()`, and verifying the loaded game state matches the saved state via deep equality check on entities, components, and game time.

**Acceptance Scenarios**:

1. **Given** a saved game file with version field, **When** `load("game.json")` is called, **Then** the file is parsed, version is validated (matches current schema), and game state is rebuilt.
2. **Given** a loaded game with entities at specific coordinates and inventory states, **When** the game loop advances one tick, **Then** all entities behave identically to the saved tick cycle (deterministic resume).
3. **Given** a task in flight (async operation) at save time, **When** the game is loaded and the tick cycle continues, **Then** the task resumes at the same state and resolves when expected.
4. **Given** a save file from a previous game session, **When** loaded, **Then** all entity IDs, component instances, and relationships are preserved without collision or duplication.
5. **Given** a load operation, **When** the file does not exist or is corrupted, **Then** the engine rejects with a clear error (`FileNotFoundError` or `InvalidSaveFormatError`) and does not enter an inconsistent state.

---

### User Story 3 - Determine Save Format Version and Compatibility (Priority: P2)

The JSON save file includes a version field that indicates the schema version. When a save is loaded, the engine checks the version and determines whether the file can be loaded as-is or requires migration. If migration is needed, a migration pathway exists (future feature); if not supported, the load is rejected.

**Why this priority**: Allows safe schema evolution. As features are added (new components, new entity types, game time precision changes), saves from earlier versions can be migrated rather than becoming obsolete. P2 because it's essential for long-term gameplay but not blocking initial POC.

**Independent Test**: Can be fully tested by: saving a game at current version, manually editing the version number to a future/past version, attempting to load, and verifying the engine detects the version mismatch and responds appropriately (rejects or invokes migration).

**Acceptance Scenarios**:

1. **Given** a save file with `"version": 1`, **When** loaded by an engine expecting version 1, **Then** load succeeds without errors.
2. **Given** a save file with `"version": 0` (earlier schema), **When** loaded by an engine at version 1, **Then** the engine rejects with a clear message indicating that downgrade is not supported.
3. **Given** a save file with `"version": 2` (future schema), **When** loaded by an engine at version 1, **Then** the engine rejects with a message indicating the save is from a newer version and cannot be loaded.
4. **Given** the need to add a new field to component state, **When** a migration is implemented and activated, **Then** saves from previous versions are loaded correctly with the new field set to a sensible default.

---

### User Story 4 - Verify Deterministic Game State Round-Trip (Priority: P1)

After save and load, the game state must be deterministic: advancing the loaded game by N ticks must produce the exact same world state as if the game had never been saved. This validates that the save/load cycle introduces no information loss and that PRNG seed, entity state, and async task state are all faithfully preserved.

**Why this priority**: Critical to Constitution Principle II (Deterministic State). Without deterministic round-trip, saves are unreliable for scenario testing and multiplayer sync. Blocking.

**Independent Test**: Can be fully tested by: creating a game, running it for 10 ticks, saving, resetting game instance, loading, running 10 more ticks, and comparing final state (positions, inventories, task outcomes) to a reference game that was never saved. Both should be identical.

**Acceptance Scenarios**:

1. **Given** a game running for N ticks without interruption, **When** final state is captured, **Then** call it S_original.
2. **Given** the same initial game state, **When** run for M ticks, saved, loaded, then run for N-M ticks, **Then** final state S_loaded = S_original (bit-for-bit equivalence for all values).
3. **Given** PRNG in the saved state with a specific seed, **When** the game resumes and calls PRNG for random values, **Then** random sequence matches pre-save prediction (deterministic continuation).
4. **Given** an async task mid-flight at save time, **When** the game resumes and the task completes, **Then** task result is identical to what it would have been if never saved (no state loss, no re-randomization).

---

### Edge Cases

- What happens if `save()` is called while the game loop is still processing a tick? → Save must either block until tick completes, or must preserve the tick state atomically without partial updates.
- What happens if `load()` encounters a partial/corrupted JSON file (valid start, truncated end)? → Load rejects with a parse error; game state is not corrupted.
- What happens if an entity is deleted during the save window (concurrency)? → Save captures the state at invocation; deletions after invocation are not included.
- What happens if two entities have circular component references (A depends on B, B depends on A)? → JSON graph is acyclic (entities reference each other by ID, not direct object inclusion); circular references serialize correctly.
- What happens if the file system runs out of space during `save()`? → Engine detects write failure and rejects with `DiskFullError`; previous save file (if any) remains intact.
- What happens if game time is a very large number (e.g., 1 million ticks \* 5 minutes = years of game time)? → JSON number precision is preserved (no float overflow); time field remains accurate.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: GameState MUST be a JSON object with a `version` field (integer) at the root, indicating the save format schema version.
- **FR-002**: GameState root MUST include an `entities` array, where each entity is a JSON object with `id`, `prototype`, and `components` (nested by component name).
- **FR-003**: GameState root MUST include a `maps` array, where each map contains map ID, terrain data (grid), entity positions, and transition state.
- **FR-004**: GameState root MUST include a `gameTime` field (integer) representing elapsed game ticks since game start.
- **FR-005**: Each entity in `entities` MUST serialize all component state (inventory contents, position, health, etc.) as properties under `components.{ComponentName}`.
- **FR-006**: GameState MUST include a `timestamp` field (ISO 8601 string) indicating when the save was created (UTC).
- **FR-007**: In-flight async tasks (promises, pending actions) MUST serialize their state, including: task ID, task type, associated entity ID, cancellation token state, and pending promise resolution condition.
- **FR-008**: Serialized cancellation tokens MUST include the reason (e.g., "entity_deleted", "interrupted_by_priority") so that resumed tasks are aware of context.
- **FR-009**: The `save(filePath)` method MUST atomically write the JSON to disk (write to temporary file, then atomic rename, preventing partial writes on failure).
- **FR-010**: The `load(filePath)` method MUST parse the JSON and return a GameState object, or reject with a typed error if the file does not exist, is not valid JSON, or has an incompatible version.
- **FR-011**: GameState JSON MUST be valid UTF-8 and formatted as plain JSON (no custom serialization markers, allowing debugging with standard JSON tools).
- **FR-012**: All numeric values (tick counts, entity IDs, positions, quantities) MUST serialize as JSON integers (no floating-point approximations).
- **FR-013**: After deserialization, entity ID sequences, component instances, and entity-to-component relationships MUST match the serialized state exactly.
- **FR-014**: GameState MUST support schema versioning; loading a save with a different version than the engine's current version MUST either reject with a clear error or invoke a migration pathway.

### Key Entities

- **GameState**: Root container for a saved game. Contains version, timestamp, entities array, maps array, gameTime, and task queue state. Serializes to JSON.
- **Entity**: In-game object (citizen, resource, furniture). Serializes as `{ id, prototype, components }`. Each entity ID is unique across the game lifetime.
- **Component**: State container attached to an entity (Inventory, Position, Health, Job). Serializes as a named object under `entity.components.{Name}`.
- **AsyncTask**: In-flight task (trade, travel, work). Serializes task ID, type, entity ID, cancellation token, and promise state.
- **CancellationToken**: Context object that may cancel a task. Serializes reason and state.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A game world with 100+ entities, 5 maps, 1000 ticks of state can be serialized to JSON and parsed back in under 100ms (round-trip time).
- **SC-002**: After a save/load cycle, the game state is byte-for-byte identical to the pre-save state for all JSON values (numeric, string, boolean fields).
- **SC-003**: Deterministic simulation: a game run for N ticks without save/load produces identical final state to the same game saved at tick M (M < N), then loaded and run for N-M additional ticks.
- **SC-004**: A corrupted or invalid save file (truncated JSON, missing required fields) is rejected with a descriptive error message within 10ms, without corrupting the current game instance.
- **SC-005**: The save file format remains compatible across all feature releases within a major version (no breaking schema changes without versioning and migration support).
- **SC-006**: PRNG state is preserved through save/load; resuming a game produces the same sequence of random values as if never saved.

## Assumptions

- **Async task serialization**: All pending async tasks (trades, movement, work jobs) are assumed to have a serializable state (task ID, entity reference, cancellation token). Tasks that cannot serialize are cancelled before save; tasks that can serialize are restored on load.
- **Component serialization contract**: All components on an entity are assumed to be JSON-serializable (no function references, no circular object graphs; relationships are by ID, not direct object inclusion).
- **Entity ID stability**: Entity IDs are assumed to be stable across the save/load cycle (no ID reassignment, no garbage collection of deleted entities).
- **Game time as ticks**: Game time is represented as a single integer (elapsed ticks since game start), not as wall-clock time. This simplifies serialization and determinism.
- **Materials registry and prototypes are loaded separately**: The GameState save does not include the materials registry or entity prototypes. These are assumed to be loaded from startup configuration (out of scope for this feature).
- **Single save slot**: The spec assumes one active game world at a time. Multiple save files or autosave slots are out of scope (implementation detail, not a game design feature).
- **No streaming serialization**: For POC, assumes the entire game state fits in memory and is serialized in a single pass. Streaming or incremental saves are not required.
- **UTF-8 file encoding**: Save files are assumed to be stored as UTF-8 encoded plain JSON. No binary encoding, compression, or encryption is required for POC.

## Clarifications

**Q1 - Entity lifecycle during save**: What happens if an entity is created or deleted in parallel with a save operation?
**Answer**: Save must block concurrent entity mutations (use a read lock or pause the game loop). On load, the entity list is exact; no concurrent mutations are replayed.

**Q2 - Partial map state**: Do all maps serialize in full, even unvisited maps?
**Answer**: Yes, all maps serialize fully (terrain, pre-placed entities). This ensures the world is deterministic even if the player hasn't visited all areas yet.

**Q3 - Task queue ordering**: Are in-flight async tasks ordered in the save, or is order inferred on load?
**Answer**: Tasks are serialized with their queue position and priority so that resumption respects the original order.
