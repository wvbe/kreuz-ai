# Feature Specification: ECS Architecture & Entity Interaction API

**Feature Branch**: `003-ecs-architecture`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Another framework-level feature/design is the entity-component-system architecture of the game world, and how to programmatically interact with it. There will be a large number of systems, with very many components, that can lead to a wide range of entity prototypes. The product of this feature is an API that is an ergonomic way to specify what those entities are, and to interact with the helper methods that are given to entities with a related component. Those helper methods must themselves also be an ergonomic API. There will be a few high-reuse systems/components, such as being able to perform a series of prioritized tasks, or being able interrupt a series of tasks that the entity is performing. All asynchronous events, including timeouts and async/await promises are ultimately governed by other game events and the game time helper."

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

### User Story 2 - Ergonomic Entity Querying through Component-Based Methods (Priority: P1)

Entities with specific components should automatically expose component-specific helper methods. Developers call methods directly on entities (e.g., `entity.haveOrGrabOwnedMoney()` on an entity with `Inventory` component) without manually checking component presence or casting. This creates an intuitive, self-documenting API.

**Why this priority**: Core to ergonomic API design. Developers interact with entities far more frequently than with query helpers; this must be frictionless.

**Independent Test**: Can be fully tested by defining entities with various components, accessing component-specific methods, and verifying: (a) methods are available only on entities with correct components, (b) methods execute correctly and modify entity state, (c) method calls feel natural and require no casting. Delivers method dispatch.

**Acceptance Scenarios**:

1. **Given** an entity with `Inventory` component, **When** developer calls `entity.moneyBalance()`, **Then** method returns current money balance (if method exists on Inventory).
2. **Given** an entity WITHOUT `Inventory` component, **When** developer attempts to call `entity.moneyBalance()`, **Then** method is not available (no confusion or runtime errors).
3. **Given** component-specific methods, **When** developer calls method (e.g., `entity.addToInventory(item)`), **Then** method modifies entity state and change is reflected in game state.
4. **Given** multiple entities with same components, **When** same method is called on each, **Then** methods execute independently and don't interfere with each other.

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

### User Story 4 - Async/Await Entity Interactions Governed by Game Time (Priority: P1)

Entity methods can be async and resolve based on game time progression, not real-world time. A developer can write `await entity.haveOrGrabOwnedMoney(amount)` which blocks until the entity has acquired the money (synchronously or after traveling home to fetch it), driven entirely by game ticks and game time. This creates ergonomic, readable sequences of entity interactions without explicit state machines or callbacks.

**Why this priority**: Core to game design expressiveness shown in examples (trading sequences, travel, resource gathering). Async/await syntax is familiar to developers; enabling it with game time is powerful.

**Independent Test**: Can be fully tested by writing async sequences: (a) entity acquiring money (resolve immediately if available, otherwise after travel), (b) entity traveling to another location, (c) entity exchanging inventory items. Verify: sequences are deterministic, game time advances correctly, promises resolve at correct game time. Delivers async coordination.

**Acceptance Scenarios**:

1. **Given** an entity with 50 money and goal to acquire 100 money, **When** `await entity.haveOrGrabOwnedMoney(100)` is called, **Then** promise resolves after entity travels home, retrieves additional money, and returns with total 100+ money.
2. **Given** an entity with 100 money already in inventory, **When** `await entity.haveOrGrabOwnedMoney(50)` is called, **Then** promise resolves immediately (no travel needed).
3. **Given** an entity calling `await entity.goPurchaseFromMerchant(sellerEntity, Food.cheese, 10, price)`, **When** buyer walks to seller, exchanges money and inventory, **Then** promise resolves after game time has advanced to reflect travel + exchange.
4. **Given** multiple entities executing async interactions concurrently (both trading), **When** game loop progresses, **Then** both entities' promises resolve at correct game times and state remains consistent.

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
- **FR-004**: System MUST expose component-specific methods directly on entities (e.g., `entity.moneyBalance()` if entity has `Inventory` component).
- **FR-005**: System MUST prevent calling component-specific methods on entities lacking that component (no crashes; methods must be unavailable or error clearly).
- **FR-006**: System MUST provide `TaskQueue` component for high-reuse priority-based task management with enqueue, dequeue, prioritize, and interrupt operations.
- **FR-007**: System MUST execute tasks in priority order (highest priority first) each game tick.
- **FR-008**: System MUST support task interruption that cancels remaining tasks and leaves entity in consistent state.
- **FR-009**: System MUST enable entity methods to be declared as async and return Promises that resolve based on game time, not real-world time.
- **FR-010**: System MUST coordinate async entity interactions: `await entity.haveOrGrabOwnedMoney(amount)` resolves when entity acquires money (immediately or after travel).
- **FR-011**: System MUST coordinate complex interactions: `await entity.goPurchaseFromMerchant(seller, item, count, price)` resolves after entity walks to seller and exchanges inventory/money.
- **FR-012**: System MUST support sequential async chains without explicit state machines or callbacks (e.g., `await a(); await b(); await c();`).
- **FR-013**: System MUST provide high-reuse component families (Merchant, Citizen, Faction) with ergonomic, chainable methods.
- **FR-014**: System MUST serialize all entity state (prototype, components, task queue, async operation state) to JSON without loss of information.
- **FR-015**: System MUST deserialize entity state from JSON and resume async operations at correct game time.
- **FR-016**: System MUST work identically in headless environments (no renderer) as in browser environments.

### Key Entities

- **Entity**: Instance of an entity prototype with instantiated components, task queue, and properties. Has entity ID, component instances, and state.
- **EntityPrototype**: Declarative definition of entity composition: ID, component list, default values. Reusable template for creating entities.
- **Component**: Typed container for entity behavior and data. Provides methods callable on entity. Examples: Inventory, Position, Job, TaskQueue.
- **TaskQueue**: Special component providing priority-based task management. Stores pending tasks, current task, and execution history.
- **Task**: Unit of work in entity's task queue. Has ID, priority, status (pending/executing/completed), and associated promise for async coordination.
- **AsyncOperation**: Pending promise awaiting game time progression. Resolves when game time condition is met (travel complete, item acquired, exchange finished).

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

## Clarifications

### Session 2026-05-02

- Q: How are component-specific methods accessed on entities? → A: Delegate pattern — component instances are direct properties on the entity (e.g., `entity.inventory`, `entity.job`). Methods are called on the component directly (`entity.inventory.balance()`), not proxied through the entity itself. No method forwarding or delegation via entity.
- Q: What happens when an async entity operation is provably unachievable? → A: Promise rejects immediately with a descriptive error (e.g., `InsufficientFundsError`). Fail-fast semantics; caller is responsible for catching and handling.
- Q: How do task queue tasks execute relative to game ticks? → A: Option C — tasks run to their first async boundary (await) within a tick. Tasks can resolve, reject, or be cancelled externally. External cancellation uses a CancellationToken that carries contextual information (e.g., reason = "entity_deleted" vs. "higher_priority_task") so the entity can decide whether to perform cleanup steps (e.g., drop carried items) or skip them. The cleanup itself may involve a small async timeout resolved by game time.
- Q: What is the JSON serialization structure for entities? → A: Nested by component name — `{ "id": 42, "prototype": "Citizen", "components": { "Inventory": {...}, "Position": {...}, "TaskQueue": {...} } }`. Each component is a named key under `components`.
- Q: What happens when an entity with pending async operations is deleted? → A: Deletion issues a CancellationToken with reason "entity_deleted". Entity's pending tasks are cancelled in dependency order; each task receives the token and may perform a brief async cleanup (game-time governed) before the task promise rejects. All external awaits on the entity's operations receive a rejection once cleanup completes.

## Assumptions

- **Component Initialization**: Components initialize with sensible defaults; no configuration required for basic functionality.
- **Single Entity Ownership**: Each entity instance belongs to one game state; no shared entity objects across multiple games. Loading a new game fully unloads all current entities.
- **Promise Resolution Driven by Game Ticks**: Async operations don't use system time; game loop ticks drive all time-based promise resolutions.
- **Component Method Access via Instance**: Component methods are accessed directly on component instances (e.g., `entity.inventory.balance()`), not forwarded via entity-level dispatch. No Proxy or reflection-based method routing.
- **Task Execution Model**: Task queue runs each task to its first async boundary per tick. Multiple tasks do not execute concurrently per entity; concurrency is across multiple entities.
- **Cancellation Token Contextual**: CancellationToken carries a reason describing the nature of cancellation (e.g., "entity_deleted", "interrupted_by_higher_priority", "goal_unreachable"). Task handlers may inspect the reason to decide which cleanup steps to perform or skip.
- **Component Composition Immutable**: Entity's component list doesn't change after instantiation. Adding/removing components would require entity recreation.
- **Async Sequences Deterministic**: Identical entity state + identical game tick sequence produces identical async operation resolutions.
- **Headless Parity**: Headless execution has full parity with browser execution; no features exclusive to one or the other.
- **Async Failure Semantics**: Async operation failures (goal provably unachievable, entity deleted, etc.) propagate as Promise rejections with descriptive typed errors, not silent failures.
- **Global Entity IDs**: Entity IDs are unique game-wide. IDs are stable across serialization. Loading a new game unloads all entities and their IDs.
- **Task Queue is Per-Entity**: Each entity has independent task queue; no global task scheduler.
- **Prototype Registry**: Entity prototypes are registered at game startup; not dynamically created during gameplay.
- **No Hot Reload**: Component definitions and prototype definitions are fixed after game initialization (reloading during gameplay is out of scope).
