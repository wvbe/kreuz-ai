# Feature Specification: Game State & Save Format

**Created**: 2026-05-02
**Input**: User description: "I want to specify the game state & save format"

## User Scenarios & Testing

### User Story 1 - Save Game (Priority: P1)

A game in progress (entities present, map established, time passed, async tasks in flight) can be serialized to JSON. The save contains all entity state, component data, active task state, and game time at the moment the save is triggered. The game engine provides a `save()` method that returns the complete state as a JSON string (or plain JSON-compatible object). Writing it to disk, browser storage, or elsewhere — including doing so atomically — is the host's job; the engine performs no file I/O (it also runs in the browser).

**Why this priority**: Core mechanic—without save, no ability to persist progress or test determinism. Every feature depends on this working.

**Independent Test**: Can be fully tested headlessly by: creating a game world with entities, advancing game time, modifying entity state (inventory changes, position movement, task assignment), calling `save()`, and verifying the returned JSON contains all expected state.

**Acceptance Scenarios**:

1. **Given** a running game with 3 citizens, 1 map, 100 ticks of game time, **When** `save()` is called, **Then** the returned JSON root contains `version`, `timestamp`, `time`, `prng`, `eventQueue`, `initOptions`, `entities`, and `maps`.
2. **Given** a citizen with an in-flight trade task (async operation pending), **When** `save()` is called mid-trade, **Then** the task record (task checkpoint and tick-level state-machine phase) and cancellation token are serialized; native promises are not.
3. **Given** multiple inventory mutations and map transitions queued during a single tick, **When** `save()` is called, **Then** all state is captured as one consistent snapshot (no partial state, no inconsistencies).
4. **Given** a JSON save, **When** read as UTF-8 text, **Then** it is valid JSON and can be parsed without errors.
5. **Given** any game state, **When** serialized and deserialized, **Then** the deserialized game is identical to the original (bit-for-bit for JSON values, structural equivalence for object graphs; the wall-clock `timestamp` metadata is excluded).

---

### User Story 2 - Load Game (Priority: P1)

A saved game can be loaded back into memory and the game resumes from exactly the state at which it was saved. All entities, components, async tasks, and game time are restored. The game engine provides a `load(json)` method that accepts the save as a JSON string or parsed object (reading it from disk or storage is the host's job) and rebuilds the full game state, including re-establishing task queue subscriptions and cancellation token listeners; behavior scripts resume from their serialized task checkpoints.

**Why this priority**: Companion to save. Without load, saves are useless. Blocking all further features until save/load work correctly.

**Independent Test**: Can be fully tested headlessly by: creating a game, saving it, calling `load()`, and verifying the loaded game state matches the saved state via deep equality check on entities, components, and game time.

**Acceptance Scenarios**:

1. **Given** a saved game with version field, **When** `load(json)` is called, **Then** the JSON is parsed, version is validated (matches current schema, or is older and migrated first), and game state is rebuilt.
2. **Given** a loaded game with entities at specific coordinates and inventory states, **When** the game loop advances one tick, **Then** all entities behave identically to the saved tick cycle (deterministic resume).
3. **Given** a task in flight (async operation) at save time, **When** the game is loaded and the tick cycle continues, **Then** the task resumes at the same state and resolves when expected.
4. **Given** a save from a previous game session, **When** loaded, **Then** all entity IDs, component instances, and relationships are preserved without collision or duplication.
5. **Given** a load operation, **When** the input is corrupted or not valid JSON, **Then** the engine rejects with a clear error (`InvalidSaveFormatError`) and does not enter an inconsistent state. (A missing file is detected by the host before calling `load()`.)

---

### User Story 3 - Determine Save Format Version and Compatibility (Priority: P2)

The JSON save includes a version field that indicates the schema version. When a save is loaded, the engine checks the version and determines whether it can be loaded as-is or requires migration. Saves from an older version are migrated forward; saves from a newer version are rejected.

**Why this priority**: Allows safe schema evolution. As features are added (new components, new entity types, game time precision changes), saves from earlier versions can be migrated rather than becoming obsolete. P2 because it's essential for long-term gameplay but not blocking initial save/load.

**Independent Test**: Can be fully tested by: saving a game at current version, manually editing the version number to a future/past version, attempting to load, and verifying the engine detects the version mismatch and responds appropriately (rejects or invokes migration).

**Acceptance Scenarios**:

1. **Given** a save file with `"version": 1`, **When** loaded by an engine expecting version 1, **Then** load succeeds without errors.
2. **Given** a save file with `"version": 0` (earlier schema), **When** loaded by an engine at version 1, **Then** the engine migrates the save to version 1 and the load succeeds.
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

- What happens if `save()` is called while the game loop is still processing a tick? → Saves are taken at a tick boundary: the snapshot reflects the state after the current tick completes, never partial mid-tick updates.
- What happens if `load()` encounters partial/corrupted JSON (valid start, truncated end)? → Load rejects with a parse error; game state is not corrupted.
- What happens if an entity is deleted during the save window (concurrency)? → Save captures the state at invocation; deletions after invocation are not included.
- What happens if two entities have circular component references (A depends on B, B depends on A)? → JSON graph is acyclic (entities reference each other by ID, not direct object inclusion); circular references serialize correctly.
- What happens if the file system runs out of space while the host writes a save? → File I/O is the host's responsibility; the host writes atomically (e.g., temporary file + rename) so a failed write leaves the previous save file (if any) intact. `save()` itself performs no I/O.
- What happens if game time is a very large number (e.g., 1 million ticks \* 5 minutes = years of game time)? → JSON number precision is preserved (no float overflow); time field remains accurate.

## Requirements

### Functional Requirements

- **FR-001**: GameState MUST be a JSON object with a `version` field (integer) at the root, indicating the save format schema version.
- **FR-002**: GameState root MUST include an `entities` array, where each entity is a JSON object with `id`, `prototype`, and `components` (nested by component name).
- **FR-003**: GameState root MUST include a `maps` array, where each map contains map ID, `gridType` (square or voronoi), dimensions (`width`, `height`; square maps only), and a flat `cells[]` array indexed by `cellIndex`. Each cell is an object whose `terrain` is a string terrain ID from the terrain registry (spec 022), e.g. `{ terrain: "grassland" }`. Walls and transition objects (doors, portals) are entities occupying a cell and serialize as full entities in the root `entities` array. Entity positions are NOT stored in map data; they are sourced from `entity.components.Position` on load.
- **FR-004**: GameState root MUST include a `time` object `{ tickCount, paused, speed, tickIntervalMs }` (spec 001), where `tickCount` is the integer number of elapsed game ticks since game start and `speed` is the speed-multiplier enum value.
- **FR-004a**: GameState root MUST include `prng` (PRNG state including derived streams, spec 011), `eventQueue` (pending events, spec 010), and `initOptions` (the options the game was created with, including the seed — explicit or generated once at bootstrap — spec 007), `statuses` and `productionLedger` (spec 025 FR-014), and `stewardship` (standing orders, `nextOrderId`, owned runs, `stewardEntityId`, the Steward board, the pending extra-review flag and the last review tick; spec 026 FR-026). Settlement tier progress (`SettlementProgress`, spec 027 FR-002), the settlement chronicle (`SettlementChronicle`, spec 028 FR-018), citizen identity and journals (`Identity`, spec 028 FR-003) and dwelling state (`Dwelling`, `Citizen.homeDwellingId`, spec 029 FR-004/FR-005) are components and serialize with their entities, not as root keys; the `identity.names` and `housing.immigration` streams are part of `prng`.
- **FR-005**: Each entity in `entities` MUST serialize all component state (inventory contents, position, health, etc.) as properties under `components.{ComponentName}`. Position component MUST include `mapId` and the discrete cell index: `{ mapId: int, cellIndex: int }` for all grid types (on square maps `cellIndex = cellY × width + cellX`; `cellX`/`cellY` are API sugar and are not stored, spec 004). No sub-cell data is stored in game state; visual interpolation is a renderer-only concern.
- **FR-006**: Entity position is the single source of truth; map terrain grid does not store entity locations. On load, entities are placed according to their Position components.
- **FR-006a**: GameState MUST include a `timestamp` field (ISO 8601 string) indicating when the save was created (UTC). The timestamp is metadata only: it never influences simulation and is excluded from equality and byte-identical guarantees (SC-002).
- **FR-007**: Terrain tiles can be mutated during gameplay (e.g., building foundations, digging). Mutated terrain is serialized in the `cells[]` array at its current state; mutations are not recorded as delta, only the final state is saved.
- **FR-008**: Transition objects (doors, portals) are full entities that serialize in the root `entities` array. They have Position components that define their location and transition data components (e.g., `{ target: { mapId, cellIndex }, isOpen }`) that define their behavior.
- **FR-009**: In-flight async tasks (pending actions) MUST serialize their task record, including: task ID, task type, associated entity ID, cancellation token state, and the task checkpoint (tick-level state-machine phase and data) from which the behavior script resumes after load. Native promises are never serialized (spec 003).
- **FR-010**: Serialized cancellation tokens MUST include the reason (e.g., "entity_deleted", "interrupted_by_priority") so that resumed tasks are aware of context.
- **FR-011**: The `save()` method MUST return the complete GameState as a JSON string (or plain JSON-compatible object) captured as one consistent snapshot. The engine performs no file I/O; persisting the result (disk, browser storage, etc.) and doing so atomically (e.g., temporary file + rename) is the host's responsibility.
- **FR-012**: The `load(json)` method MUST accept a JSON string or parsed object and return a GameState object, or reject with a typed error if the input is not valid JSON, fails validation, or has a newer version than the engine supports. Saves with an older version MUST be migrated forward before loading.
- **FR-013**: GameState JSON MUST be valid UTF-8 and formatted as plain JSON (no custom serialization markers, allowing debugging with standard JSON tools).
- **FR-014**: All numeric values (tick counts, entity IDs, positions, quantities) MUST serialize as JSON integers (no floating-point approximations). This is the canonical numeric rule for all specs: game state and saves use fixed-point integers, with a scale of ×1000 ("milli-units", e.g. 1.5 → 1500) unless a spec defines a better integer unit (e.g., ticks for time). Content data files may author human-friendly decimals; they are converted to fixed-point at load.
- **FR-015**: After deserialization, entity ID sequences, component instances, and entity-to-component relationships MUST match the serialized state exactly. Entity positions are reconstructed from Position components; no position data is stored in the map grid.
- **FR-016**: Saves from earlier versions with `initOptions.difficulty` `normal`/`hard` MUST be migrated to `steady`/`harsh` (spec 027 FR-024).

### Key Entities

- **GameState**: Root container for a saved game. Contains version, timestamp, time, prng, eventQueue, initOptions, statuses, productionLedger, stewardship, entities array, and maps array. Task queue state is not a root key: it is serialized inside the owning entities' components (e.g., the task queue component, spec 003). Serializes to JSON.
- **Entity**: In-game object (citizen, resource, furniture, or transition object like door/portal). Serializes as `{ id, prototype, components }`. Each entity ID is unique across the game lifetime.
- **Map**: World region with terrain (mutable, see FR-007) and entities. Serializes `gridType`, dimensions (square maps only), and a flat `cells[]` array indexed by `cellIndex`. Walls and transition objects (doors, portals) are full entities stored in the root `entities` array.
- **Cell**: Single cell in a map, addressed by `cellIndex`. Serializes as `{ terrain: string }`, where `terrain` is a string terrain ID from the terrain registry (spec 022, loaded at bootstrap).
- **Transition**: A passage between maps or within a map. Implemented as an entity with a Transition component that specifies its target `{ mapId, cellIndex }`. Serializes as a full entity.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A game world with 100+ entities, 5 maps, 1000 ticks of state can be serialized to JSON and parsed back in under 100ms (round-trip time).
- **SC-002**: After a save/load cycle, the game state is byte-for-byte identical to the pre-save state for all JSON values (numeric, string, boolean fields), excluding the wall-clock `timestamp` metadata.
- **SC-003**: Deterministic simulation: a game run for N ticks without save/load produces identical final state to the same game saved at tick M (M < N), then loaded and run for N-M additional ticks.
- **SC-004**: A corrupted or invalid save file (truncated JSON, missing required fields) is rejected with a descriptive error message within 10ms, without corrupting the current game instance.
- **SC-005**: The save file format remains compatible across all feature releases within a major version (no breaking schema changes without versioning and migration support).
- **SC-006**: PRNG state is preserved through save/load; resuming a game produces the same sequence of random values as if never saved.
- **SC-007**: Entity positions are always reconstructed from `entity.components.Position` on load; no position discrepancy between component state and map data.

## Assumptions

- **Async task serialization**: All pending async tasks (trades, movement, work jobs) are assumed to have a serializable state (task ID, entity reference, cancellation token, task checkpoint). Tasks that cannot serialize are cancelled before save; tasks that can serialize are restored on load.
- **Component serialization contract**: All components on an entity are assumed to be JSON-serializable (no function references, no circular object graphs; relationships are by ID, not direct object inclusion).
- **Entity ID stability**: Entity IDs are assumed to be stable across the save/load cycle (no ID reassignment, no garbage collection of deleted entities).
- **Game time as ticks**: Game time is represented as a single integer (elapsed ticks since game start), not as wall-clock time. This simplifies serialization and determinism.
- **Terrain registry loaded at startup**: Terrain is referenced by string terrain ID (spec 022) in saved cell data. The terrain registry (properties, rendering hints) is loaded at engine bootstrap, not stored in saves. Cells store only their terrain ID.
- **Materials registry and prototypes are loaded separately**: The GameState save does not include the materials registry or entity prototypes. These are assumed to be loaded from startup configuration (out of scope for this feature). Saves reference materials and other content by their string content IDs.
- **Single save slot**: The spec assumes one active game world per engine instance. Multiple save files or autosave slots are out of scope (implementation detail, not a game design feature).
- **No streaming serialization**: Assumes the entire game state fits in memory and is serialized in a single pass. Streaming or incremental saves are not required.
- **UTF-8 encoding**: Saves are UTF-8 encoded plain JSON. No binary encoding, compression, or encryption is required.
- **Entity positions: single source of truth**: Entity.components.Position is the authoritative location of every entity. Map terrain grid does NOT store entity positions. Queries that need entity positions reconstruct them from Position components. This eliminates consistency risks from position duplication.
- **Terrain mutability**: Terrain tiles can be modified in-game (e.g., building foundations). Mutated terrain is saved as the final state in `cells[]`; no delta encoding or mutation history is stored. After load, terrain is at exactly the state it was at save time.
- **Transitions as entities**: Passage objects (doors, portals, map exits) are full entities with Transition components. They serialize exactly like other entities and appear in the entities array. This unifies the data model and allows transitions to have Position, Health, or other properties.

## Clarifications

### Session 2026-05-02

- Q: What is the exact JSON structure for terrain data (the grid)? → A: A per-map `gridType` plus a flat `cells[]` array indexed by `cellIndex` (dimensions stored for square maps only). Each cell is an object, e.g. `{ terrain: "grassland" }`, holding a string terrain ID. Using objects allows future per-cell metadata without changing the structure.
- Q: Where is the source of truth for entity positions: entity components, map data, or both? → A: Only in `entity.components.Position`. Map data does NOT store entity locations. On load, entity positions are reconstructed from Position components. This eliminates consistency issues and ensures single source of truth.
- Q: What exactly is 'transition state' and how should it be serialized? → A: Transition objects (doors, portals, map exits) are full entities that serialize like other entities. They have Position components defining their location and Transition components defining their behavior (target `{ mapId, cellIndex }`, isOpen, etc.). Transitions appear in the entities array and serialize/deserialize identically to other entities.
- Q: Can terrain be modified during gameplay, or is it immutable? → A: Mutable. Terrain tiles can change in-game (e.g., building foundation changes dirt to foundation). Mutated terrain is saved as the final state in `cells[]`; no delta encoding. After load, terrain is exactly as it was at save time.
- Q: How are tile types defined and referenced in the save format? → A: Terrain types are string IDs from the single terrain registry (spec 022), loaded at engine bootstrap, not stored in saves. Cells store only their terrain ID. This keeps saves compact and allows the registry to be updated without invalidating existing saves.

### Cross-Cutting Session 2026-05-02

- Q: How should entity positions be serialized? → A: Position component stores the discrete cell as integers: `{ mapId: int, cellIndex: int }` for all grid types (square-map `cellX`/`cellY` are API sugar only, spec 004). No sub-cell data is stored in game state; visual interpolation is a renderer-only concern. This satisfies FR-014 (integer-only).
- Q: Should entity version field be in save format? → A: No. Entity version is runtime-only (reset to 0 on load). Entity JSON remains `{ id, prototype, components }`. Version is used for cache invalidation during gameplay; all caches are invalidated on load.
