# Feature Specification: Quick Room Generator

**Created**: 2026-05-02
**Input**: User description: "One of the ways to generate a game is a quick-and-dirty room generator. This is useful for tests and POC. It generates a room with a handful of entities and handful of objects that entities and the user can interact with."

## User Scenarios & Testing

### User Story 1 - Generate a Simple Test Room with Entities and Objects (Priority: P1)

A room generator can quickly create a single **square grid** room populated with (by default) 10–20 entities and objects (furniture, containers, resources) suitable for deterministic tests and scenario fixtures (Constitution Principle IV). It is a deterministic test/fixture room generator. The generator is called as a standalone utility after game bootstrap and returns a populated game world ready for tick simulation. The room layout is randomized but deterministic (given a seed), allowing reproducible test scenarios. The generator always produces square grid maps; a separate generator is required for Voronoi or other grid types.

**Why this priority**: Core utility for testing. Without a fast room generator, every test must manually populate entities and objects, which is tedious and error-prone. This enables rapid scenario testing and validation.

**Independent Test**: Can be fully tested by: calling `RoomGenerator.generate()` with a seed, verifying the returned room contains entities and objects, verifying the room is valid (no entity collisions, all objects are reachable), and verifying the same seed produces the same layout.

**Acceptance Scenarios**:

1. **Given** `RoomGenerator.generate({ seed: 42 })`, **When** called, **Then** a room is returned with a grid-based map, 10–20 entities (mix of citizens and NPCs), and 5–10 objects (furniture, containers, resources).
2. **Given** two calls to `generate()` with the same seed, **When** both complete, **Then** the resulting rooms have identical layouts, entity positions, and object placements (deterministic generation).
3. **Given** a generated room, **When** inspected, **Then** all entities have valid positions on walkable floor tiles (no spawning in walls).
4. **Given** a generated room with 15 entities, **When** serialized and deserialized, **Then** the room state matches the original (round-trip consistency via feature 006).
5. **Given** a room with furniture and containers, **When** entities attempt to interact with them, **Then** interactions succeed (objects are reachable and have correct state for interaction).

---

### User Story 2 - Support Multiple Room Scenarios for Testing (Priority: P1)

The room generator can produce rooms tailored for different testing scenarios: trade scenarios (entities with inventory and currency), interaction scenarios (entities working with objects/furniture), and navigation scenarios (entities moving and pathfinding). Each scenario type seeds the room with relevant entities and objects.

**Why this priority**: Enables comprehensive testing of different game systems. Trade tests need merchants and goods; interaction tests need workers and tools; navigation tests need obstacles and goals. Without scenario variety, testing is shallow.

**Independent Test**: Can be fully tested by: generating rooms of each scenario type, verifying each type contains the appropriate entity/object mix, and verifying at least one test scenario in each category exercises the intended mechanic.

**Acceptance Scenarios**:

1. **Given** `generate({ scenarioType: ScenarioType.Trade })`, **When** called, **Then** the room contains merchants and customers with starter currency and goods, and trading objects (traders' benches, market stalls).
2. **Given** `generate({ scenarioType: ScenarioType.Interaction })`, **When** called, **Then** the room contains workers with tools and job-capable entities, and objects that support interactions (workbenches, looms, forges).
3. **Given** `generate({ scenarioType: ScenarioType.Navigation })`, **When** called, **Then** the room has multiple pathable areas separated by obstacles, encouraging entities to use pathfinding.
4. **Given** a trade scenario room, **When** entities execute trade behaviors, **Then** inventory and currency exchanges happen correctly.
5. **Given** a navigation scenario room, **When** an entity pathfinds from one area to another, **Then** the path is calculated and traversable.

---

### User Story 3 - Configure Room Parameters for Flexibility (Priority: P2)

The room generator accepts optional parameters to customize the output: room size (`RoomSize` enum: Small, Medium, Large), entity count, object density, and random seed. Default values are suitable for minimal test rooms; parameters allow easy variation for different test conditions without writing new code.

**Why this priority**: Enables tests to cover edge cases (small room with many entities, large room with few objects) without writing scenario code. P2 because default minimal room is sufficient for initial tests, but flexibility becomes valuable quickly.

**Independent Test**: Can be fully tested by: generating rooms with different size parameters, verifying room dimensions match expectations, verifying entity/object counts scale appropriately, and verifying all parameter combinations produce valid rooms.

**Acceptance Scenarios**:

1. **Given** `generate({ size: RoomSize.Small })`, **When** called, **Then** the room is a small grid (e.g., 15x15), with proportionally fewer entities and objects.
2. **Given** `generate({ size: RoomSize.Large, entityCount: 5 })`, **When** called, **Then** the room is a large grid but contains only 5 entities (parameters can override defaults).
3. **Given** `generate({ seed: 42, size: RoomSize.Medium })`, **When** called twice, **Then** both produce identical layouts (seed determinism holds across parameter variations).
4. **Given** invalid parameters (e.g., an unknown size value such as `"huge"`, `entityCount: 0`), **When** passed to `generate()`, **Then** validation rejects with clear error messages.
5. **Given** a parameterized generation, **When** parameters are stored with the GameState, **Then** the same parameters can be used to regenerate the room deterministically.

---

### User Story 4 - Verify Room Validity and Walkability (Priority: P1)

The generated room must be valid: all entities and objects have positions on walkable tiles, no two entities occupy the same tile, all pathfinding obstacles are in place, and the room as a whole is traversable (no disconnected regions). Validation occurs during generation; invalid rooms are rejected before being returned.

**Why this priority**: Prevents tests from failing due to bad map generation rather than actual bugs. Invalid maps corrupt test results. Blocking.

**Independent Test**: Can be fully tested by: generating many rooms (1000+) with random seeds and parameters, verifying each passes validation, and verifying any pathological case (disconnected regions, entity collisions) is detected and rejected.

**Acceptance Scenarios**:

1. **Given** a generated room, **When** checked for validity, **Then** no two entities occupy the same tile.
2. **Given** all entity and object positions in a room, **When** verified, **Then** each is on a walkable floor tile, not in a wall or obstacle.
3. **Given** a room with multiple walkable regions, **When** pathfinding is tested from one region to another, **Then** paths are found (regions are connected, not isolated).
4. **Given** a large generated room, **When** validated, **Then** validation completes in under 50ms (no pathfinding overhead for every tile).
5. **Given** an invalid configuration that would create a room with entity collisions or unreachable areas, **When** `generate()` is called, **Then** an error is raised or generation retries until a valid layout is found.

---

### User Story 5 - Generate Starter Inventory for Entities (Priority: P1)

Each entity spawned in the room has a starter inventory with currency and basic goods (e.g., money for trading, tools for work, food for consumption). Inventory composition depends on the entity type (merchants have more currency; workers have tools; consumers have food). This enables immediate interaction testing without manually populating inventories.

**Why this priority**: Without starter inventory, entities can't engage in economically meaningful interactions. Blocking for trade/economic scenario testing.

**Independent Test**: Can be fully tested by: generating a room, inspecting entity inventories, verifying merchants have currency/goods, workers have tools, and all entities have food. Verify inventory totals match expected distributions (no coins appearing from nowhere).

**Acceptance Scenarios**:

1. **Given** a merchant entity in a generated trade room, **When** its inventory is checked, **Then** it contains currency (e.g., 500 units) and goods to trade (e.g., 10 wood, 5 cheese).
2. **Given** a worker entity in an interaction room, **When** its inventory is checked, **Then** it contains relevant tools (e.g., hammer, chisel) and consumables.
3. **Given** all entities in a room, **When** total currency is summed, **Then** it equals a sensible starting pool (e.g., 10,000 currency units distributed across merchants and consumers, no infinite money generation).
4. **Given** two rooms generated with the same seed, **When** both entities' inventories are inspected, **Then** both have identical inventory contents (deterministic population).
5. **Given** a generated room, **When** entities trade and consume from their starting inventory, **Then** inventory states evolve realistically (no loss of currency, goods degrade/transform as expected).

---

### Edge Cases

- What happens if the generator attempts to place more entities than there are free tiles? → Generation retries with a larger room or fewer entities; if both are violated, it fails with a clear error.
- What happens if a room seed has never been seen before (first use)? → Generation proceeds normally; determinism is maintained for subsequent uses of the same seed.
- What happens if an entity's starting inventory violates stack limits (inventory 005)? → Inventory system rejects; generator adjusts quantities to respect limits.
- What happens if the room has disconnected walkable regions? → Pathfinding test fails; generator retries until the room is fully connected, or fails with an error if connectivity cannot be achieved.
- What happens if parameters specify `entityCount: 0` or `objectCount: 0`? → Validation rejects as invalid; at least 1 entity and 1 object are required.
- What happens if a room is generated very large (e.g., 500x500)? → Generation completes but may take longer; performance is acceptable (<1 second for reasonable sizes).

## Requirements

### Functional Requirements

- **FR-001**: RoomGenerator MUST expose a `generate(options?)` method that returns a fully populated room with entities, objects, and terrain.

> **Amended by DECISIONS.md D-11**: the term "Room" in this spec is renamed `Site` (`SiteGenerator`, `GeneratedSite`) to avoid the collision with spec 015. `objectCount` is not a parameter.
- **FR-002**: Generated rooms MUST be **square grid** maps with floor cells and walls (wall entities occupying a cell and making it non-traversable, per spec 004), dimensions based on the `size` parameter (small: ~15x15, medium: ~25x25, large: ~40x40). The quick room generator does NOT support Voronoi or hexagonal grid types; those require a dedicated generator.
- **FR-003**: Each generated room MUST contain 10–20 entities (citizens, NPCs) by default; `entityCount` overrides this (minimum 1), with randomized positions on walkable tiles; no two entities on the same tile.
- **FR-004**: Each generated room MUST contain 5–10 objects (furniture, containers, resources) by default, scaled by `objectDensity`, placed on walkable tiles and reachable by pathfinding.
- **FR-005**: Entity and object placement MUST be deterministic given a seed; the same seed always produces the same room layout.
- **FR-006**: If no seed is provided, the generator MUST take its randomness from a derived stream of the engine's seeded PRNG (feature 011), whose seed was supplied or generated once at bootstrap and recorded in game state (feature 007). The generator never creates an unseeded or time-based seed; the seed it used is stored with the generation parameters for reproducibility.
- **FR-007**: The generator MUST support scenario types (`ScenarioType` enum: Trade, Interaction, Navigation); each type seeds the room with appropriate entities and objects.
- **FR-008**: Entities spawned in trade scenarios MUST have merchant/customer role and starter inventory with currency and tradeable goods.
- **FR-009**: Entities spawned in interaction scenarios MUST have worker roles, starter tools/equipment, and job-capable components.
- **FR-010**: Entities spawned in navigation scenarios MUST be positioned in multiple walkable regions to encourage pathfinding.
- **FR-011**: All generated rooms MUST be valid: entities and objects on walkable tiles, pathfinding connectivity intact, no collisions.
- **FR-012**: Room generation MUST validate the layout before returning; invalid rooms MUST be rejected with a descriptive error or retried automatically.
- **FR-013**: The `generate()` method MUST accept optional parameters: `size` (`RoomSize` enum: Small, Medium, Large), `entityCount` (number), `objectDensity` (number 0–1), `seed` (number), `scenarioType` (`ScenarioType` enum).
- **FR-014**: All parameters MUST be validated at call time; invalid values MUST be rejected with clear error messages.
- **FR-015**: Generated room data MUST be serializable to JSON via GameState (feature 006) and deserializable identically.

### Key Entities

- **RoomGenerator**: Utility class/module providing the `generate()` method. Stateless; returns new room instances on each call.
- **Room**: Generated room instance containing a map grid, entity list, and object list. Serializable and compatible with GameState.
- **GeneratorOptions**: Parameters object passed to `generate()`, validated and used to customize room generation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A room can be generated in under 200ms (including validation, pathfinding connectivity checks).
- **SC-002**: The same seed always produces identical room layouts across multiple calls and sessions (determinism verified by comparing entity/object positions byte-for-byte).
- **SC-003**: Generated rooms pass validity checks: 0 entity collisions, 100% of entities/objects on walkable tiles, 100% connectivity in pathfinding graph (no disconnected regions).
- **SC-004**: All three scenario types (trade, interaction, navigation) can be generated and support their intended test use case (merchants trade, workers work, entities navigate).
- **SC-005**: Starter inventories are realistic: total currency is conserved across entities, stack limits are respected, and inventory state is valid for each entity type.
- **SC-006**: Room generation works in headless environment (Node.js) without requiring rendering, UI, or window objects.

## Assumptions

- **Entity prototypes exist and are registered**: The generator assumes entity prototypes (Citizen, Merchant, Worker, etc.) are pre-registered before `generate()` is called. The generator does not define prototypes.
- **Materials registry exists**: The generator assumes the materials registry (food, wood, currency, tools, etc.) is pre-loaded. It uses the registry to populate inventories but does not define materials.
- **Map tiles support terrain types**: The generator assumes the map system (feature 004) supports floor terrain types and wall entities that make their cell non-traversable on square grids, and that pathfinding (feature 012) works on them. Generator specifies which cells get walls; pathfinding is implemented by feature 012. The generator does not need to interact with Voronoi or hexagonal map infrastructure.
- **PRNG is available**: The generator uses the PRNG system (feature 011) for randomization. If no seed is provided, the generator uses a derived stream of the engine PRNG; the generator assumes the PRNG is already initialized with a seed by bootstrap (supplied, or generated once and recorded).
- **GameState and serialization work**: Generated rooms are assumed to be serializable to GameState (feature 006) without modification. The generator returns data compatible with GameState JSON.
- **Single scenario per call**: Each `generate()` call creates one room of one scenario type. The generator does not create multiple rooms or rooms with mixed scenarios in a single call.
- **Population is sparse**: Rooms are assumed to have sparse populations (10–20 entities) relative to grid size. Dense populations (100+ entities in a small room) may violate assumptions about entity spacing and collision detection.
- **Headless-first**: The generator is part of the core engine and must work in headless environments (Node.js, CLI, test runners) without rendering dependencies.

## Clarifications

### Session 2026-05-02 (Original Scope Decisions)

- Q: Is a room a single map, or a bounded region within a larger map? → A: A single map. Each `generate()` call creates one standalone map/room. Multiple rooms can be created by calling `generate()` multiple times.
- Q: Should entities have role traits (merchant, worker, citizen) or are they generic? → A: Entities have roles based on scenario type. Trade scenarios spawn merchants and customers; interaction scenarios spawn workers. Role is determined by entity prototype/components.
- Q: Does the same seed produce identical layouts across different scenario types? → A: No. Same seed + same scenario type = same layout. Different scenario types produce different populations (e.g., seed 42 + "trade" ≠ seed 42 + "navigation").
- Q: Can a generated room be re-generated from saved parameters? → A: Yes. Room generation parameters are stored in GameState; a room can be regenerated from the same parameters, producing an identical layout.
- Q: If a room is invalid (e.g., collision detected), should generation retry or fail? → A: Retry up to N times with minor layout adjustments (e.g., shift entities slightly). If still invalid after retries, fail with a clear error. Retries are transparent to the caller.

### Session 2026-05-02 (Grid Type Scope & Multi-Pattern Context)

- Q: Should the quick room generator support multiple grid types (square, Voronoi)? → A: Square-only. The quick room generator is a deliberately minimal deterministic test/fixture generator; it always produces square grid rooms. Voronoi or hexagonal rooms require a dedicated generator. This keeps the API simple and the scope focused.
- Q: How should room size be expressed for non-square grid types? → A: Type-specific (for future Voronoi generator). Square grids use grid dimensions (NxN cells, e.g., 15×15). Voronoi grids would use region count (small: ~100 regions, medium: ~300, large: ~600). Each generator handles its own size semantics; the terrain API abstracts the underlying topology.
- Q: How should validity checks adapt for Voronoi's irregular regions? → A: Density-based (for future Voronoi generator). Max entities per region depends on region area; large regions allow more than one entity. No fixed one-entity-per-region rule. For square grids (this generator), the existing tile-based rule applies unchanged.
- Q: How should walls/obstacles be placed in Voronoi rooms? → A: Region-type-based (for future Voronoi generator). Some regions are designated 'wall regions' (non-traversable); interior non-traversable regions act like obstacles. Square grid generator continues to use wall entities on boundary cells and as interior obstacles.
- Q: Should the 'navigation' scenario generate different patterns for different grid types? → A: Unified API. When a future Voronoi generator is implemented, the navigation scenario generates obstacles via the grid-type-agnostic terrain API regardless of grid type. For this generator, navigation on square grids uses wall entities to create corridor-based obstacle layouts.
