# Feature Specification: ECS Architecture & Entity Interaction API

**Feature Branch**: `003-ecs-architecture`
**Created**: 2026-05-02
**Status**: Unimplemented (fresh start)
**Input**: User description: "Another framework-level feature/design is the entity-component-system architecture of the game world, and how to programmatically interact with it. There will be a large number of systems, with very many components, that can lead to a wide range of entity prototypes. The product of this feature is an API that is an ergonomic way to specify what those entities are, and to interact with the helper methods that are given to entities with a related component. Those helper methods must themselves also be an ergonomic API. There will be a few high-reuse systems/components, such as being able to perform a series of prioritized tasks, or being able interrupt a series of tasks that the entity is performing. All asynchronous events, including timeouts and async/await promises are ultimately governed by other game events and the game time helper."

> **Note (2026-05-04)**: A previous implementation of this feature was discarded. This spec is being reimplemented from scratch following the conventions in spec 023 (TypeScript code style). All code lives under `src/game/`, tests are co-located, no barrel files, no default exports. Entities are pure data objects; systems provide behavior. See spec 023 for the full code style reference.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Define Entity Prototypes with Component Composition (Priority: P1)

Game developers need an ergonomic, declarative way to define what entities are by specifying their component composition. An entity prototype defines which components an entity has, enabling clear intent and reusability across many entity types. Once defined, prototypes can be instantiated into concrete entities with minimal boilerplate.

**Why this priority**: Foundational architecture enabling the entire ECS paradigm. All entities must be creatable; ergonomic definition reduces errors and improves maintainability.

**Independent Test**: Can be fully tested by defining 5+ entity prototypes (Citizen, Merchant, Resource, Faction, etc.), instantiating entities from prototypes, verifying: (a) entities have correct components, (b) prototypes are reusable across multiple entity instances, (c) prototype definitions are human-readable. Delivers prototype API.

**Acceptance Scenarios**:

1. **Given** a declarative entity prototype defining components (e.g., `{ components: ["Position", "Inventory", "Job"] }`), **When** entity is instantiated from prototype, **Then** entity has all specified components initialized with default values.
2. **Given** a prototype with default component values, **When** entity is created, **Then** component values match prototype defaults (no missing or random state).
3. **Given** multiple entities instantiated from the same prototype, **When** each entity is modified independently, **Then** changes to one entity don't affect others (instances are independent).
4. **Given** an entity prototype, **When** serialized to JSON and deserialized, **Then** prototype retains all component information and can recreate identical entities.

---

### User Story 2 - Ergonomic System Functions Operating on Entity Data (Priority: P1)

Entities are **pure data objects** (component maps). Game systems provide typed helper functions that operate on entity data. Developers call system functions with the entity as a parameter (e.g., `getMoneyBalance(entity)`, `addToInventory(entity, item)`). TypeScript's type system ensures only entities with the required components can be passed to functions that need them (via type predicates or branded types).

**Why this priority**: Core to ergonomic API design. Developers interact with entities frequently; typed system functions must be frictionless and type-safe.

**Independent Test**: Can be fully tested by defining entities with various components, calling system functions, and verifying: (a) functions only accept entities with correct components (compile-time enforcement), (b) functions correctly read/modify entity state, (c) function calls are self-documenting. Delivers type-safe system API.

**Acceptance Scenarios**:

1. **Given** an entity with `Inventory` component data, **When** developer calls `getMoneyBalance(entity)`, **Then** function returns current money balance from the entity's inventory data.
2. **Given** an entity WITHOUT `Inventory` component, **When** developer attempts to call `getMoneyBalance(entity)`, **Then** TypeScript reports a compile-time error (type mismatch).
3. **Given** system functions, **When** developer calls `addToInventory(entity, item)`, **Then** function returns a new entity state with the item added (pure transformation).
4. **Given** multiple entities with same components, **When** same function is called on each, **Then** functions operate independently with no shared mutable state.

---

### User Story 3 - Task Queue with Prioritization and Interruption (Priority: P1)

Many entities manage sequential tasks (Citizens perform jobs, Merchants execute trades, factions pursue goals). A high-reuse component provides a task queue where tasks are prioritized, can be enqueued/dequeued, and can be interrupted. Developer specifies task priority; game loop executes highest-priority tasks first. Interrupts allow cancellation without leaving entity in inconsistent state.

**Why this priority**: High-reuse component essential to game design (citizen job transitions, merchant negotiations, faction politics). Must be rock-solid.

**Independent Test**: Can be fully tested by enqueuing 10+ mixed-priority tasks, executing queue, interrupting mid-task, verifying: (a) tasks execute in priority order, (b) interrupts complete cleanly, (c) entity state remains consistent. Delivers task queue semantics.

**Acceptance Scenarios**:

1. **Given** an entity with `TaskQueue` component and tasks enqueued with priorities [1, 10, 5], **When** game loop processes tasks, **Then** tasks execute in order [10, 5, 1] (highest first).
2. **Given** an entity executing a task, **When** interrupt command is received, **Then** current task completes its current step, queued tasks are cleared, and entity is in known clean state.
3. **Given** a task in queue, **When** task priority is updated, **Then** task moves to correct position in queue without losing state.
4. **Given** completed tasks and executed tasks, **When** entity is queried for task history, **Then** completed tasks are available for inspection (useful for debugging and event logging).

---

### User Story 4 - Two-Layer Async/Await Governed by Game Ticks (Priority: P1)

High-level entity behavior is written using `async/await` for readability (e.g., `await walkTo(entity, target); await craft(entity, recipe)`). Under the hood, a **tick-driven state machine** advances each operation one step per tick and resolves the promise when the operation completes. This creates ergonomic, readable sequences without sacrificing determinism — async resolution is driven entirely by tick progression, not real-world time.

**Why this priority**: Core to game design expressiveness. Async/await syntax is familiar to developers; enabling it with tick-driven resolution creates powerful sequential behavior code while remaining fully deterministic and serializable.

**Independent Test**: Can be fully tested by writing async sequences: (a) entity walking to a location (resolves after N ticks), (b) entity crafting (resolves after duration ticks), (c) composed sequence. Verify: sequences are deterministic, tick count advances correctly, promises resolve at correct tick. Delivers async coordination.

**Acceptance Scenarios**:

1. **Given** an entity 5 cells away from a target, **When** `await walkTo(entity, targetCell)` is called, **Then** promise resolves after the pathfinding system has moved the entity cell-by-cell over ~5 ticks.
2. **Given** an entity already at a workstation, **When** `await craft(entity, recipe)` is called, **Then** promise resolves after the recipe's duration in ticks has elapsed and outputs are produced.
3. **Given** a composed behavior `await walkTo(entity, shop); await purchase(entity, item); await walkTo(entity, home)`, **When** game loop progresses, **Then** each step executes sequentially, resolving at the correct tick.
4. **Given** multiple entities executing async behaviors concurrently, **When** game loop progresses, **Then** all entities' state machines advance independently and deterministically each tick.
5. **Given** an in-progress async operation, **When** the game is saved and reloaded, **Then** the operation's state machine resumes from its current phase (async promises are re-created from serialized task state).

---

### User Story 5 - Component-Provided Helper Methods as Reusable High-Level Abstractions (Priority: P2)

Common entity behaviors (moving, trading, working, resting) are encapsulated as helper methods provided by components. These methods abstract away low-level state management and game time coordination. For example, `Merchant` component provides `getAdvertisedPriceFor(item)`, `acceptTrade(buyer, item, amount)`. `Citizen` component provides `performJob(job)`, `travelTo(location)`. Methods are discoverable and self-documenting.

**Why this priority**: Improves developer experience and maintainability. High-reuse components (Merchant, Citizen, Faction) drive significant gameplay; ergonomic abstractions pay dividends. P2 because task queue (User Story 3) is prerequisite.

**Independent Test**: Can be fully tested by implementing 3+ high-reuse component families (Merchant, Citizen, Faction), writing gameplay scenarios using component methods, verifying: (a) methods are intuitive and chainable, (b) methods coordinate with task queue and async patterns, (c) developers can express complex interactions with minimal boilerplate. Delivers abstraction layer.

**Acceptance Scenarios**:

1. **Given** a `Merchant` component with `getAdvertisedPriceFor(item)` and `acceptTrade(buyer, item, count, payment)` methods, **When** developer code calls these methods, **Then** prices are returned, trades execute, and inventory updates correctly.
2. **Given** a `Citizen` component with `performJob(jobType)` and `travelTo(location)` methods, **When** citizen's task queue prioritizes job over travel, **Then** job executes first, travel is queued, and citizen lifecycle is maintained.
3. **Given** component methods provided by multiple components on same entity, **When** developer calls methods in sequence, **Then** methods coordinate correctly (e.g., travel then work then rest) without state conflicts.
4. **Given** gameplay scenario with 10+ concurrent entities using component methods, **When** game loop progresses, **Then** all entities execute correctly, promises resolve at appropriate times, and game state remains consistent.

---

### User Story 6 - Entity State Serialization and Deserialization (Priority: P1)

All entity state, including active tasks, component state, and async operation state, must serialize to JSON and deserialize identically. When a game is saved mid-interaction (e.g., during an async trade sequence), the entity can be deserialized and the sequence resumes correctly from the saved game time. This is critical for save/load functionality and scenario testing.

**Why this priority**: Required by Constitution Principle II (Deterministic State & JSON Serialization). Without serialization, save/load breaks ECS model.

**Independent Test**: Can be fully tested by: (a) starting entity interaction, (b) saving at arbitrary point, (c) deserializing, (d) verifying entity state matches pre-save and interaction resumes correctly. Delivers serialization contract.

**Acceptance Scenarios**:

1. **Given** an entity mid-trade (async interaction pending), **When** game state is saved to JSON, **Then** JSON includes entity components, task queue state, async operation state, and game time reference.
2. **Given** a JSON save file with entity in mid-interaction, **When** save is loaded and game resumes, **Then** entity resumes interaction from saved point and resolves at correct game time.
3. **Given** identical saves and identical sequence of game ticks, **When** two instances load saves and execute ticks, **Then** entity states remain synchronized.
4. **Given** a saved entity with complex async interactions, **When** serialized to JSON and inspected, **Then** all entity state is present with no opaque fields.

---

### Edge Cases

- What happens if an entity's required component is removed mid-interaction? → Error or graceful degradation must be defined; async operations shouldn't crash.
- What happens if task priority is changed while task is executing? → Decision: execute to completion or interrupt immediately? Define clearly.
- What happens if async operation involves two entities that diverge in game state? → Synchronization via entity IDs and game time guarantees consistency.
- What happens if entity is deleted while async operation is pending? → Promise should reject with clear error message.
- What happens if multiple async operations are stacked (nested awaits)? → Should compose cleanly without deadlocking or state conflicts.
- What happens if a component method throws an error? → Error handling should propagate correctly and leave entity in consistent state.
- What happens during headless execution where no rendering occurs? → All operations should work identically (entity interactions don't depend on renderer).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide declarative syntax for defining entity prototypes by specifying component lists (e.g., `{ id: "Citizen", components: ["Position", "Inventory", "Job"] }`).
- **FR-002**: System MUST instantiate entities from prototypes, initializing all specified components with default values.
- **FR-003**: System MUST allow each entity instance to exist independently with separate state (modifications to one entity don't affect instances of same prototype).
- **FR-004**: System MUST expose typed system functions that operate on entity data (e.g., `getMoneyBalance(entity)` for entities with `Inventory` component). Entities are pure data; behavior lives in system functions.
- **FR-005**: System MUST use TypeScript's type system to prevent passing entities without required components to system functions (compile-time enforcement via type predicates or branded types).
- **FR-006**: System MUST provide `TaskQueue` component for high-reuse priority-based task management with enqueue, dequeue, prioritize, and interrupt operations.
- **FR-007**: System MUST execute tasks in priority order (highest priority first) each game tick.
- **FR-008**: System MUST support task interruption that cancels remaining tasks and leaves entity in consistent state.
- **FR-009**: System MUST enable high-level behavior code to use `async/await` syntax with promises that resolve based on tick progression, not real-world time. A tick-driven state machine advances operations and resolves promises when complete.
- **FR-010**: System MUST coordinate async behaviors: `await walkTo(entity, targetCell)` resolves when the entity's pathfinding state machine reaches the target cell.
- **FR-011**: System MUST coordinate complex interactions: `await purchase(entity, seller, item, count, price)` resolves after entity walks to seller and exchanges inventory/money over multiple ticks.
- **FR-012**: System MUST support sequential async chains without explicit state machines in behavior code (e.g., `await a(); await b(); await c();`). Multiple awaits execute sequentially; the task queue enforces ordering.
- **FR-013**: System MUST provide high-reuse system function families (inventory helpers, movement helpers, trade helpers) with ergonomic, composable APIs.
- **FR-014**: System MUST serialize all entity state (prototype, components, task queue, in-progress async operation phase) to JSON without loss of information.
- **FR-015**: System MUST deserialize entity state from JSON and resume async operations from their saved phase at the correct tick.
- **FR-016**: System MUST work identically in headless environments (no renderer) as in browser environments.
- **FR-017**: System MUST support dynamic entity component composition: components can be added to or removed from entities after instantiation. Entity version increments with each composition change to track evolution. Version is runtime-only (not serialized); reset to 0 on load.

### Key Entities

- **Entity**: Instance of an entity prototype with instantiated components, task queue, and properties. Has entity ID, component instances, version (runtime-only; incremented when composition changes; reset to 0 on load), and state.
- **EntityPrototype**: Declarative definition of entity composition: ID, component list, default values. Reusable template for creating entities. Prototypes define initial composition; actual entities may evolve composition at runtime.
- **Component**: Typed container for entity behavior and data. Provides methods callable on entity. Examples: Inventory, Position, Job, TaskQueue.
- **TaskQueue**: Special component providing priority-based task management. Stores pending tasks, current task, and execution history.
- **Task**: Unit of work in entity's task queue. Has ID, priority, status (pending/executing/completed), and associated promise for async coordination.
- **AsyncOperation**: Pending promise awaiting game time progression. Resolves when game time condition is met (travel complete, item acquired, exchange finished). Promise registers once; game loop invokes evaluation only when relevant game events occur (entity moved, inventory changed, etc.).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Entity prototype definitions are human-readable; developers can understand entity composition at a glance without documentation.
- **SC-002**: Entity instantiation from prototype is deterministic; identical prototypes create identical entities every time.
- **SC-003**: Component-specific method dispatch is zero-overhead; method availability checked in O(1) time (no iteration or expensive lookups).
- **SC-004**: Task queue executes highest-priority task each tick and maintains consistent ordering.
- **SC-005**: Task interruption completes within one game tick; entity is in known clean state after interruption.
- **SC-006**: Async entity methods resolve at correct game time; time is never advanced too early or too late.
- **SC-007**: Sequential async chains (nested awaits) complete without deadlocks or state inconsistencies.
- **SC-008**: Entity state serialization to JSON and deserialization produces bit-for-bit identical entity state.
- **SC-009**: Deserialized entities resume async operations correctly and complete at same game time as un-interrupted version.
- **SC-010**: 100% of entity behavior works identically in headless environments as in browser with renderer.
- **SC-011**: High-reuse component methods are discoverable (IDEs can provide autocomplete; methods are documented).
- **SC-012**: Complex entity interactions (trade sequences, multi-step travel + work) can be expressed in <50 lines of clear, async/await code.
- **SC-013**: Multiple nested awaits on an entity execute sequentially via task queue; each await completes before next begins. Sequential ordering is deterministic.

## Clarifications

### Session 2026-05-02

- Q: What exactly is an 'async boundary'? → A: First await. Task executes until it hits an `await` statement, then yields control. Execution resumes after await resolves on subsequent game tick(s).
- Q: How are component-specific operations accessed? → A: (Updated 2026-05-04) Entities are pure data objects. System functions accept entities with the required component data as typed parameters (e.g., `getBalance(entity)` where entity must have Inventory component). TypeScript type predicates or branded types enforce component requirements at compile time. No methods on entity objects.
- Q: What happens when an async entity operation is provably unachievable? → A: Promise rejects immediately with a descriptive error (e.g., `InsufficientFundsError`). Fail-fast semantics; caller is responsible for catching and handling.
- Q: How do task queue tasks execute relative to game ticks? → A: Tasks run to their first await within a tick. Tasks can resolve, reject, or be cancelled externally via CancellationToken. Cancellation has two categories: graceful (entity performs quit-animations or cleanup before stopping) and ungraceful (entity stops immediately). Entity code inspects the cancellation type to decide cleanup behavior.
- Q: What is the JSON serialization structure for entities? → A: Nested by component name — `{ "id": 42, "prototype": "Citizen", "components": { "Inventory": {...}, "Position": {...}, "TaskQueue": {...} } }`. Each component is a named key under `components`. Version is NOT serialized (runtime-only, reset to 0 on load; used for cache invalidation and reactive queries).
- Q: What happens when an entity with pending async operations is deleted? → A: Deletion issues a CancellationToken with category "ungraceful". Entity's pending tasks are cancelled immediately; each task receives the token and skips cleanup (since entity is being destroyed anyway). All external awaits on the entity's operations receive a rejection once cancellation completes.
- Q: Can entity component composition change after instantiation? → A: Yes. Components can be added to or removed from entities at runtime (e.g., Citizen gains SkillComponent, Faction loses LeadershipComponent). Entity version increments each time composition changes. Version is runtime-only (NOT serialized); reset to 0 on load. Used for cache invalidation and stale-query detection at runtime.
- Q: How do pending async operations get notified when their conditions are met? → A: Reactive — Promise registers once with the game loop (or relevant subsystem); game loop only evaluates the promise when relevant game events occur (entity moved, item acquired, time milestone reached). No polling all promises every tick; only active checks on relevant events.
- Q: How do multiple nested awaits compose? → A: Sequential via task queue. Each `await` in sequence is queued as a separate task. Task queue enforces strict ordering: first await completes before second begins. Multiple awaits on same entity never execute concurrently.

### Cross-Cutting Session 2026-05-02

- Q: Should entity version field be serialized or runtime-only? → A: Runtime-only. Version is NOT serialized; reset to 0 on load. Entity JSON is `{ id, prototype, components }` (no version field). Version is used for cache invalidation and stale-query detection during gameplay. All caches are invalidated on load anyway, so persisting version adds no value. This aligns with save format spec (006) which mandates `{ id, prototype, components }`.

## Assumptions

- **Component Initialization**: Components initialize with sensible defaults; no configuration required for basic functionality.
- **Single Entity Ownership**: Each entity instance belongs to one game state; no shared entity objects across multiple games. Loading a new game fully unloads all current entities.
- **Promise Resolution Driven by Game Ticks**: Async operations don't use system time; game loop ticks drive all time-based promise resolutions.
- **Pure Data Entities**: Entities are plain serializable data objects (component maps). Behavior is provided by system functions that accept entity data as parameters. No methods on entity objects. TypeScript type predicates or branded types enforce component requirements at compile time.
- **Task Execution Model**: Task queue runs each task to its first `await` per game tick. Multiple tasks do not execute concurrently per entity; concurrency is across multiple entities. Multiple awaits on same entity execute sequentially via task queue.
- **Cancellation Categories**: CancellationToken has two categories: graceful (entity may perform cleanup/animations) and ungraceful (entity stops immediately). Task handlers inspect the category to decide cleanup behavior.
- **Component Composition Mutable**: Entity's component list can change after instantiation (add/remove components at runtime). Entity version increments with each composition change. Version is runtime-only (NOT serialized); reset to 0 on load.
- **Async Promise Resolution Reactive**: Promises register once; game loop evaluates only when relevant events occur (not polled every tick). No overhead for promises awaiting distant conditions.
- **Entity Versioning**: Each time an entity's component composition changes (add/remove component), entity version increments. Version is runtime-only: used for cache invalidation and stale-query detection. NOT persisted in saves (all caches are invalidated on load anyway). No rollback.
