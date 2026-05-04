# Feature Specification: Game Map & Terrain System

**Feature Branch**: `004-map-terrain`
**Created**: 2026-05-02
**Status**: Unimplemented (fresh start)
**Input**: User description: "Another framework level feature is the game map/terrain. Most scenes will contain persons, furniture, tools. I want to research if this must be grid-based or can be something else. Some entities will have hitboxes, some terrain will not be traversable for different reasons. There must be pathfinding. There is one 'main' game terrain, but the user can travel to other maps/rooms/dungeons in the same game, that run on the same game time (ie all their events keep happening). There will be different kinds of terrain, such as in open air, underground/excavated, or in an above-ground building. The helper classes for this provide an ergonomic way of altering this terrain, so that later different generators can generate different implementations of a building, hut, forest, field, market, cave, wine cellar, and so on. Procedurally generating this contents is out of scope for this feature, but the feature must allow it."

> **Note (2026-05-04)**: A previous implementation of this feature was discarded. This spec is being reimplemented from scratch following the conventions in spec 023 (TypeScript code style). All code lives under `src/game/`, tests are co-located, no barrel files, no default exports. Entities are pure data objects; systems provide behavior. See spec 023 for the full code style reference.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Implement Cell-Based Spatial Representation (Priority: P1)

The game uses a **cell-based spatial representation**: discrete cells (voronoi polygons for outdoor maps, square tiles for indoor/underground maps) form the atomic unit of game logic. Entities occupy cells; pathfinding, zone assignment, and all game systems operate at cell granularity. The renderer may interpolate entity positions between cells for smooth visual movement, but game state records only cell occupancy. This combines the determinism of discrete positioning with visual smoothness.

**Why this priority**: Foundational architectural decision that affects all downstream terrain, pathfinding, and entity placement systems.

**Independent Test**: Can be fully tested by: (a) placing entities in cells, (b) running A\* pathfinding at cell level on the Delaunay adjacency graph, (c) validating all terrain types (building, cave, field) are representable, (d) verifying serialization round-trips preserve cell positions.

**Acceptance Scenarios**:

1. **Given** a terrain map, **When** entity is placed in cell 42, **Then** position is recorded as cell index and the entity appears in that cell's occupant list.
2. **Given** a voronoi or square-tile map, **When** A\* pathfinding runs at cell level, **Then** path is returned as sequence of cell indices, deterministic, and avoids non-traversable cells.
3. **Given** different map types (voronoi outdoor, square-tile indoor, square-tile cave), **When** applied to all terrain types, **Then** all types are representable using the same cell-based API.
4. **Given** entity cell positions, **When** serialized to JSON and deserialized, **Then** cell occupancy is preserved without loss.
5. **Given** procedural generator using terrain API, **When** generator operates at cell level, **Then** generated layouts are valid and entities can be placed in cells.

---

### User Story 2 - Entity Placement and Traversability (Priority: P1)

Entities (citizens, NPCs, furniture, tools) can be placed on terrain in specific cells. Some cells are non-traversable for various reasons (walls, water, cliffs, locked doors). The system prevents entity movement into non-traversable cells. Multiple entities may occupy the same cell (co-location). Furniture entities may mark a cell as non-traversable or partially blocked.

**Why this priority**: Core gameplay mechanic; entities must have locations and movement must respect terrain constraints.

**Independent Test**: Can be fully tested by placing 50+ entities in cells, moving entities, checking traversability, and verifying: (a) entities don't move into blocked cells, (b) traversability checks are O(1) per cell, (c) performance remains acceptable. Delivers movement constraints.

**Acceptance Scenarios**:

1. **Given** a terrain with traversable and non-traversable cells, **When** entity is placed in a traversable cell, **Then** entity placement succeeds and entity is added to the cell's occupant list.
2. **Given** an entity, **When** movement is requested into non-traversable cell (wall, water), **Then** movement is blocked.
3. **Given** 100+ entities on same terrain, **When** traversability checks execute each game tick, **Then** all checks complete correctly and tick time remains acceptable (<50ms).
4. **Given** a cell with non-traversable status, **When** reason is queried, **Then** reason is returned (e.g., "wall", "water", "locked door") for potential game events.
5. **Given** entity cell positions and traversability state, **When** serialized to JSON and deserialized, **Then** positions and traversability are preserved.

---

### User Story 3 - Pathfinding and Navigation (Priority: P1)

Entities need to navigate terrain from one location to another, avoiding obstacles and respecting non-traversable areas. A pathfinding system computes paths given start and goal locations. Pathfinding works in headless environments, is deterministic (identical input produces identical path), and performs acceptably for 100+ concurrent pathfinding queries.

**Why this priority**: Essential for citizen movement, NPC behavior, trade routes, and faction objectives. Gameplay wouldn't work without pathfinding.

**Independent Test**: Can be fully tested by: (a) creating terrain with obstacles, (b) computing paths between multiple start/goal pairs, (c) verifying paths avoid obstacles, (d) measuring pathfinding time for 100 concurrent queries, (e) verifying identical queries produce identical paths. Delivers pathfinding contract.

**Acceptance Scenarios**:

1. **Given** a terrain with obstacles, **When** pathfinding is requested from location A to location B, **Then** a path is returned that avoids obstacles and reaches goal.
2. **Given** no valid path exists (goal is unreachable), **When** pathfinding is requested, **Then** null or "no path" response is returned (no infinite loops or errors).
3. **Given** 100 concurrent pathfinding queries, **When** queries execute, **Then** all paths are computed in acceptable time (<1s total for all queries).
4. **Given** identical terrain and identical start/goal locations, **When** pathfinding is executed twice, **Then** identical paths are returned (deterministic). When multiple equally-valid paths exist, the game's seeded PRNG determines tie-breaking consistently.
5. **Given** entity following computed path in headless environment, **When** path is followed tick by tick, **Then** entity reaches goal and behavior matches that of rendered version.

---

### User Story 4 - Multi-Map Architecture with Unified Game Time (Priority: P1)

The game supports multiple maps/rooms/dungeons accessible from a main game terrain (e.g., player travels from main world to town, shop interior, dungeon). Each map is independent spatially but shares global game time; all entities across all maps have events that continue happening simultaneously. Traveling between maps is seamless; entity state transitions correctly.

**Why this priority**: Core gameplay structure; game would be unplayable without multi-map support. "Same game time" requirement is critical for consistency.

**Independent Test**: Can be fully tested by: (a) creating main map and 2+ sub-maps, (b) placing entities on different maps, (c) advancing game time, (d) verifying entities on all maps progress correctly, (e) traveling between maps, (f) verifying state consistency. Delivers multi-map coordination.

**Acceptance Scenarios**:

1. **Given** an entity on main terrain at game time T, **When** game is saved, entity is moved to dungeon map, game is resumed, **Then** entity is on dungeon map and game time is T (time advances consistently across maps).
2. **Given** multiple entities on different maps with scheduled events at game time T+100, **When** game time reaches T+100, **Then** events on all maps trigger simultaneously.
3. **Given** an entity on main terrain and a merchant on sub-map (shop interior), **When** both entities have independent task queues, **Then** both task queues execute correctly and time advances equally for both.
4. **Given** entity traveling from main map to sub-map, **When** movement is executed, **Then** entity is atomically removed from source map and added to destination map in a single operation; entity is never in an inconsistent intermediate state.
5. **Given** entity with pending async operations traveling between maps, **When** transition executes, **Then** all pending async operations continue progressing through game ticks uninterrupted; travel is itself an async operation and does not pause others.

---

### User Story 5 - Terrain Types and Ergonomic Terrain Alteration API (Priority: P1)

The game supports diverse terrain types (open air, underground, buildings, etc.) with different visual and behavioral characteristics. An ergonomic API allows developers to: (a) define terrain types, (b) alter existing terrain (add/remove walls, place furniture, change traversability), (c) query terrain properties at locations. The API is flexible enough to support procedural generation of varied implementations (buildings, huts, forests, fields, markets, caves, wine cellars, etc.) without hard-coding specific implementations.

**Why this priority**: Enables diverse gameplay environments and procedurally-generated content. API ergonomics determine developer productivity for level design and procedural systems.

**Independent Test**: Can be fully tested by: (a) defining 3+ terrain types, (b) creating instances with different layouts, (c) using API to query and alter terrain, (d) verifying queries return consistent results, (e) verifying alterations persist in state. Delivers terrain API contract.

**Acceptance Scenarios**:

1. **Given** terrain type definitions (e.g., `{ type: "building", defaultFloor: "wood", defaultWalls: "stone" }`), **When** terrain instance is created from type, **Then** instance has correct default properties and can be altered.
2. **Given** a terrain instance, **When** API call `terrain.addWall(location, orientation)` is executed, **Then** wall is placed at location and blocks traversal.
3. **Given** a terrain instance, **When** API call `queryCell(map, cellIndex)` is executed, **Then** cell properties are returned (traversable, terrainType, occupants, zoneId, etc.).
4. **Given** terrain alteration API, **When** used in a procedural generation script, **Then** script can generate building layouts (rooms, hallways), populate furniture, and create coherent spaces without procedural generator baked into terrain system.
5. **Given** terrain alterations via API, **When** terrain is serialized to JSON and deserialized, **Then** all alterations are preserved and queries return identical results.

---

### User Story 6 - Terrain and Entity Serialization (Priority: P1)

All terrain state (layout, obstacles, traversability, entity cell occupancy) and entity state (position, map affiliation) must serialize to JSON and deserialize identically. When a game is saved with entities on various maps, all terrain and entity state is captured; when loaded, entities are at correct cells on correct maps and game time is synchronized.

**Why this priority**: Required by Constitution Principle II (Deterministic State & JSON Serialization). Without serialization, save/load breaks multi-map architecture and entity state.

**Independent Test**: Can be fully tested by: (a) creating multi-map world with entities, (b) saving to JSON, (c) inspecting JSON for completeness, (d) loading save, (e) verifying entities are at correct locations on correct maps. Delivers serialization contract.

**Acceptance Scenarios**:

1. **Given** a game with main map + 3 sub-maps, each with 5+ entities, **When** game is serialized to JSON, **Then** JSON includes all maps with complete terrain layout and all entities with correct locations and properties.
2. **Given** JSON save file, **When** inspected, **Then** all terrain and entity state is present; no opaque or hidden state.
3. **Given** identical JSON save, **When** loaded into two game instances and both run for 100 identical ticks, **Then** both instances have identical map/entity state.
4. **Given** entity at location (map_id=5, x=10, y=20) in save, **When** save is loaded, **Then** entity is at same location on same map.
5. **Given** terrain alterations recorded in JSON (walls, furniture placement, etc.), **When** save is loaded, **Then** all alterations are present.

---

### User Story 7 - Procedural Generation Support (Priority: P2)

The terrain API and multi-map architecture are designed to support procedural generation of content (buildings, dungeons, forests, markets, wine cellars, etc.). While procedural generation algorithms themselves are out of scope for this feature, the terrain system must be extensible enough that generation scripts can: (a) create new maps with procedural layouts, (b) populate terrain with procedurally-placed entities, (c) define terrain variations (floor types, wall types, etc.). The system must not impose constraints that would prevent procedural generation.

**Why this priority**: Not required for MVP, but must be architected for; retroactively adding procedural support would be expensive. P2 because core terrain works without it, but sets up future extensibility.

**Independent Test**: Can be fully tested by: (a) writing a simple procedural generation script that creates a small building layout, (b) executing script on terrain API, (c) verifying generated layout is valid and entities can traverse it. Demonstrates architectural support without implementing full procedural system.

**Acceptance Scenarios**:

1. **Given** terrain alteration API, **When** used in a procedural script (no hardcoding of IDs), **Then** script can generate varied building layouts: single-room hut, multi-room house, dungeon with corridors, etc.
2. **Given** procedurally-generated map, **When** serialized to JSON and loaded, **Then** map is identical and entities behave identically to a hand-crafted map.
3. **Given** terrain API without procedural specifics, **When** evaluated by game designers, **Then** designers can envision how procedural tools would use the API.
4. **Given** multi-map architecture, **When** used in procedural context, **Then** scripts can create new sub-maps on-demand (e.g., enter a building, dungeon is generated and added to world).

---

### Edge Cases

- What happens if an entity is on a map that is deleted? → Must handle gracefully (move entity to main map or error clearly).
- What happens if pathfinding is requested on a map the entity is not on? → Must error or return null clearly.
- What happens if terrain is modified while entity is moving through it (wall appears)? → Movement should be re-evaluated or blocked.
- What happens if entity travels to a map, then that map is unloaded? → Must be clear whether maps stay loaded or are unloaded; design choice must be explicit.
- What happens if procedural generator tries to place entity at occupied location? → Error or displacement behavior must be defined.
- What happens if many entities occupy the same cell? → System allows co-location; no upper limit on occupants per cell.
- What happens in headless environments where there's no visual rendering? → Terrain queries and collision work identically.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST implement a cell-based spatial representation: discrete cells (grid cells for square maps, voronoi polygons for voronoi maps) are the atomic unit for game logic, pathfinding, and traversability. Game state records entity positions at cell granularity only. The renderer may interpolate between cells for smooth visual movement.
- **FR-002**: System MUST apply cell-based spatial representation consistently across all terrain types and maps. Each map has a declared grid type (square or voronoi); multiple maps may use different grid types.
- **FR-003**: System MUST provide API for placing entities in cells on a map.
- **FR-004**: System MUST prevent entity movement into non-traversable cells (walls, obstacles, locked doors, etc.).
- **FR-005**: System MUST expose queryable non-traversable reasons per cell (e.g., "wall", "water", "locked", "impassable_cliff") for game event triggers.
- **FR-006**: System MUST support per-map grid type selection: GameEngine defines a default grid type (voronoi for outdoor, square for indoor); individual maps have their grid type set at creation. Grid type is immutable once map is created.
- **FR-007**: System MUST provide deterministic pathfinding with a unified API: identical input (start cell, goal cell, terrain) produces identical path every time. Pathfinding uses A\* on the cell adjacency graph (4-connected for square, Delaunay dual for voronoi); caller does not specify algorithm.
- **FR-008**: System MUST handle unreachable goals gracefully (return null or "no path" response).
- **FR-009**: System MUST compute pathfinding for 100+ concurrent queries acceptably (<1s total), regardless of grid type.
- **FR-010**: System MUST support multiple maps/rooms/dungeons in single game world, each with independently-chosen grid types.
- **FR-011**: System MUST share global game time across all maps (regardless of grid type); entities on different maps progress simultaneously.
- **FR-012**: System MUST handle entity movement between maps seamlessly; entity state transitions correctly even when moving between maps with different grid types.
- **FR-013**: System MUST support diverse terrain types (open air, underground, buildings, etc.) with customizable properties per cell.
- **FR-014**: System MUST provide ergonomic API for terrain alteration (add/remove walls, place furniture, modify traversability). API is grid-type-agnostic; operations work identically on square and voronoi maps.
- **FR-015**: System MUST provide terrain query API to determine properties at locations (traversable, terrain type, obstacles, etc.). Queries are grid-type-transparent.
- **FR-016**: System MUST be extensible for procedural generation. Generators may be specialized for specific grid types (square grid generators for buildings; Voronoi generators for organic environments). Generators use terrain alteration API.
- **FR-017**: System MUST serialize grid type explicitly: map JSON includes `"gridType": "square"` or `"gridType": "voronoi"`. Coordinates and region references are serialized in grid-type-specific format.
- **FR-018**: System MUST deserialize terrain state from JSON identically to original state. Grid type from save is enforced; maps with mismatched grid type are rejected on load.
- **FR-019**: System MUST work identically in headless environments (no rendering layer).

### Key Entities

- **Terrain**: Represents spatial layout of a map/room/dungeon. Contains traversability data, obstacles, and entity positions. Grid type (square, Voronoi, etc.) is immutable and defined at map creation. Queryable by location.
- **TerrainType**: Definition of terrain category (forest, cave, plains, etc.) with default properties and visual characteristics. Terrain type can be used with any grid type.
- **Map**: A spatial region containing terrain and entities. Multiple maps coexist in same game world with unified time. Each map has an immutable grid type chosen at creation.
- **GridType**: Enumeration of supported spatial representations (square, voronoi). Grid type is baked into map and immutable; determines coordinate semantics and pathfinding graph structure.
- **Traversability**: Per-cell property indicating whether entities can enter (boolean plus reason string when blocked). Furniture and walls may set cells as non-traversable.
- **Path**: Sequence of cell indices from start to goal, computed by A\* pathfinding on the cell adjacency graph.
- **Location**: Coordinate in a map. Discrete cell index depends on grid type: square maps use `{ cellX: int, cellY: int }` (or flat index); voronoi maps use `{ cellIndex: int }`. Game logic operates on cell-level positions only. The renderer interpolates between cells for smooth visual movement.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Cell-based spatial representation implemented for square and voronoi grid types; entities are placed in cells and game logic operates at cell granularity.
- **SC-002**: Renderer smoothly interpolates entity movement between cells for visual presentation (renderer-only concern, not game state).
- **SC-003**: Traversability checks on 100+ entities execute correctly each tick in acceptable time (<50ms per tick), regardless of grid type.
- **SC-004**: Pathfinding for 100 concurrent queries completes in <1 second on both square and voronoi maps.
- **SC-005**: Pathfinding results are deterministic: identical queries return identical paths on both square and voronoi maps.
- **SC-006**: Multi-map architecture supports main map + 5+ sub-maps in single game world. Maps can use mixed grid types (main voronoi outdoor, sub-maps square tile).
- **SC-007**: Game time is synchronized across all maps regardless of grid type; all entities progress at same rate.
- **SC-008**: Entity travel between maps of different grid types succeeds correctly; entity position is expressed in target map's cell system.
- **SC-009**: Terrain API is sufficient for both square-grid procedural generators (cave, cellar) and voronoi generators (outdoor world).
- **SC-010**: Terrain and entity state serialization to JSON is complete and grid-type-aware; deserialization produces identical state.
- **SC-011**: Terrain queries execute in <5ms on maps with 1000+ cells, regardless of grid type.
- **SC-012**: Terrain system operates identically in headless and browser environments across all grid types.
- **SC-013**: Terrain alterations (add/remove walls, place furniture) persist through save/load cycles. Grid type is preserved in save and enforced on load.

## Clarifications

### Session 2026-05-02 (Grid Type & Multi-Pattern Support)

- Q: Should terrain support just one grid type or multiple grid types? → A: Per-map flexibility. Each map chooses its grid type (square or voronoi) at creation. Grid type is immutable once map exists.
- Q: What coordinate system should Voronoi maps use? → A: Cell-level only for game logic. Voronoi maps use cell index (polygon index) for entity positioning. The renderer interpolates between cell centroids for smooth visual movement.

### Cross-Cutting Session 2026-05-02

- Q: How should entity positions be represented and serialized across specs? → A: Discrete cells only: `{ mapId, cellIndex }`. Square maps also support `{ mapId, cellX, cellY }` as sugar. Pathfinding operates on cell adjacency graphs only. The renderer handles visual interpolation independently.

### Session 2026-05-04 (Consolidation)

- Q: Sub-cell precision model? → A: Cell-level for game logic; sub-cell for rendering interpolation only (renderer concern). No sub-cell data stored in game state.
- Q: Hitbox/collision model? → A: Replaced by cell traversability. Cells are traversable or not. Furniture/walls set cells as non-traversable. No per-entity collision volumes.

### Session 2026-05-02 (continued)

- Q: How should pathfinding adapt to different grid types? → A: Transparent adaptation. Pathfinding uses A\* on the cell adjacency graph (4-connected for square, Delaunay dual for voronoi). Caller specifies start and goal cells; algorithm is an implementation detail.
- Q: Should grid types be immutable once a map is created? → A: Yes, immutable. Grid type is baked into map saves.
- Q: Should procedural generators be grid-type-agnostic or specialized? → A: Specialized generators recommended. Square-grid generators for caves, cellars, building interiors. Voronoi generators for outdoor terrain (biomes, rivers, villages). Both use the same terrain alteration API.

## Assumptions

- **Spatial Representation: Cell-Based** — Cells are the atomic unit of game logic (occupancy, traversability, pathfinding, zone membership). Square maps use integer grid coordinates; voronoi maps use polygon indices. No sub-cell data in game state. The renderer interpolates between cell centroids for smooth entity movement.
- **Per-Map Grid Type Selection** — Each map declares its grid type (square or voronoi) at creation. Grid type is immutable.
- **Voronoi Coordinate Semantics** — Voronoi maps identify cells by polygon index. Cell centroids provide world-space coordinates for rendering. Adjacency is derived from the Delaunay dual graph.
- **Pathfinding Abstraction** — Pathfinding API is unified: start cell, goal cell, returns cell path. Internally uses A\* on the adjacency graph. Determinism is maintained via PRNG tie-breaking.
- **Grid Type Immutability in Saves** — Map saves include explicit `gridType` field. On load, grid type is verified.
- **Pathfinding Tie-Breaking via PRNG**: When multiple equally-valid paths exist, the game's seeded PRNG determines tie-breaking. Ensures deterministic pathfinding.
- **Atomic Map Transitions**: Entity map transitions are atomic operations — entity is removed from source cell and added to destination cell in one step.
- **Async Continuity During Travel**: Map transitions do not interrupt pending async operations.
- **Cell Traversability**: Cells are traversable or not. Traversability can be changed by placing/removing walls and furniture. No per-entity collision volumes.
- **Maps Remain Loaded**: All maps in game world remain loaded and active simultaneously (no streaming/unloading).
- **Single Authoritative Location**: Each entity exists at exactly one cell on exactly one map at any point in time.
- **Global Entity IDs**: Entity IDs are unique game-wide and stable across serialization.
- **Terrain Alterations are Permanent**: Once terrain is altered (wall added), alteration persists until explicitly changed.
- **Specialized Procedural Generators**: Square-grid generators for caves/cellars/interiors, voronoi generators for outdoor terrain. Both use the grid-agnostic terrain alteration API.
- **No Dynamic Terrain Streaming**: All maps are loaded at game start.
- **Entity Movement Discretized**: Entities move along cell paths; visual interpolation is handled by the renderer, not the game engine.
- **Headless Parity**: Headless execution has full parity with browser execution across all grid types.
