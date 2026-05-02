# Feature Specification: Game Map & Terrain System

**Feature Branch**: `004-map-terrain`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Another framework level feature is the game map/terrain. Most scenes will contain persons, furniture, tools. I want to research if this must be grid-based or can be something else. Some entities will have hitboxes, some terrain will not be traversable for different reasons. There must be pathfinding. There is one 'main' game terrain, but the user can travel to other maps/rooms/dungeons in the same game, that run on the same game time (ie all their events keep happening). There will be different kinds of terrain, such as in open air, underground/excavated, or in an above-ground building. The helper classes for this provide an ergonomic way of altering this terrain, so that later different generators can generate different implementations of a building, hut, forest, field, market, cave, wine cellar, and so on. Procedurally generating this contents is out of scope for this feature, but the feature must allow it."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Implement Hybrid Spatial Representation (Priority: P1)

The game uses a **hybrid spatial representation**: a grid of discrete cells for coarse traversability, pathfinding, and procedural generation; and continuous coordinates within each grid cell for precise entity placement and collision volumes. This combines the determinism and performance of grid-based pathfinding (A\*) with the precision of continuous placement. This story implements the foundational hybrid coordinate system and validates it across terrain types (building interiors, outdoor fields, caves).

**Why this priority**: Foundational architectural decision that affects all downstream terrain, pathfinding, and entity placement systems.

**Independent Test**: Can be fully tested by: (a) placing entities at sub-cell continuous positions, (b) running A\* pathfinding at grid level, (c) validating all terrain types (building, cave, field) are representable, (d) verifying serialization round-trips preserve both grid and sub-cell coordinates.

**Acceptance Scenarios**:

1. **Given** a terrain using hybrid coordinates, **When** entity is placed at precise sub-cell position (e.g., cell (3,5) + offset (0.4, 0.7)), **Then** position is recorded with sub-cell precision and queryable.
2. **Given** hybrid terrain, **When** A\* pathfinding runs at grid cell level, **Then** path is returned as sequence of grid cells, deterministic, and avoids non-traversable cells.
3. **Given** hybrid terrain, **When** applied to all terrain types (open air, underground, buildings), **Then** all types are representable without special cases.
4. **Given** hybrid coordinates (grid cell + sub-cell offset), **When** serialized to JSON and deserialized, **Then** both grid and sub-cell components are preserved without precision loss.
5. **Given** procedural generator using terrain API, **When** generator operates at grid cell level, **Then** generated layouts are valid and entities can be placed at continuous positions within cells.

---

### User Story 2 - Entity Placement and Collision Detection (Priority: P1)

Entities (citizens, NPCs, furniture, tools) can be placed on terrain at specific locations. Some entities have hitboxes (collision volume); some terrain is non-traversable for various reasons (walls, water, cliffs, locked doors). The system detects collisions and prevents entity movement into non-traversable areas. The collision system is ergonomic for game developers and performant for 100+ entities.

**Why this priority**: Core gameplay mechanic; entities must have locations and collisions must prevent clipping.

**Independent Test**: Can be fully tested by placing 50+ entities with various hitbox sizes, moving entities, detecting collisions, and verifying: (a) entities don't clip through obstacles, (b) collisions are detected in real-time, (c) performance remains acceptable. Delivers collision mechanics.

**Acceptance Scenarios**:

1. **Given** a terrain with walls and open space, **When** entity with hitbox is placed at open location, **Then** entity placement succeeds and is recorded in terrain.
2. **Given** an entity with hitbox, **When** movement is requested into non-traversable terrain (wall, water), **Then** movement is blocked or rejected with clear error.
3. **Given** 100+ entities with hitboxes on same terrain, **When** collision checks execute each game tick, **Then** all collisions detected correctly and frame time remains acceptable (<50ms per tick).
4. **Given** terrain with non-traversable features (locked door, cliff), **When** entities attempt movement, **Then** non-traversable reasons are queryable (e.g., "locked" vs. "impassable cliff") for potential game events.
5. **Given** entity hitbox and terrain layout, **When** serialized to JSON and deserialized, **Then** entity positions and collision state are preserved.

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
3. **Given** a terrain instance, **When** API call `terrain.queryTerrainAt(location)` is executed, **Then** terrain properties at that location are returned (traversable, type, hasHitbox, etc.).
4. **Given** terrain alteration API, **When** used in a procedural generation script, **Then** script can generate building layouts (rooms, hallways), populate furniture, and create coherent spaces without procedural generator baked into terrain system.
5. **Given** terrain alterations via API, **When** terrain is serialized to JSON and deserialized, **Then** all alterations are preserved and queries return identical results.

---

### User Story 6 - Terrain and Entity Serialization (Priority: P1)

All terrain state (layout, obstacles, traversability, entity locations) and entity state (position, hitbox, terrain affiliation) must serialize to JSON and deserialize identically. When a game is saved with entities on various maps, all terrain and entity state is captured; when loaded, entities are at correct locations on correct maps and game time is synchronized.

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
- What happens if hitbox sizes are very large relative to map size? → System should handle gracefully without performance degradation.
- What happens in headless environments where there's no visual rendering? → Terrain queries and collision work identically.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST implement a hybrid spatial representation: discrete regions (grid cells for square maps, Voronoi regions for Voronoi maps) for coarse pathfinding and traversability. Sub-cell precision is provided via an optional `PreciseOffset` component storing fixed-point integer offsets (thousandths of a cell/region) for rendering and collision. Pathfinding operates exclusively on discrete cells/regions.
- **FR-002**: System MUST apply hybrid spatial representation consistently across all terrain types and maps. Each map has a declared grid type (square, Voronoi, or hexagonal); multiple maps may use different grid types.
- **FR-003**: System MUST provide API for placing entities on terrain at specified locations with optional hitbox specification.
- **FR-004**: System MUST prevent entity movement into non-traversable terrain (walls, obstacles, locked doors, etc.).
- **FR-005**: System MUST queryable non-traversable reasons (e.g., "wall", "water", "locked", "impassable_cliff") for game event triggers.
- **FR-006**: System MUST support per-map grid type selection: GameEngine defines a default grid type (square); individual maps can override with Voronoi, hexagonal, or other supported types. Grid type is immutable once map is created.
- **FR-007**: System MUST provide deterministic pathfinding with a unified API: identical input (start, goal, terrain) produces identical path every time. Pathfinding algorithm is selected transparently based on grid type (A\* for square, Delaunay-graph search for Voronoi); caller does not specify algorithm.
- **FR-008**: System MUST handle unreachable goals gracefully (return null or "no path" response).
- **FR-009**: System MUST compute pathfinding for 100+ concurrent queries acceptably (<1s total), regardless of grid type.
- **FR-010**: System MUST support multiple maps/rooms/dungeons in single game world, each with independently-chosen grid types.
- **FR-011**: System MUST share global game time across all maps (regardless of grid type); entities on different maps progress simultaneously.
- **FR-012**: System MUST handle entity movement between maps seamlessly; entity state transitions correctly even when moving between maps with different grid types.
- **FR-013**: System MUST support diverse terrain types (open air, underground, buildings, etc.) with customizable properties and grid-type-specific behaviors.
- **FR-014**: System MUST provide ergonomic API for terrain alteration (add/remove walls, place furniture, modify traversability). API is grid-type-agnostic; operations work identically on square and Voronoi maps.
- **FR-015**: System MUST provide terrain query API to determine properties at locations (traversable, terrain type, obstacles, etc.). Queries are grid-type-transparent.
- **FR-016**: System MUST be extensible for procedural generation. Generators may be specialized for specific grid types (square grid generators for buildings; Voronoi generators for organic environments). Generators use terrain alteration API.
- **FR-017**: System MUST serialize grid type explicitly: map JSON includes `"gridType": "square"` or `"gridType": "voronoi"`. Coordinates and region references are serialized in grid-type-specific format.
- **FR-018**: System MUST deserialize terrain state from JSON identically to original state. Grid type from save is enforced; maps with mismatched grid type are rejected on load.
- **FR-019**: System MUST work identically in headless environments (no rendering layer).

### Key Entities

- **Terrain**: Represents spatial layout of a map/room/dungeon. Contains traversability data, obstacles, and entity positions. Grid type (square, Voronoi, etc.) is immutable and defined at map creation. Queryable by location.
- **TerrainType**: Definition of terrain category (building, forest, cave, etc.) with default properties and visual characteristics. Terrain type can be used with any grid type.
- **Map**: A spatial region containing terrain and entities. Multiple maps coexist in same game world with unified time. Each map has an immutable grid type chosen at creation.
- **GridType**: Enumeration of supported spatial representations (square, Voronoi, hexagonal, etc.). Grid type is baked into map and immutable; determines coordinate semantics and pathfinding algorithm.
- **Hitbox**: Collision volume for entity. Rectangular, circular, or custom shape. Blocks movement and collision detection. Works identically on all grid types.
- **Path**: Sequence of regions/cells from start to goal, computed by pathfinding algorithm. Algorithm is chosen transparently based on grid type.
- **Location**: Coordinate in a map. Discrete position depends on grid type: square maps use `{ cellX: int, cellY: int }`; Voronoi maps use `{ regionId: int }`. Sub-cell precision is stored in a separate optional `PreciseOffset` component: `{ offsetX: int, offsetY: int }` (fixed-point integers, thousandths of a cell). Pathfinding operates on discrete Location; rendering uses PreciseOffset for visual interpolation.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Hybrid spatial representation implemented for multiple grid types; entities can be placed at sub-cell continuous positions in square or Voronoi maps.
- **SC-002**: Spatial representation supports entity placement at arbitrary sub-cell precision (continuous offset within grid cell or Voronoi region) for both square and Voronoi maps.
- **SC-003**: Collision detection on 100+ entities with hitboxes executes correctly each tick in acceptable time (<50ms per tick), regardless of grid type.
- **SC-004**: Pathfinding for 100 concurrent queries completes in <1 second on both square and Voronoi maps.
- **SC-005**: Pathfinding results are deterministic: identical queries return identical paths on both square and Voronoi maps.
- **SC-006**: Multi-map architecture supports main map + 5+ sub-maps in single game world. Maps can use mixed grid types (main map square, dungeons Voronoi, etc.).
- **SC-007**: Game time is synchronized across all maps regardless of grid type; all entities progress at same rate.
- **SC-008**: Entity travel between maps of different grid types succeeds correctly; entity location is re-expressed in target map's coordinate system.
- **SC-009**: Terrain API is sufficient for both square-grid procedural generators (building layouts) and Voronoi generators (organic environments).
- **SC-010**: Terrain and entity state serialization to JSON is complete and grid-type-aware; deserialization produces identical state.
- **SC-011**: Terrain queries execute in <5ms on maps with 1000+ terrain cells/regions, regardless of grid type.
- **SC-012**: Terrain system operates identically in headless and browser environments across all grid types.
- **SC-013**: Terrain alterations (add/remove walls, place furniture) persist through save/load cycles. Grid type is preserved in save and enforced on load.

## Clarifications

### Session 2026-05-02 (Grid Type & Multi-Pattern Support)

- Q: Should terrain support just one grid type or multiple grid types? → A: Per-map flexibility. GameEngine defines a default grid type (typically square); individual maps can independently choose their grid type (square, Voronoi, hexagonal, etc.) at creation. Grid type is immutable once map exists.
- Q: What coordinate system should Voronoi maps use? → A: Hybrid for both. Voronoi maps use hybrid representation just like square grids: Voronoi regions (discrete) + continuous sub-region offsets. A Voronoi location is (region_id, offset_x, offset_y). Maintains semantic parallelism with square grids.

### Cross-Cutting Session 2026-05-02

- Q: How should entity positions be represented and serialized across specs? → A: Discrete cells only for Position component: `{ mapId, cellX, cellY }` (square) or `{ mapId, regionId }` (Voronoi). Sub-cell offsets in optional `PreciseOffset` component as fixed-point integers (thousandths of a cell). Pathfinding operates on discrete cells/regions only. This satisfies save format integer-only constraint (FR-014) while supporting visual precision via separate component.

### Session 2026-05-02 (continued)

- Q: How should pathfinding adapt to different grid types? → A: Transparent adaptation. Pathfinding API is unified; the system automatically chooses appropriate algorithm based on grid type (A\* for square grids, Delaunay-graph search for Voronoi). Caller does not specify algorithm; it's an implementation detail.
- Q: Should grid types be immutable once a map is created? → A: Yes, immutable. Grid type is baked into map saves. On load, if the save specifies `gridType: voronoi` but the map was created as `square`, load is rejected with clear error. No automatic conversion between grid types.
- Q: Should procedural generators be grid-type-agnostic or specialized? → A: Specialized generators recommended. Square-grid generators for building interiors (rectilinear patterns). Voronoi generators for organic environments (forests, caves, irregular dungeons). Both use the same terrain alteration API but leverage grid-specific optimizations.

## Assumptions

- **Spatial Representation: Discrete + Optional Precision** — Grid cells/regions define coarse traversability and pathfinding; sub-cell precision is provided via an optional `PreciseOffset` component (fixed-point integers, thousandths of a cell) for rendering and collision. Pathfinding operates exclusively on discrete cells/regions. Multiple grid types (square, Voronoi, hexagonal) are supported; each map chooses its grid type at creation. Grid type is immutable once map exists.
- **Per-Map Grid Type Selection** — GameEngine defines a default grid type (typically square); individual maps can override at creation time. All entities and pathfinding adapt transparently to the map's grid type.
- **Voronoi Coordinate Semantics** — Voronoi maps use hybrid representation: Voronoi regions (determined by Poisson-disk sampling or Delaunay triangulation) serve as discrete regions; entities within a region have continuous sub-region offsets. Semantically parallel to square grid.
- **Pathfinding Abstraction** — Pathfinding API is unified across grid types. Internally, A\* is used for square grids and Delaunay-graph search for Voronoi. Caller does not specify algorithm; it's chosen transparently based on map's grid type. Determinism is maintained via PRNG tie-breaking.
- **Grid Type Immutability in Saves** — Map saves include explicit `gridType` field. On load, grid type is verified; saves from mismatched grid types are rejected with clear error. No automatic conversion between grid types (conversion is out of scope).
- **Pathfinding Tie-Breaking via PRNG**: When multiple equally-valid paths exist, the game's seeded PRNG determines tie-breaking. Ensures deterministic pathfinding without a path cache or serialized query queue. Works identically on both square and Voronoi maps.
- **Atomic Map Transitions**: Entity map transitions are atomic operations — entity is removed from source and added to destination in one step; no transient "traveling" state. Entity location is re-expressed in target map's coordinate system (e.g., square (3,5,0.4,0.7) → Voronoi (region_id=42, 0.3, 0.6)).
- **Async Continuity During Travel**: Map transitions do not interrupt or pause pending async operations. All entity operations continue advancing through game ticks while the entity is transitioning, even when moving between grids of different types.
- **Entity Hitbox Optional**: Not all entities need hitboxes; system supports both hitbox and non-hitbox entities on all grid types.
- **Maps Remain Loaded**: All maps in game world remain loaded and active simultaneously (no streaming/unloading), regardless of grid type. If streaming is needed later, architecture must support it.
- **Single Authoritative Location**: Each entity exists at exactly one location on exactly one map at any point in time; no duplication or visibility layers. Location semantics adapt to map's grid type.
- **Global Entity IDs**: Entity IDs are unique game-wide and stable across serialization. Loading a new game unloads all entities; the new game has its own independent entity ID space. IDs are grid-type-agnostic.
- **Terrain Alterations are Permanent**: Once terrain is altered (wall added), alteration persists until explicitly changed (no auto-revert). Alterations are preserved through save/load and grid-type compatibility is guaranteed.
- **Specialized Procedural Generators**: Procedural generation may use specialized generators for specific grid types. Example: square-grid generators for building interiors, Voronoi generators for forests/caves. Generators use the grid-agnostic terrain alteration API but may leverage grid-specific optimization strategies.
- **Procedural API Grid-Agnostic**: The terrain alteration and query APIs work identically on square and Voronoi maps. Generators can be written to be grid-type-agnostic by using abstract operations (placeWall, queryTerrain, etc.).
- **No Dynamic Terrain Streaming**: Terrain for all maps is loaded at game start; on-demand loading is out of scope. All maps with all grid types are initialized before gameplay begins.
- **Entity Movement Discretized**: Entities move along region/cell paths (not continuous curves); sub-cell interpolation for rendering is handled by the rendering layer, not the terrain system. Works identically for square and Voronoi.
- **Headless Parity**: Headless execution has full parity with browser execution across all grid types; no features exclusive to one or the other.
