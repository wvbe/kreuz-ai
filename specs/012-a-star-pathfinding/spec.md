# Feature Specification: A\* Pathfinding System

**Feature Branch**: `012-a-star-pathfinding`
**Created**: 2026-05-02
**Status**: Unimplemented (fresh start)
**Input**: User description: "Specify the pathfinding algorithm. Base it on A\*. It needs to be able to find its way through different maps/rooms/areas from the main map"

> **Note (2026-05-04)**: A previous implementation of this feature was discarded. This spec is being reimplemented from scratch following the conventions in spec 023 (TypeScript code style). All code lives under `src/game/`, tests are co-located, no barrel files, no default exports. Entities are pure data objects; systems provide behavior. See spec 023 for the full code style reference.


## User Scenarios & Testing _(mandatory)_

### User Story 1 - Find Path Within Single Map (Priority: P1)

An entity needs to navigate from its current position to a target location within a single map or room. The pathfinding system should find an optimal route avoiding obstacles.

**Why this priority**: This is the core pathfinding capability. All other features depend on this working correctly. Without this, entities cannot navigate at all.

**Independent Test**: Can be tested by: (1) placing an entity at start position, (2) setting a target position, (3) calling pathfinding, (4) verifying returned path avoids walls/obstacles and reaches the target.

**Acceptance Scenarios**:

1. **Given** an entity at position (5,5) in an empty map, **When** requesting path to (15,15), **Then** a valid path is returned with length <= manhattan distance + 1
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
2. **Given** two maps with no connection, **When** entity requests path between them, **Then** system returns "no path exists" or suggests closest reachable position
3. **Given** entity at map A wanting to reach map C, **When** path requires transiting through map B, **Then** path is computed through intermediate map correctly
4. **Given** multiple possible routes between maps, **When** pathfinding computes path, **Then** optimal (shortest) route is selected

---

### User Story 3 - Dynamic Obstacle Avoidance (Priority: P2)

The pathfinding system should handle obstacles that change over time (other entities, dynamic structures) and recompute paths as the environment changes.

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

1. **Given** road terrain costs 1.0 and grass costs 2.0, **When** path to target can use either, **Then** road path is preferred
2. **Given** entity with different movement types (fast on road, slow in forest), **When** computing path, **Then** cost is adjusted accordingly
3. **Given** impassable terrain, **When** computing path, **Then** impassable terrain is treated as infinite cost

---

### Edge Cases

- What happens when target position is outside map bounds?
- What happens when start position is blocked by an obstacle?
- How does system handle very long paths (performance)?
- What happens if map data changes during pathfinding computation?
- How are diagonal vs orthogonal movements handled (4-way vs 8-way)?
- What happens when entity is on one map and target is on disconnected map island?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST implement A\* algorithm for pathfinding with admissible heuristic function (Octile distance for 8-way movement with diagonal cost √2)
- **FR-002**: System MUST find shortest path from start to target in single map, avoiding obstacles (terrain/entities)
- **FR-003**: System MUST support 8-way movement (orthogonal + diagonal) with diagonal movement costing 1.414x orthogonal
- **FR-004**: System MUST return "no path exists" when target is unreachable from start position
- **FR-005**: System MUST support cross-map navigation with defined exit/entrance connection points
- **FR-006**: System MUST cache/validate paths and detect when obstacles invalidate cached paths
- **FR-007**: System MUST handle concurrent pathfinding requests without race conditions
- **FR-008**: Pathfinding MUST complete within acceptable time frame (< 100ms for typical room-sized map)
- **FR-009**: System MUST allow configuration of terrain costs for different tile types
- **FR-010**: System MUST support querying: "what is reachable from position X?" for analysis
- **FR-011**: System MUST handle entities as dynamic obstacles (temporarily block paths when occupied)

### Key Entities

- **PathNode**: Represents a discrete cell in A\* search (cellX/cellY or cellIndex, cost, heuristic, parent)
- **Path**: Sequence of discrete cells/regions from start to target, or empty if no path exists
- **Map**: World region with terrain grid and entities (see spec 004). Grid type determines coordinate semantics.
- **Transition**: Entity with Position and Transition components defining passage between maps (replaces MapConnection)
- **MovementCost**: Defines travel cost for different terrain types or entity states

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Pathfinding finds shortest path within optimal solution in 95% of cases
- **SC-002**: Pathfinding completes in < 100ms for 50x50 map with 20% obstacles
- **SC-003**: Cross-map paths work correctly with <= 50ms overhead for map transitions
- **SC-004**: Entities following computed paths reach destinations in all test scenarios
- **SC-005**: System gracefully handles edge cases (unreachable targets, invalid positions) without crashes
- **SC-006**: Multiple entities can request paths simultaneously with no performance degradation
- **SC-007**: Recomputing path after obstacle change takes < 50ms

## Assumptions

- **Map Structure**: Maps are grid-based with discrete cell coordinates. Square maps use `{ cellX, cellY }` integers; voronoi maps use `{ cellIndex }` integers. Pathfinding operates on these discrete positions only. Visual interpolation between cells is a renderer-only concern and is not relevant to pathfinding.
- **Terrain Types**: Map terrain is stored as simple type identifiers (e.g., "empty", "wall", "water"). Different terrain types can have different movement costs
- **Entity Obstacles**: Other entities are treated as obstacles; their positions block movement
- **Diagonal Movement**: Movement is allowed diagonally; diagonal movement costs 1.414x orthogonal (√2)
- **No Flying**: Entities cannot fly over obstacles unless explicitly marked as flying type
- **Map Connections**: Inter-map connections are defined as Transition entities (per spec 006) with Position and Transition components; pathfinding resolves cross-map routes via these entities
- **Static Costs**: Terrain costs are static within a game tick; paths don't need to account for probabilities
- **Heuristic**: Octile distance (max(dx, dy) + (√2 - 1) \* min(dx, dy)) is the admissible heuristic for 8-way movement with diagonal cost √2. Manhattan distance is NOT admissible for diagonal movement and would produce suboptimal paths.
- **Memory**: Pathfinding can maintain open/closed sets in memory; no disk-based search needed
- **No Multiplayer Sync**: Pathfinding is client-side/server-side deterministic; no real-time multiplayer synchronization issues
