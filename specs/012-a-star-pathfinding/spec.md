# Feature Specification: A\* Pathfinding System

**Created**: 2026-05-02
**Input**: User description: "Specify the pathfinding algorithm. Base it on A\*. It needs to be able to find its way through different maps/rooms/areas from the main map"

## User Scenarios & Testing

### User Story 1 - Find Path Within Single Map (Priority: P1)

An entity needs to navigate from its current position to a target location within a single map or room. The pathfinding system should find an optimal route avoiding obstacles.

**Why this priority**: This is the core pathfinding capability. All other features depend on this working correctly. Without this, entities cannot navigate at all.

**Independent Test**: Can be tested by: (1) placing an entity at start position, (2) setting a target position, (3) calling pathfinding, (4) verifying returned path avoids walls/obstacles and reaches the target.

**Acceptance Scenarios**:

1. **Given** an entity at position (5,5) in an empty square map, **When** requesting path to (15,15), **Then** a valid path is returned with length equal to the Manhattan distance (4-connected movement)
2. **Given** an entity at position (5,5) with a wall at (6,5), **When** requesting path to (15,5), **Then** the path goes around the wall, not through it
3. **Given** an entity at position (5,5) surrounded by walls, **When** requesting path to any reachable position, **Then** a valid path is returned or "no path" is indicated
4. **Given** start and target are the same position, **When** requesting path, **Then** returns empty path (already at target)

---

### User Story 2 - Cross-Map Navigation (Priority: P2)

An entity needs to navigate between different maps/rooms/areas. The pathfinding system should find a path that exits one map and enters another through connection points (exits/entrances).

**Why this priority**: Essential for game world traversal and entity movement between regions. Enables multi-map gameplay. Can be implemented after single-map pathfinding works.

**Independent Test**: Can be tested by: (1) creating two connected maps with defined exits, (2) placing entity on map A, (3) setting target on map B, (4) verifying path goes through exit → entrance sequence and reaches target.

**Acceptance Scenarios**:

1. **Given** map A with exit at (20,10) connecting to map B entrance at (0,10), **When** entity at (5,5) in map A requests path to (15,15) in map B, **Then** path includes transition from map A exit to map B entrance
2. **Given** two maps with no connection, **When** entity requests path between them, **Then** system returns "no path exists" (callers may use the reachability query, FR-010, to find the closest reachable position)
3. **Given** entity at map A wanting to reach map C, **When** path requires transiting through map B, **Then** path is computed through intermediate map correctly
4. **Given** multiple possible routes between maps, **When** pathfinding computes path, **Then** optimal (shortest) route is selected

---

### User Story 3 - Dynamic Obstacle Avoidance (Priority: P2)

The pathfinding system should handle obstacles that change over time (walls, doors and furniture being built or removed) and recompute paths as the environment changes. Other entities never block a cell (spec 004).

**Why this priority**: Important for realistic entity behavior in a living simulation. Entities should respond to environmental changes. Can be deferred to phase 2 if basic pathfinding is complete.

**Independent Test**: Can be tested by: (1) computing initial path, (2) placing obstacle on computed path, (3) verifying entity either replans or detects obstacle in advance.

**Acceptance Scenarios**:

1. **Given** entity following a path, **When** new obstacle appears on path ahead, **Then** system detects it and recomputes path or alerts entity to replanned route
2. **Given** entity moving toward target, **When** target moves, **Then** path can be recomputed to follow moving target (if requested)
3. **Given** multiple entities requesting paths simultaneously, **When** computing paths, **Then** each entity gets valid path (system handles concurrent requests)

---

### User Story 4 - Cost-Based Pathfinding (Priority: P3)

Pathfinding can prefer different terrain types based on travel cost (e.g., roads are faster than wilderness, water requires swimming).

**Why this priority**: Enhances realism and gameplay depth but is not essential for basic movement. Can be added after core A\* works. Optional for MVP.

**Independent Test**: Can be tested by: (1) defining terrain costs, (2) computing path with different cost preferences, (3) verifying paths choose lower-cost terrain when reasonable.

**Acceptance Scenarios**:

1. **Given** road terrain costs 1 and grass costs 2 (integer costs), **When** path to target can use either, **Then** road path is preferred
2. **Given** entity with different movement types (fast on road, slow in forest), **When** computing path, **Then** cost is adjusted accordingly
3. **Given** impassable terrain, **When** computing path, **Then** impassable cells are excluded from the search (never entered)

---

### Edge Cases

- What happens when target position is outside map bounds? → The target is not a valid cell of the map; pathfinding returns "no path" (invalid position) without crashing (SC-005, spec 004 edge cases).
- What happens when start position is blocked by an obstacle? → **Open question:** may an entity standing in a cell that became non-traversable (e.g. a wall built on it) path out of it, or is it reported as stuck?
- How does system handle very long paths (performance)? → Bounded by the performance budgets (FR-008, SC-002, spec 004 FR-009); cross-map routes are resolved via Transition entities. **Open question:** whether a search node limit applies.
- What happens if map data changes during pathfinding computation? → Not possible: pathfinding runs synchronously within a tick and costs are static within a tick; later changes are handled by path invalidation (FR-006).
- How are diagonal vs orthogonal movements handled (4-way vs 8-way)? → Movement follows the map's adjacency graph (spec 004): 4-connected on square maps (no diagonals), Delaunay neighbours on voronoi maps.
- What happens when entity is on one map and target is on disconnected map island? → "No path exists" is returned (FR-004).

## Requirements

### Functional Requirements

- **FR-001**: System MUST implement A\* on the cell adjacency graph defined by spec 004 (4-connected for square maps, Delaunay dual for voronoi maps) with integer edge costs and an admissible heuristic: Manhattan distance for square maps; for voronoi maps a straight-line (centroid) distance lower bound, scaled to integers and rounded down so it never overestimates
- **FR-002**: System MUST find shortest path from start to target in single map, avoiding non-traversable cells (terrain registry traversability, wall entities, and door entities per their state)
- **FR-003**: System MUST move only along adjacency-graph edges: orthogonal steps on square maps (no diagonal movement), Delaunay neighbours on voronoi maps. All costs are integers
- **FR-004**: System MUST return "no path exists" when target is unreachable from start position
- **FR-005**: System MUST support cross-map navigation with defined exit/entrance connection points
- **FR-006**: System MUST cache/validate paths and detect when obstacles invalidate cached paths
- **FR-007**: System MUST handle concurrent pathfinding requests without race conditions
- **FR-008**: Pathfinding MUST complete within acceptable time frame (< 100ms for typical room-sized map)
- **FR-009**: System MUST allow configuration of terrain costs for different tile types
- **FR-010**: System MUST support querying: "what is reachable from position X?" for analysis

### Key Entities

- **PathNode**: Represents a discrete cell in A\* search (cellIndex, cost, heuristic, parent)
- **Path**: Sequence of discrete cells/regions from start to target, or empty if no path exists
- **Map**: World region with terrain grid and entities (see spec 004). Grid type determines coordinate semantics.
- **Transition**: Entity with Position and Transition components defining passage between maps
- **MovementCost**: Defines integer travel cost for different terrain types or entity states

## Success Criteria

### Measurable Outcomes

- **SC-001**: A\* returns an optimal (minimum-cost) path on the adjacency graph in 100% of cases, with deterministic tie-breaking (identical input produces an identical path)
- **SC-002**: Pathfinding completes in < 100ms for 50x50 map with 20% obstacles
- **SC-003**: Cross-map paths work correctly with <= 50ms overhead for map transitions
- **SC-004**: Entities following computed paths reach destinations in all test scenarios
- **SC-005**: System gracefully handles edge cases (unreachable targets, invalid positions) without crashes
- **SC-006**: Multiple entities can request paths simultaneously with no performance degradation
- **SC-007**: Recomputing path after obstacle change takes < 50ms

## Assumptions

- **Map Structure**: Maps are cell-based (spec 004) with discrete cell coordinates. Positions are `{ cellIndex }` integers on every grid type; square maps also accept `{ cellX, cellY }` as sugar (spec 004). Pathfinding operates on these discrete positions only. Visual interpolation between cells is a renderer-only concern and is not relevant to pathfinding.
- **Terrain Types**: Map terrain is stored as string IDs from the terrain registry (spec 022, e.g. `grassland`, `water_shallow`, `rock_wall`), which defines traversability and movement cost. Built walls and doors are entities occupying a cell and set its traversability (doors per their state). Different terrain types can have different integer movement costs
- **Entities Do Not Block**: Multiple entities may share a cell (spec 004); only terrain traversability and wall/door/furniture entities that set a cell non-traversable affect pathfinding
- **No Diagonal Movement**: Square maps are 4-connected; voronoi maps use Delaunay neighbours (spec 004). Costs are integers (no √2)
- **No Flying**: Entities cannot fly over obstacles unless explicitly marked as flying type
- **Map Connections**: Inter-map connections are defined as Transition entities (per spec 006) with Position and Transition components; pathfinding resolves cross-map routes via these entities
- **Static Costs**: Terrain costs are static within a game tick; paths don't need to account for probabilities
- **Heuristic**: Manhattan distance is the admissible heuristic for 4-connected square maps. On voronoi maps the heuristic is the straight-line distance between cell centroids, scaled to integers and rounded down, so it is a lower bound of the integer path cost. Both are multiplied by the minimum per-step terrain cost so they never overestimate.
- **Tie-Breaking**: When multiple equally-valid paths exist, ties are broken deterministically using the game's seeded PRNG (spec 004).

> **Amended by DECISIONS.md D-21**: tie-breaking is a pure function `(f, h, cellIndex)` ascending; the PRNG is never used by pathfinding. Results use an explicit `PathResult` (`Found | AlreadyThere | NoPath`).
- **Memory**: Pathfinding can maintain open/closed sets in memory; no disk-based search needed
- **No Multiplayer Sync**: Pathfinding is client-side/server-side deterministic; no real-time multiplayer synchronization issues
