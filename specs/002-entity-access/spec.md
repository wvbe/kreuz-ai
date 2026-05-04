# Feature Specification: Entity Access & Query Helpers

**Feature Branch**: `002-entity-access`
**Created**: 2026-05-02
**Status**: Unimplemented (fresh start)
**Input**: User description: "Another important framework-level functionality is the access to game entities. The game design relies on the entity/component/system paradigm, so there should be efficient helper methods to get entities by their properties, or to get entities that are related to another in-game entity, object or event. This feature should include somewhat of a benchmarking test. This product of this feature is a set of reusable helper classes that will be in use throughout the rest of the game design."

> **Note (2026-05-04)**: A previous implementation of this feature was discarded. This spec is being reimplemented from scratch following the conventions in spec 023 (TypeScript code style). All code lives under `src/game/`, tests are co-located, no barrel files, no default exports. Entities are pure data objects; systems provide behavior. See spec 023 for the full code style reference.


## User Scenarios & Testing _(mandatory)_

### User Story 1 - Query Entities by Component Type (Priority: P1)

Game developers and systems need to efficiently retrieve all entities that possess a specific component (e.g., all entities with a `Position` component, all entities with a `Citizen` component). This is the foundational query operation for the ECS paradigm; every system that processes component data relies on this capability.

**Why this priority**: Core architectural requirement for entity/component/system paradigm. Every game system depends on this query.

**Independent Test**: Can be fully tested by creating a game state with 100+ entities of mixed component compositions, querying for entities with a specific component type, and verifying: (a) only entities with that component are returned, (b) query completes in measurable time (benchmarked), (c) subsequent queries return consistent results. Delivers foundational query mechanism.

**Acceptance Scenarios**:

1. **Given** a game with 50 entities, 30 with `Citizen` component and 20 without, **When** query `getEntitiesByComponent("Citizen")` is called, **Then** exactly 30 entities are returned.
2. **Given** a game with 100+ entities of various component types, **When** query executes, **Then** query completes in under 1ms (benchmarked on reference hardware).
3. **Given** a query result for entities with component type X, **When** a new entity with component type X is added, **Then** subsequent queries include the new entity.
4. **Given** a headless game state with no renderer, **When** entity queries execute, **Then** queries work identically to a rendered version and return identical entity lists.

---

### User Story 2 - Query Entities by Property Values (Priority: P1)

Game systems need to find entities matching specific property criteria (e.g., "all citizens with job type = farmer", "all resources with type = wood", "all factions with alignment < -50"). These filters enable dynamic behavior without hardcoding entity relationships.

**Why this priority**: Enables dynamic gameplay mechanics (faction politics, job assignment, resource management). Required for decoupling game logic from hardcoded entity references.

**Independent Test**: Can be fully tested by creating entities with varied property values, querying with property filters, and verifying: (a) only matching entities returned, (b) multiple property filters can be combined (AND logic), (c) query performance remains predictable even with many entities. Delivers property-based filtering.

**Acceptance Scenarios**:

1. **Given** 200 citizens with varied job types, **When** query `getEntitiesByProperty('Citizen.jobType', 'farmer')` is called, **Then** all entities with jobType = "farmer" are returned, no others.
2. **Given** entities with numeric component fields (e.g., `Faction.alignment`, `Citizen.wealth`), **When** query with range filter `getEntitiesByProperty('Faction.alignment', { min: -50, max: 0 })` is called, **Then** only entities within that range are returned.
3. **Given** a query combining multiple component fields, **When** query `getEntitiesByProperties({ 'Citizen.faction': 'red', 'Citizen.status': 'active' })` is called, **Then** only entities matching ALL fields are returned (AND logic).
4. **Given** saved game state with specific property values, **When** game is loaded and queries execute, **Then** queries return identical results (deterministic).

---

### User Story 3 - Query Related Entities (Priority: P2)

Game developers need to find entities related to a given entity through defined relationships (e.g., "get all citizens in faction X", "get all jobs assigned to citizen Y", "get all resources consumed by entity Z"). Relationships may be direct (stored on entities) or inferred from component presence and properties.

**Why this priority**: Enables coherent gameplay systems without hardcoding relationships. P2 because core queries (by component, by property) are primary; related-entity queries build on those.

**Independent Test**: Can be fully tested by establishing relationships between entities (faction members, job assignments, resource flows), then querying related entities and verifying: (a) all related entities are found, (b) relationship direction is respected, (c) circular relationships don't cause infinite loops. Delivers relationship traversal.

**Acceptance Scenarios**:

1. **Given** a faction entity with 50 member citizen entities linked via `factionId` property, **When** query `getRelatedEntities(factionEntity, "members")` is called, **Then** all 50 member citizens are returned.
2. **Given** a citizen entity with assigned job entity, **When** query `getRelatedEntity(citizenEntity, "currentJob")` is called, **Then** the job entity is returned (single entity).
3. **Given** a circular relationship (citizen → job → resource → produced by citizen), **When** traversal queries execute, **Then** infinite loops are prevented and queries complete successfully.
4. **Given** headless game state with relationships serialized in JSON, **When** game is loaded and relationship queries execute, **Then** relationships are correctly reconstructed and queries return identical results.

---

### User Story 4 - Helper Classes for Common Query Patterns (Priority: P2)

Game developers repeatedly use the same query patterns (e.g., "get all active citizens", "find nearest entities", "filter by faction + status"). Reusable helper classes encapsulate these patterns, reducing boilerplate and ensuring consistent behavior across systems.

**Why this priority**: Improves developer experience and code maintainability. P2 because basic queries must work first, but helpers are essential for framework usability.

**Independent Test**: Can be fully tested by implementing 5+ common query helper classes, using them throughout a test scenario, and verifying: (a) helpers encapsulate complex queries, (b) helpers are composable, (c) helper usage reduces code duplication across systems. Delivers framework utility.

**Acceptance Scenarios**:

1. **Given** a `CitizenQueries` helper class with methods like `getActiveCitizens()`, `getCitizensInFaction(factionId)`, **When** system code calls helper methods, **Then** methods return correct entity lists with zero boilerplate.
2. **Given** helper methods that filter by multiple criteria, **When** helpers are composed (e.g., `getActiveCitizens().filter(...)`), **Then** composition is intuitive and maintains performance.
3. **Given** framework code using query helpers throughout game systems, **When** developers refactor entity structure, **Then** changes needed only in helper classes, not throughout codebase.
4. **Given** a list of available query helpers, **When** developer encounters a new query need, **Then** developer can either use existing helper or extend pattern without re-implementing core query logic.

---

### User Story 5 - Benchmark and Performance Validation (Priority: P1)

The feature must include benchmarking tests that measure query performance under realistic conditions (hundreds or thousands of entities). Benchmarks establish performance baselines, enable regression detection, and validate that queries remain efficient as entity count grows.

**Why this priority**: Ensures queries remain performant at scale and alerts developers to regressions. P1 because performance is critical to game responsiveness; slow queries degrade gameplay.

**Independent Test**: Can be fully tested in headless environment by running benchmark suite: (a) query performance with 100 entities, 1000 entities, 10000+ entities, (b) measure query times, (c) verify sub-linear or linear scaling, (d) establish acceptable performance thresholds. Delivers performance guardrails.

**Acceptance Scenarios**:

1. **Given** benchmark suite with varied entity counts (100, 1000, 10000+), **When** benchmarks execute, **Then** query times are recorded and reported.
2. **Given** baseline performance from initial run, **When** benchmarks run in CI/CD pipeline, **Then** new results are compared to baseline; significant regressions (>10% slowdown) trigger alerts.
3. **Given** a query operation, **When** executed on 10,000 entities, **Then** query completes in deterministic time (no memory leaks, consistent performance across runs).
4. **Given** benchmark results, **When** serialized to JSON report, **Then** report includes entity count, query type, execution time, and memory usage for analysis.

---

### Edge Cases

- What happens if a query is performed on empty entity collection? → Should return empty result gracefully, not error.
- What happens if a query specifies a component type that no entity has? → Should return empty result.
- What happens if relationship target entities are deleted while relationship queries execute? → System throws an error. Dangling relationships are treated as data integrity violations, not gracefully skipped.
- What happens if property filter value doesn't match any entity? → Should return empty result.
- What happens if multiple related entities exist for a query expecting single entity? → Should either return first match or error with clear message (design choice).
- What happens during high-frequency queries (e.g., 1000+ queries per tick)? → The framework performs full scans; no built-in caching. Callers that require cache behavior must implement it themselves.
- What happens if entity state is modified during query iteration? → Queries return a live view; callers are responsible for not modifying the entity collection mid-iteration. Behavior is undefined if violated. No snapshot is taken.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide `getEntitiesByComponent(componentType)` method that returns all entities possessing the specified component type.
- **FR-002**: System MUST provide `getEntitiesByProperty('Component.field', value)` method that returns all entities where the named component field equals the given value. Property paths use dot notation: `'Citizen.jobType'` targets field `jobType` inside the `Citizen` component.
- **FR-003**: System MUST support property filtering with range operators (min/max for numeric properties, e.g., `{ min: 0, max: 100 }`).
- **FR-004**: System MUST provide `getEntitiesByProperties(filterObject)` method that returns entities matching ALL specified property filters (AND logic). Filters use the same component-scoped path syntax.
- **FR-005**: System MUST provide `getRelatedEntities(entity, relationshipName)` method that returns all entities related to a given entity by a defined relationship. If a relationship references a deleted entity, the method MUST throw an error (dangling relationship is a data integrity violation).
- **FR-006**: System MUST provide `getRelatedEntity(entity, relationshipName)` method that returns a single related entity (or null if no relationship exists). If the referenced entity has been deleted, the method MUST throw an error.
- **FR-007**: Query results MUST be deterministic: identical query on identical game state returns identical results in insertion order (the order entities were added to the game state). Insertion order is the canonical sort for all queries.
- **FR-008**: All query operations MUST be serialization-safe: queries work identically on live game state and on deserialized game state from JSON save files.
- **FR-009**: System MUST provide reusable helper classes (e.g., `CitizenQueries`, `FactionQueries`, `ResourceQueries`) that encapsulate common query patterns.
- **FR-010**: System MUST include comprehensive benchmark tests that measure query performance with varying entity counts (100–10000+).
- **FR-011**: Query operations MUST NOT depend on rendering layer or UI state; queries work identically in headless environments.
- **FR-012**: Query helper classes MUST be composable and chainable where applicable (e.g., `queries.getActiveCitizens().filter(...)`).
- **FR-013**: Query results are live views over the entity collection; callers MUST NOT add or remove entities while iterating a query result. Behavior is undefined if the collection is mutated mid-iteration. The system does NOT provide internal indexing or caches; callers may implement their own caching if needed.

### Key Entities

- **Entity**: An object with an ID, a collection of named components. Queryable by component type, component-field values (via dot-path), and relationships.
- **Component**: A typed container for entity data (e.g., `Citizen` component, `Position` component). Component fields are queryable using `'ComponentName.fieldName'` path syntax.
- **Relationship**: A named link between entities (e.g., "faction members", "assigned job"). Stored as a component field referencing one or more entity IDs. A dangling relationship (target entity deleted) is a data integrity error.
- **QueryHelper**: A reusable class providing encapsulated query methods for a specific domain (e.g., `CitizenQueries` for citizen-related queries).
- **BenchmarkResult**: Captures query performance metrics: entity count, query type, execution time (ms), memory usage (optional).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Query `getEntitiesByComponent()` on 10,000 entities completes in under 5ms (measured on reference hardware).
- **SC-002**: Query `getEntitiesByProperty()` with single property filter on 10,000 entities completes in under 10ms.
- **SC-003**: Query `getEntitiesByProperties()` with 3+ filters on 10,000 entities completes in under 15ms.
- **SC-004**: Relationship query `getRelatedEntities()` completes in under 5ms regardless of relationship depth (max depth: 5).
- **SC-005**: 100% of query operations return identical results when executed on identical game state (deterministic).
- **SC-006**: Benchmark tests run in all environments (headless, terminal, browser) with consistent timing results (±10% variance allowed).
- **SC-007**: Query results serialized to JSON and deserialized produce identical entity lists when queries re-execute.
- **SC-008**: All query helper classes are independently testable and usable without UI or rendering layer.
- **SC-009**: Query performance benchmarks detect >10% performance regressions in CI/CD pipeline.
- **SC-010**: No memory leaks during repeated query operations (memory stable over 100,000+ query iterations).

## Clarifications

### Session 2026-05-02

- Q: Are entity IDs unique globally (game-wide) or locally (per-map)? → A: Global game-wide IDs. Each entity has a unique ID across the entire loaded game world. Loading a new game fully unloads all current entities and IDs; the new game's entities have their own independent IDs.
- Q: What is the JSON serialization structure for entities with components? → A: Nested by component name — `{ "id": 42, "prototype": "Citizen", "components": { "Inventory": {...}, "Position": {...} } }`. Each component is a named key under `components`.
- Q: Where do queryable properties live — on the entity or inside a component? → A: Inside components. Property queries use dot-path syntax: `'Citizen.jobType'` targets `jobType` inside the `Citizen` component. Top-level entity fields (id, prototype) are not queryable via property queries.
- Q: What happens if entities are added/removed during query iteration? → A: Queries return a live view; caller must not mutate the collection mid-iteration. Behavior is undefined if violated. No snapshot semantics.
- Q: When a relationship points to a deleted entity, what should the query return? → A: Throw an error. Dangling relationships are a data integrity violation, not a graceful-skip case.
- Q: What ordering should query results use for determinism (FR-007)? → A: Insertion order — the order entities were added to the game state. Canonical for all queries.
- Q: Should the query system maintain internal indexes or caches? → A: No. Full scans only. Callers may implement their own caching if needed; it is not a framework concern.

### Session 2026-05-03 (Cross-cutting: Diplomacy & Factions)

- Q: What is a Faction and how does entity membership work? → A: A Faction is a first-class ECS entity (consistent with spec 003). Entities may belong to multiple factions simultaneously (political, occupational, religious, etc.). The player's government is itself a faction. Faction membership is stored as a component on the individual entity (list of faction entity IDs). Queries like `getEntitiesByProperty('Citizen.factions', ...)` must support multi-value membership (entity belongs to faction X AND/OR faction Y).

## Assumptions

- **ECS Architecture**: Game uses entity/component/system (ECS) paradigm; entities can be queried by component type and properties.
- **Relationship Semantics**: Relationships are either stored as properties on entities or can be inferred from component presence; complex relationship models are not required for v1.
- **Query Result Format**: Queries return arrays of entity objects (or ID lists); lazy evaluation not required (queries are eager).
- **Performance Baseline**: Reference hardware for benchmarks is modern consumer-grade CPU; specific hardware specified in benchmark documentation.
- **No Built-In Indexing**: The query framework performs full scans on every query call. No internal caches or indexes are maintained. Performance targets are designed to be met by raw scan speed at expected entity counts. Callers that require higher-frequency querying may implement their own caching layer on top.
- **Immutable Query Results Array**: The result array returned by queries is a new array (modifying it via push/pop/splice doesn't affect the game's entity collection). However, the entity objects within the array are live references — modifying entity properties directly affects game state. Callers MUST NOT add/remove entities to the game collection during iteration of the result array.
- **Single Authoritative Query API**: Game code uses these helper methods; alternative query mechanisms (raw loops, external libraries) are discouraged.
- **Headless Priority**: Query helpers prioritize headless performance; browser rendering consuming queries doesn't add performance burden.
- **Insertion-Order Determinism**: Query results are returned in entity insertion order (the order each entity was added to the game state). This is the canonical sort; callers needing a different order must sort results themselves.
- **Component-Scoped Property Paths**: All property queries use dot-notation paths (`'ComponentName.fieldName'`) to target fields inside components. Querying a top-level entity field (e.g., `id`, `prototype`) is not supported via property queries.
- **Serialization Coverage**: All query-relevant state (entity properties, relationships, component presence) is included in JSON serialization (no hidden state).
- **Entity ID Uniqueness**: Entities are uniquely identified by ID within a game state; ID collisions don't occur; IDs remain stable across serialization.
