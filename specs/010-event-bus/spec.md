# Feature Specification: Event Bus System

**Feature Branch**: `010-event-bus`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "I want to specify the event bus with which events can be broadcasted so that other entities or systems can respond to them."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Emit and Subscribe to Events (Priority: P1)

An event bus allows systems and entities to broadcast events (e.g., "inventory.item.stored", "entity.deleted") and other systems to subscribe and react to those events. The event bus provides `emit(eventName, payload)` and `subscribe(eventName, callback)` methods. When an event is emitted, all subscribers to that event are called with the payload. Event names are dot-separated hierarchical strings using lowercase kebab-case (e.g., "inventory.item.stored").

**Why this priority**: Core infrastructure. Without an event bus, systems must be tightly coupled (entity directly calls inventory handler). Event bus enables loose coupling and composition. Blocking for game extensibility.

**Independent Test**: Can be fully tested by: creating an event bus, emitting an event, verifying subscribers receive the payload, and verifying multiple subscribers all receive the same event.

**Acceptance Scenarios**:

1. **Given** an event bus, **When** `emit("inventory.item.stored", { entityId: 1, materialId: 5, quantity: 5 })` is called, **Then** all subscribers to "inventory.item.stored" are called with the payload.
2. **Given** two entities subscribed to the same event, **When** that event is emitted, **Then** both entities receive the payload and can react independently.
3. **Given** an event emitted during a tick, **When** the tick completes, **Then** all subscribers have been called and their reactions completed before the tick boundary.
4. **Given** multiple events emitted in sequence (e.g., "entity.spawned", "inventory.item.stored"), **When** the tick ends, **Then** events are processed in FIFO order (first emitted, first processed).
5. **Given** an event with a complex payload (entity ID, item data, quantities), **When** serialized and deserialized, **Then** the payload is identical and can be used by subscribers after load (feature 006).

---

### User Story 2 - Support Hierarchical Events and Wildcard Subscriptions (Priority: P1)

Event names follow a hierarchical pattern (e.g., "game.state.started", "inventory.item.stored", "entity.movement.completed"). Subscribers can listen to exact events or use wildcards to listen to categories (e.g., subscribe to "inventory.\*\*" to receive all inventory events). Hierarchical naming and wildcard subscriptions enable systems to aggregate related events.

**Why this priority**: Enables elegant event aggregation. A trade system can listen to all "inventory.\*" events rather than subscribing to ten specific events. Blocking for game architecture elegance.

**Independent Test**: Can be fully tested by: setting up events with hierarchical names, subscribing to wildcard patterns, emitting various events, and verifying that wildcard subscriptions receive all matching events.

**Acceptance Scenarios**:

1. **Given** events "inventory.item.stored", "inventory.item.retrieved", "inventory.item.expired", **When** a subscriber listens to "inventory.item.\*", **Then** all three events trigger that subscriber.
2. **Given** a wildcard subscriber listening to "game.\*", **When** events "game.started", "game.paused", "game.saved" are emitted, **Then** the subscriber receives all three.
3. **Given** an exact event subscription to "inventory.item.stored" and a wildcard subscription to "inventory.**", **When** "inventory.item.stored" is emitted, **Then\*\* both subscribers are called.
4. **Given** a wildcard pattern "entity._", **When** events like "entity.spawned", "entity.movement.started", "entity.health.changed" are emitted, **Then** only "entity.spawned" matches (single-level wildcard `_`does not match nested dots; use`entity.\*\*` for all entity events).
5. **Given** a subscriber to "game.\*", **When** the game is saved with pending events in the queue, **Then** the subscription persists (subscriber relationships are not serialized; they're re-established on game load by systems).

---

### User Story 3 - Manage Subscriber Lifecycle: Permanent and One-Time Subscriptions (Priority: P1)

Subscribers can be permanent (remain active until explicitly unsubscribed) or one-time (automatically unsubscribed after the event fires once). Permanent subscriptions are typical; one-time subscriptions are useful for "wait for event" patterns (e.g., "wait for inventory to change", then proceed).

**Why this priority**: Essential for managing subscriber lifetime. Without explicit unsubscribe or one-time patterns, subscribers leak and memory accumulates. Blocking for game cleanup.

**Independent Test**: Can be fully tested by: setting up permanent and one-time subscriptions, emitting events multiple times, verifying permanent subscribers are called each time and one-time subscribers called only once.

**Acceptance Scenarios**:

1. **Given** a permanent subscription to "inventory.item.stored", **When** the event is emitted three times, **Then** the subscriber is called three times.
2. **Given** a one-time subscription to "entity.spawned", **When** the event is emitted twice, **Then** the subscriber is called only on the first emit; the second emit does not trigger it (subscriber was auto-unsubscribed).
3. **Given** an entity with multiple permanent subscriptions, **When** the entity is deleted, **Then** the entity unsubscribes from all events (no leaked listeners).
4. **Given** a subscriber that is explicitly unsubscribed via `unsubscribe()`, **When** that event is emitted, **Then** the subscriber is not called.
5. **Given** one-time and permanent subscriptions to the same event, **When** the event is emitted, **Then** both are called; on the second emit, only the permanent subscriber is called.

---

### User Story 4 - Queue Events During Tick and Process at Tick Boundary (Priority: P1)

Events are asynchronous. When `emit()` is called during a tick, the event is queued but not processed immediately. All events emitted during a tick are processed at the tick boundary (end-of-tick), in FIFO order, before the next tick begins. This ensures deterministic event ordering and prevents subscriber reactions from creating infinite loops.

**Why this priority**: Critical for determinism and predictability. Synchronous events can create unpredictable call stacks. Async processing at tick boundary makes behavior deterministic. Blocking.

**Independent Test**: Can be fully tested by: emitting events during a tick, verifying they're queued (not processed immediately), advancing to tick boundary, and verifying all queued events are processed in order.

**Acceptance Scenarios**:

1. **Given** events "A", "B", "C" emitted in sequence during a tick, **When** the tick ends, **Then** subscribers are called in order: A, then B, then C.
2. **Given** an event emitted and a subscriber reaction that emits another event, **When** both are processed at tick boundary, **Then** the first event is fully processed (all subscribers called) before the second event is processed.
3. **Given** multiple events queued during a tick, **When** querying the event queue mid-tick, **Then** the queue contains all pending events (observable state).
4. **Given** events emitted during tick N, **When** tick N ends and tick N+1 begins, **Then** all queued events have been processed and the queue is empty.
5. **Given** an event emitted with a subscriber that throws an error, **When** the error is caught and logged, **Then** the event queue continues processing remaining subscribers (error isolation).

---

### User Story 5 - Serialize Event Queue to GameState for Save/Load (Priority: P1)

All events pending in the queue during a game save (feature 006) are serialized into the GameState JSON. When the game is loaded, the event queue is restored with the same pending events in the same order. This ensures that a save/load cycle preserves in-flight events and maintains determinism.

**Why this priority**: Critical for save/load correctness. If in-flight events are lost on save, a loaded game behaves differently than the original. Blocking for feature 006 integration.

**Independent Test**: Can be fully tested by: emitting events (not processing them yet), saving the game, loading the save, verifying the event queue is identical, processing tick boundary, and verifying events execute identically to the original game.

**Acceptance Scenarios**:

1. **Given** three events in the queue (not yet processed), **When** the game is saved, **Then** the GameState JSON includes all three events with their payloads.
2. **Given** a saved game with events in the queue, **When** the game is loaded and the tick boundary is reached, **Then** the events are processed in the same order and with the same payloads.
3. **Given** an event "inventory.item.stored" with payload `{ entityId: 5, materialId: 3, quantity: 100 }` in the queue, **When** serialized to JSON, **Then** the payload is JSON-serializable (no function references, no circular structures).
4. **Given** a game saved with events in the queue, **When** loaded and a new event is emitted, **Then** the new event is added to the queue and processed after the loaded events (queue ordering is preserved).
5. **Given** a loaded game with restored events, **When** a subscriber is registered for one of those events, **Then** the subscriber is called when the event is processed (no events are "missed" due to load).

---

### User Story 6 - Define and Use Standard Event Types (Priority: P2)

The system defines standard event types organized into categories (e.g., "game._", "entity._", "inventory._", "tick._", "error.\*"). Documentation lists all standard events and their payload schemas. Systems can emit standard events or define custom events, and subscribers can listen to either. Standard events enable consistent communication across systems.

**Why this priority**: Improves code organization and discoverability. Standard events make code self-documenting. P2 because custom events can work without standards, but standards accelerate development.

**Independent Test**: Can be fully tested by: documenting standard events, implementing multiple systems using those events, verifying systems communicate correctly, and verifying new systems can integrate by listening to standard events.

**Acceptance Scenarios**:

1. **Given** standard events documented (e.g., "entity.spawned", "entity.deleted", "inventory.item.stored"), **When** systems emit those events, **Then** documentation describes the payload schema and all possible fields.
2. **Given** a system that listens to "entity.\*", **When** an entity spawns, moves, and dies, **Then** the system receives all three standard events.
3. **Given** custom events defined by a specific system (e.g., \"trade.offer.made\"), **When** that event is emitted, **Then** subscribers can listen to it like any other event.
4. **Given** standard event "tick.begin" emitted at tick start, **When** a system subscribes to it, **Then** the system can perform setup work before other events are processed.
5. **Given** standard event "error.system-failed" emitted when a system throws, **When** an error handler subscribes to it, **Then** the handler can log/monitor system failures.

---

### Edge Cases

- What happens if a subscriber is unsubscribed while events are being processed (during tick boundary)? → The unsubscribe is recorded; the subscriber is not called for any pending events. (Queue is immutable during processing; unsubscribe applies to future events.)
- What happens if a subscriber emits an event while processing another event (nested emissions)? → The new event is added to the queue and processed after the current event (FIFO maintained).
- What happens if an event name is invalid (e.g., empty string, contains invalid characters)? → Validation rejects with a clear error at emit time or subscription time.
- What happens if a subscriber throws an error multiple times? → Each error is caught and logged independently; remaining subscribers still run. Error events can be emitted for monitoring.
- What happens if the event queue grows very large (1000+ events queued)? → Queue is processed in full; no truncation. Memory usage is proportional to queue size; for large simulations, this is expected.
- What happens if two events have circular dependencies (A triggers B, B triggers A, creating infinite loop)? → Each tick's event processing runs to completion; new events emitted during processing are queued for the next tick. Infinite loops are prevented by tick boundaries.
- What happens if an event is emitted outside of a game tick (e.g., during bootstrap)? → Event is queued and processed at the next tick boundary (or by explicit flush).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: EventBus MUST expose `emit(eventName, payload)` to broadcast events and `subscribe(eventName, callback)` to register subscribers.
- **FR-002**: Event names MUST be dot-separated hierarchical strings using lowercase kebab-case segments (e.g., `inventory.item.stored`, `entity.spawned`, `game.state.started`). Each dot separates one hierarchy level.
- **FR-003**: Subscribers MUST be called with the event payload (data object containing relevant fields for that event type).
- **FR-004**: Subscribers MUST be able to subscribe to exact events (e.g., `inventory.item.stored`) or wildcard patterns: `*` matches exactly one segment (e.g., `inventory.item.*` matches `inventory.item.stored` but NOT `inventory.item.stack.merged`); `**` matches any depth (e.g., `inventory.**` matches all events starting with `inventory.`).
- **FR-005**: Single-level wildcard `*` MUST match exactly one segment. Multi-level wildcard `**` MUST match one or more segments at any depth. Both wildcards can only appear as the last segment of a pattern.
- **FR-006**: EventBus MUST support both permanent subscriptions (active until unsubscribed) and one-time subscriptions (auto-unsubscribed after first emit).
- **FR-007**: When `subscribe(eventName, callback, { once: true })` is used, the subscriber is called once, then automatically unsubscribed.
- **FR-008**: EventBus MUST provide an `unsubscribe(eventName, callback)` method to remove a specific subscriber. Subscription cleanup is the caller's responsibility; entities track their own handles and call `unsubscribe` during deletion.
- **FR-009**: Events emitted during a tick MUST be queued, not processed immediately. All queued events MUST be processed at the tick boundary in FIFO order.
- **FR-010**: Multiple subscribers to the same event MUST be called in registration order (FIFO): first subscriber registered = first called. This ordering is deterministic and stable across ticks and save/load cycles.
- **FR-011**: A subscriber registered after an event has already been queued (same tick, before boundary) MUST NOT receive that queued event. Late subscribers receive only events emitted after their registration.
- **FR-012**: EventBus MUST expose a `waitFor<T>(eventName, predicate?)` method returning a Promise that resolves at tick boundary when the next matching event fires. Optional predicate allows filtering (e.g., `e => e.entityId === 5`). Pending `waitFor` Promises are NOT serialized to GameState.
- **FR-013**: EventBus MUST be a global singleton per game instance. All events from all maps flow through the single bus; subscribers receive events regardless of which map the emitter is on.
- **FR-014**: EventBus MUST expose a `getQueue()` method to inspect pending events (for debugging and serialization).
- **FR-015**: All events in the queue at save time (feature 006) MUST serialize to JSON in the GameState, including event name and payload.
- **FR-016**: When a game is loaded from a save file, the event queue MUST be restored with the same events in the same order.
- **FR-017**: If a subscriber throws an error, the error MUST be caught and logged; processing of remaining subscribers for that event MUST continue (isolation).
- **FR-018**: EventBus MUST define standard event types with consistent naming (dot-separated, lowercase kebab-case) and document their payload schemas. Examples: `entity.spawned: { entityId, prototype }`, `inventory.item.stored: { entityId, materialId, quantity }`, `inventory.item.expired: { entityId, materialId, quantity }`.
- **FR-019**: Custom events (not standard) MUST be supported; systems can emit any valid event name and subscribers can listen to it.

### Key Entities

- **EventBus**: Central hub for event dispatch. **Global singleton per game instance** — all maps share one bus. Maintains subscriber list, event queue, and pending `waitFor` promises. Exposes `emit`, `subscribe`, `unsubscribe`, `waitFor`, `getQueue` methods.
- **Event**: A queued event with name and payload. Contains all information needed to call subscribers and resolve `waitFor` promises.
- **Subscriber**: A callback function registered to listen to one or more event names. Can be permanent or one-time. Called in registration order (FIFO) relative to other subscribers for the same event. Subscription cleanup is caller's responsibility.
- **WaitForPromise**: A Promise returned by `waitFor(eventName, predicate?)` that resolves when the next matching event is processed at tick boundary. Enables `await eventBus.waitFor(...)` patterns in entity async tasks.
- **StandardEvents**: Documented catalog of built-in event types using dot-separated, lowercase kebab-case naming (e.g., `game.started`, `entity.spawned`, `entity.deleted`, `inventory.item.stored`, `inventory.item.retrieved`, `inventory.item.expired`, `inventory.item.transferred`).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Events emitted during a tick are processed at tick boundary: event queue is empty at tick N start, populated during tick N, and empty again at tick N end (observable state).
- **SC-002**: The same sequence of events emitted and processed deterministically produces identical subscriber reactions and state changes (determinism verification via replay).
- **SC-003**: Event queue serialization adds <10% overhead to save file size (per-event metadata is minimal).
- **SC-004**: A game with 100+ pending events can be saved and loaded in under 100ms (round-trip time).
- **SC-005**: A system can subscribe to a wildcard pattern (e.g., "inventory.\*") and receive all matching events without missing any (100% delivery for matching subscriptions).
- **SC-006**: When a subscriber throws an error, remaining subscribers are still called (error isolation verified by callback count).
- **SC-007**: Multiple subscribers to the same event are called in registration order; order is stable across ticks and save/load cycles.
- **SC-008**: `waitFor(eventName, predicate?)` returns a Promise resolving at tick boundary when the next matching event fires; usable with `await` inside entity async tasks (feature 003).

## Assumptions

- **Game loop integration**: EventBus is assumed to be called by the game loop (feature 001) at tick boundaries. The game loop calls `eventBus.processQueue()` at each tick end to drain the queue and resolve pending `waitFor` promises.
- **Global singleton per game instance**: There is exactly one EventBus per running game. All maps, entities, and systems share this bus. Events carry entity IDs and map IDs in their payloads; routing by map is not built into the bus — subscribers filter by payload if needed.
- **Subscriber FIFO ordering**: Subscribers to the same event are called in registration order. First subscribed = first called. This ordering is deterministic and does not change across ticks or save/load cycles.
- **Late subscriber delivery is future-only**: A subscriber registered during tick N does not receive events already queued in tick N before registration. It only receives events emitted after the subscription was registered.
- **Self-managed subscription cleanup**: Subscription cleanup is the caller's (entity's) responsibility. Each entity tracks its own subscription handles (return values of `subscribe()`). On deletion, the entity calls `unsubscribe()` for each handle. No ownership tagging built into EventBus.
- **Subscribers are functions or methods**: Event callbacks are assumed to be functions/methods in JavaScript or equivalent in the target language. Complex subscriber objects (e.g., with state) are not built-in; subscribers manage their own state.
- **Events are immutable during processing**: While the tick boundary processes events, the queue is treated as immutable. Events emitted during processing are queued for the next tick.
- **Standard events are documented**: Standard event types (game._, entity._, inventory.\*, etc.) are assumed to be documented (as part of specification or implementation). New systems discover standard events by reading documentation.
- **Memory is available for queue**: The event queue is assumed to fit in memory; very large simulations with thousands of events may require optimization (out of scope for POC).
- **Subscriber registration is not thread-safe**: For POC, thread safety is not required. Single-threaded game loop assumed; concurrent subscriber registration is not handled.
- **Event names follow conventions**: Event names MUST follow dot-separated, lowercase kebab-case pattern. `*` wildcard matches exactly one segment; `**` matches any depth. Examples: `inventory.item.stored` (not `inventory.item-stored`), `entity.spawned` (not `entity_spawned`). No enforcement mechanism beyond documentation and code review.
- **Errors in subscribers are not fatal**: When a subscriber throws an error, the game continues; errors are logged but do not stop the game or event processing.
- **waitFor Promises and save/load**: Pending `waitFor` Promises are not serialized to GameState. On load, callers must re-register their `waitFor` calls. This mirrors how subscriptions are re-established post-load.

## Clarifications

### Session 2026-05-02 (Original Scope)

- Q: Does "game._" match "game.state.started" or only "game.started"? → A: Only "game.started". Single-level wildcard `_`matches exactly one segment. To match all game events at any depth, use`game.**`. Hierarchies can be nested; `\*`= one level,`**` = any depth.
- Q: If event A's subscribers are processing and one throws, does event B wait? → A: Event A processing completes (all subscribers called, errors caught and logged), then event B starts. Errors do not affect ordering.
- Q: If a subscriber is one-time and subscribed to "inventory.\*", is it unsubscribed after any matching event or a specific one? → A: After any matching event. One-time + wildcard means "call me once when any event matching this pattern is emitted, then unsubscribe."
- Q: Should `getQueue()` return a copy or a live reference? → A: A copy (immutable snapshot). Returning a live reference allows callers to modify the queue, which breaks assumptions.
- Q: Where are standard event schemas defined? → A: In documentation (spec or README). No built-in schema validation; reliance on code conventions and documentation.

### Session 2026-05-02 (Architecture Deep-Dive)

- Q: Is the EventBus global (game-wide) or scoped per map? → A: Global singleton. One EventBus per game instance; all maps share it. Events carry entity IDs and map IDs in payloads. Subscribers filter by payload if they care about map context. No routing by map built into the bus.
- Q: In what order are multiple subscribers to the same event called? → A: Registration order (FIFO). First subscribed = first called. Ordering is deterministic and stable across ticks and save/load cycles.
- Q: Does a subscriber registered mid-tick receive events already queued that tick? → A: No. Future-only delivery. A subscriber registered during tick N does not receive events queued before its registration in that tick. It receives only events emitted after subscription.
- Q: How does entity deletion clean up its event subscriptions? → A: Self-managed. Each entity tracks its own subscription handles. On deletion, the entity calls `unsubscribe()` for each handle it holds. No owner-tagging or bulk-unsubscribe built into EventBus.
- Q: Should EventBus expose a Promise-based API for async/await integration? → A: Yes, typed async queries. EventBus exposes `waitFor<T>(eventName, predicate?)` returning a Promise that resolves at tick boundary when the next matching event fires. Optional predicate allows filtering (e.g., `e => e.entityId === 5`). Integrates naturally with entity async tasks (feature 003). Pending `waitFor` Promises are NOT serialized; callers re-register on load.

### Cross-Cutting Session 2026-05-02

- Q: What event naming convention should be used across all specs? → A: Dot-separated hierarchical, lowercase kebab-case segments. `*` matches exactly one segment; `**` matches any depth. Examples: `inventory.item.stored`, `entity.spawned`, `game.state.started`. This replaces inconsistent naming (`inventory.item-added`, `materialExpired`, `inventory.changed`) with a single canonical pattern. All specs (005, 010, 013) use this convention.
