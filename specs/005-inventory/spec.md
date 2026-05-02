# Feature Specification: Inventory System

**Feature Branch**: `005-inventory`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "A huge part of the game will be about goods, materials, money and ownership. There must be a notion of inventory that an entity (eg. person, vehicle, furniture) can have, and that can be interacted with to grab or store or trade material. Obviously inventories usually have a storage limit, in stacks, and materials of the same type can stack up to a certain amount before they require another stack/slot in inventory. The inventory helper class is cognizant of restrictions on grabbing/storing when it comes to availability and available space."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Store and Retrieve Materials (Priority: P1)

An entity with an `Inventory` component can store materials (goods, resources, money) and later retrieve them. Storing respects available slot space and stack limits; retrieving respects availability. The inventory helper class communicates clearly when an operation cannot proceed — for example, inventory full, item not present, or insufficient quantity.

**Why this priority**: Core mechanic underpinning all economic interactions: trade, production, consumption. Every other system that touches goods depends on this.

**Independent Test**: Can be fully tested headlessly by: creating an entity with an inventory, adding items up to capacity, attempting to add beyond capacity, removing items, and verifying correct quantities and rejection messages at each step. Delivers the store/retrieve contract.

**Acceptance Scenarios**:

1. **Given** an entity with an inventory that has 3 open slots and a stack limit of 10 per slot, **When** 8 units of `Wood` are stored, **Then** one slot contains a stack of 8 `Wood` and 2 slots remain open.
2. **Given** an inventory with one slot holding 8 units of `Wood` (stack limit 10), **When** 5 more units of `Wood` are stored, **Then** 2 units fill the existing stack (now 10) and 3 units overflow into a new slot.
3. **Given** a full inventory (all slots occupied at stack limit), **When** any additional material is stored, **Then** operation is rejected with a clear `InventoryFullError`; inventory state is unchanged.
4. **Given** an inventory containing 5 units of `Stone`, **When** 3 units of `Stone` are retrieved, **Then** inventory contains 2 units of `Stone` and the retrieved items are returned to the caller.
5. **Given** an inventory containing 2 units of `Stone`, **When** 5 units of `Stone` are retrieved, **Then** operation is rejected with `InsufficientItemsError`; inventory state is unchanged.
6. **Given** any store/retrieve operation, **When** serialized to JSON mid-operation and reloaded, **Then** inventory state is identical and operation resumes correctly.

---

### User Story 2 - Stack-Based Slot Management (Priority: P1)

Inventory slots hold stacks of a single material type up to a configurable per-material stack limit. When materials of the same type are added, they fill existing stacks first before consuming new slots. Empty slots are reclaimed when a stack is fully removed. Different materials have different stack limits (e.g., money stacks higher than bulky goods).

**Why this priority**: Defines the fundamental data model for inventory. All queries, trades, and capacity checks depend on correct stack management.

**Independent Test**: Can be fully tested headlessly by: defining multiple materials with different stack limits, filling inventory with mixed materials, verifying slot allocation, removing partial stacks, verifying slot reclamation, and confirming no slot fragmentation.

**Acceptance Scenarios**:

1. **Given** material `Cheese` with stack limit 20 and material `Wood` with stack limit 50, **When** 15 `Cheese` and 30 `Wood` are stored, **Then** exactly 2 slots are occupied (one per material type) with correct quantities.
2. **Given** an inventory with a `Cheese` slot at stack limit (20/20), **When** 5 more `Cheese` are stored, **Then** a new slot is created for `Cheese` (second stack begins at 5).
3. **Given** an inventory with a slot of 5 `Stone`, **When** all 5 `Stone` are removed, **Then** the slot is reclaimed (freed) and available for other materials.
4. **Given** multiple partial stacks of the same material type, **When** querying total quantity of that material, **Then** the sum across all stacks is returned.
5. **Given** an inventory configuration, **When** serialized to JSON, **Then** each slot's material type, quantity, and stack limit are preserved and correctly deserialized.

---

### User Story 3 - Inventory Capacity Queries and Availability Checks (Priority: P1)

Before performing store or retrieve operations, systems and entities can query the inventory helper class to determine: how much space is available for a given material, whether a target quantity is available for retrieval, and whether a partial store is possible (when full amount doesn't fit). This avoids triggering errors and enables systems to make decisions before committing.

**Why this priority**: Needed by trade, job, and economic systems before initiating costly async operations. Prevents spurious rejections in task chains.

**Independent Test**: Can be fully tested headlessly by: building an inventory in various partial states, querying available space for multiple materials, querying availability, and verifying query results match expected values before any store/retrieve is attempted.

**Acceptance Scenarios**:

1. **Given** an inventory with 2 open slots and one slot of `Wood` at 8/50, **When** `canStore(Wood, 60)` is queried, **Then** result is `{ fits: false, maxFittable: 52 }` (42 remaining in existing stack + 50 in one new slot).
2. **Given** an inventory containing 15 units of `Cheese`, **When** `canRetrieve(Cheese, 10)` is queried, **Then** result is `{ available: true, quantity: 15 }`.
3. **Given** an inventory with no `Iron`, **When** `canRetrieve(Iron, 1)` is queried, **Then** result is `{ available: false, quantity: 0 }`.
4. **Given** a full inventory, **When** `availableSlots()` is queried, **Then** result is `0`.
5. **Given** any inventory state, **When** query result is used to guard a store/retrieve call with exact fitting amounts, **Then** the store/retrieve succeeds without error.

---

### User Story 4 - Money as a Special Inventory Item (Priority: P1)

Money is treated as a material in inventory with its own stack behavior, but it has special semantics: it is the primary medium of exchange in trades, and has a very high (or unlimited) stack limit compared to physical goods. Convenience methods (`balance()`, `debit(amount)`, `credit(amount)`) are available on inventory to interact with money without needing to know its material representation.

**Why this priority**: Money underpins all economic interactions; must be clean and reliable. The ECS spec (`003`) references `entity.inventory.balance()` explicitly.

**Independent Test**: Can be fully tested headlessly by: crediting money to an inventory, querying balance, debiting amounts, attempting to debit more than available, and verifying correct rejection. Tests the entire money lifecycle within inventory.

**Acceptance Scenarios**:

1. **Given** an entity with an empty inventory, **When** `credit(100)` is called, **Then** balance is 100 and money occupies an inventory slot at 100.
2. **Given** an inventory with a balance of 150, **When** `debit(50)` is called, **Then** balance is 100 and the money slot quantity is reduced.
3. **Given** an inventory with a balance of 30, **When** `debit(50)` is called, **Then** operation is rejected with `InsufficientFundsError`; balance unchanged.
4. **Given** two entities, **When** `entity.inventory.debit(100)` and `otherEntity.inventory.credit(100)` are performed atomically, **Then** total money across both inventories is unchanged (conservation).
5. **Given** money in inventory, **When** serialized to JSON and deserialized, **Then** balance is preserved exactly (no floating-point drift).

---

### User Story 5 - Transfer Between Inventories (Priority: P1)

Materials and money can be transferred directly between two entity inventories. A transfer operation checks availability on the source and space on the destination before committing. If either check fails, the transfer rejects atomically — no partial transfers that leave inventories in inconsistent states. Transfer is the building block for trade, looting, crafting input/output, and tax collection.

**Why this priority**: Essential mechanic for all economic exchanges. Trade, crafting, and resource distribution all reduce to inventory transfers.

**Independent Test**: Can be fully tested headlessly by: creating two entities with inventories, performing transfers, verifying source decreases and destination increases, attempting impossible transfers (insufficient source, full destination), and verifying atomicity on failure.

**Acceptance Scenarios**:

1. **Given** entity A with 20 `Wood` and entity B with an empty inventory, **When** `transfer(A.inventory, B.inventory, Wood, 10)` is called, **Then** A has 10 `Wood`, B has 10 `Wood`, total unchanged.
2. **Given** entity A with 5 `Wood` and B with a full inventory, **When** `transfer(A.inventory, B.inventory, Wood, 5)` is called, **Then** transfer rejects with `DestinationFullError`; both inventories unchanged.
3. **Given** entity A with 3 `Wood` and B with an empty inventory, **When** `transfer(A.inventory, B.inventory, Wood, 10)` is called, **Then** transfer rejects with `InsufficientItemsError`; both inventories unchanged.
4. **Given** a transfer of money between two entities, **When** transfer executes, **Then** total money across both entities is conserved; no money created or destroyed.
5. **Given** a transfer in progress at save time, **When** save is loaded, **Then** transfer state is deterministic — either fully committed or fully rolled back; no partial state.

---

### User Story 6 - Partial Stores (Priority: P1)

All item quantities are integers — there are no fractional items. However, a `store` operation may be asked to store more than fits, and the caller may explicitly opt into storing as much as fits (a partial store) rather than rejecting entirely. The `storeUpTo(material, quantity)` method stores the maximum integer quantity that fits, returns how many were actually stored, and leaves the remainder with the caller. This enables systems to fill inventories progressively without needing a pre-flight `canStore` check.

**Why this priority**: Commonly needed by production, harvesting, and trading systems that deliver goods incrementally. Partial stores prevent logic complexity at call sites.

**Independent Test**: Can be fully tested headlessly by: calling `storeUpTo` on a partially-full inventory, verifying the stored quantity is the correct integer maximum, and verifying the returned remainder is correct.

**Acceptance Scenarios**:

1. **Given** an inventory with space for 5 more `Wood`, **When** `storeUpTo(Wood, 20)` is called, **Then** 5 `Wood` are stored and the method returns `{ stored: 5, remainder: 15 }`.
2. **Given** a full inventory, **When** `storeUpTo(Wood, 10)` is called, **Then** `{ stored: 0, remainder: 10 }` is returned and inventory is unchanged.
3. **Given** `storeUpTo` called with exactly fitting quantity, **When** it executes, **Then** `{ stored: N, remainder: 0 }` is returned (same as `store()`).
4. **Given** any `storeUpTo` call, **When** serialized mid-execution and reloaded, **Then** stored quantity is deterministic (no partial slot state).

---

### User Story 7 - Item Weight and Carrying Capacity (Priority: P2)

Each material type has an optional weight value. Inventories that have a weight limit (e.g., a citizen's carrying capacity, a vehicle's cargo limit) refuse to accept items that would exceed the total weight limit, even if slots are available. Inventories without a weight limit (e.g., a stationary chest) are weight-unrestricted. Weight is always an integer or fixed-point value per unit of material.

**Why this priority**: Adds physical realism to economic simulation. Citizens can't carry unlimited goods; vehicles have cargo limits. P2 because slot-based capacity is the primary constraint.

**Independent Test**: Can be fully tested headlessly by: defining materials with weights, configuring an inventory with a weight limit, filling to near-limit, then attempting to store items exceeding the weight limit, verifying rejection.

**Acceptance Scenarios**:

1. **Given** a citizen with a weight limit of 50 units and materials `Stone` (weight 5/unit) and `Feather` (weight 0.1/unit represented as integer tenths), **When** 10 `Stone` are stored (total weight 50), **Then** inventory accepts them; no more `Stone` can be stored.
2. **Given** a weight-limited inventory at capacity, **When** `store(Stone, 1)` is called, **Then** rejected with `WeightLimitExceededError` even if slots are available.
3. **Given** a stationary chest with no weight limit, **When** any quantity of any material is stored (within slot limits), **Then** weight is not checked or enforced.
4. **Given** an inventory with weight limit and current weight, **When** `availableWeight()` is queried, **Then** remaining weight capacity is returned.
5. **Given** inventory with weighted items, **When** serialized to JSON and deserialized, **Then** total weight and weight limit are preserved.

---

### User Story 8 - Perishable Items (Priority: P2)

Some materials are perishable: they degrade or expire after a certain amount of game time. Each perishable material stack tracks its remaining game-time until expiry. When expiry is reached, the stack is automatically reduced or removed from inventory, and an event is emitted (so other systems can react, e.g., a citizen noticing their food has spoiled). Non-perishable materials are unaffected. Expiry is driven by game time, not real-world time.

**Why this priority**: Critical to food economy, trade urgency, and supply-chain gameplay. P2 because inventory works without it, but food/goods mechanics need it.

**Independent Test**: Can be fully tested headlessly by: creating a perishable stack with a short game-time expiry, advancing game time past expiry, and verifying: the stack is reduced/removed, an expiry event was emitted, and inventory state is consistent.

**Acceptance Scenarios**:

1. **Given** an inventory with 10 `Cheese` with an expiry of 48 game hours, **When** game time advances 48 hours, **Then** the `Cheese` stack is removed and a `MaterialExpiredEvent` is emitted.
2. **Given** `Cheese` stored at game time T, **When** `Cheese` has a 48-hour expiry, **Then** each stack records its expiry as `T + 48 hours` (not a global expiry — each stack expires based on when it was stored).
3. **Given** two stacks of `Cheese` stored at different times, **When** time advances past the first stack's expiry only, **Then** first stack expires; second stack remains.
4. **Given** a non-perishable material (`Wood`), **When** game time advances indefinitely, **Then** material does not expire.
5. **Given** a perishable stack with remaining game time, **When** serialized to JSON and deserialized, **Then** remaining game time until expiry is preserved precisely.

---

### User Story 9 - Equipment Slots (Priority: P2)

Some entities (citizens, soldiers, merchants) have equipment slots: named slots for worn or wielded items (e.g., `head`, `chest`, `mainHand`, `offHand`, `feet`). Equipment slots are distinct from general inventory storage — items in equipment slots are considered "equipped" and may provide stat modifiers or enable specific actions. Items are moved between general inventory and equipment slots; a slot holds exactly one item (not a stack). Equipment slots may restrict the types of items that can be equipped.

**Why this priority**: Enables combat, profession modifiers, and character customization. P2 because core inventory works without it.

**Independent Test**: Can be fully tested headlessly by: defining an entity with equipment slots, equipping and unequipping items, verifying slot restrictions, and verifying items moved between general inventory and equipment slots.

**Acceptance Scenarios**:

1. **Given** a citizen with equipment slots `{ mainHand, offHand, chest }` and a `Sword` item in general inventory, **When** `equip(Sword, mainHand)` is called, **Then** `Sword` is removed from general inventory and placed in `mainHand` slot.
2. **Given** `mainHand` slot already occupied by `Sword`, **When** `equip(Dagger, mainHand)` is called, **Then** `Sword` is unequipped back to general inventory and `Dagger` is equipped (swap behavior).
3. **Given** a `chest` equipment slot restricted to armor-type items, **When** `equip(Bread, chest)` is called, **Then** operation is rejected with `EquipmentSlotIncompatibleError`.
4. **Given** an entity with equipped items, **When** serialized to JSON and deserialized, **Then** equipped items and their slot assignments are preserved.
5. **Given** entity with equipped items, **When** entity is queried for all items (general inventory + equipment), **Then** combined totals are returned correctly.

---

### User Story 10 - Inventory Ownership and Access Restrictions (Priority: P2)

Inventories belong to entities and may have access restrictions: a locked chest cannot be accessed by arbitrary citizens, a merchant's stock is only transferable through a trade interaction, a vehicle's cargo can only be loaded/unloaded by authorized entities. The inventory helper is aware of ownership and communicates access restrictions through typed errors without bypassing them.

**Why this priority**: Required for meaningful faction politics, theft, locked containers, and trade authorization. P2 because core inventory mechanics work without it, but economic systems need it.

**Independent Test**: Can be fully tested headlessly by: defining inventories with access restrictions, attempting access from authorized and unauthorized entities, verifying authorized access succeeds and unauthorized access rejects with typed errors.

**Acceptance Scenarios**:

1. **Given** a locked chest inventory and an unauthorized citizen, **When** citizen attempts to retrieve from chest, **Then** operation rejects with `AccessDeniedError`.
2. **Given** a merchant's inventory and an authorized trade interaction, **When** trade transfers goods, **Then** transfer succeeds; access restriction does not block authorized interactions.
3. **Given** an entity with no access restrictions on its inventory, **When** any other entity attempts access, **Then** access succeeds (default is open).
4. **Given** an inventory with an access restriction, **When** serialized to JSON and deserialized, **Then** ownership and access restriction rules are preserved.

---

### Edge Cases

- What happens if stack limit for a material is changed after items are already stored at the old limit? → Existing stacks remain valid; new stores use the new limit.
- What happens if an inventory slot limit is reduced below current occupied slots? → Existing contents remain; no new items can be stored until space is freed.
- What happens if two concurrent transfers attempt to take the same items simultaneously? → Game loop is single-threaded per tick; concurrent transfers are sequenced by task execution order.
- What happens if money balance would go negative after debit? → Reject with `InsufficientFundsError`; balance floored at 0, never negative.
- What happens if a material type is unregistered (unknown to game)? → Reject store/retrieve with `UnknownMaterialError`.
- What happens if a transfer is between inventories on different maps? → Transfer itself is location-agnostic; physical travel (if required) is handled by the entity's task queue, not the inventory.
- What happens when an entity is deleted with items in its inventory? → Inventory contents may drop to terrain, be transferred to a loot pool, or be destroyed — depends on entity deletion semantics (caller responsibility).
- What happens if a perishable stack partially expires (e.g., 10 cheese, only half the game time elapsed)? → No partial expiry within a stack at this stage; entire stack expires at once when game time reaches the stack's expiry timestamp.
- What happens if two perishable stacks of the same material are merged? → The earlier expiry timestamp is used for the merged stack (conservative — prevents spoiled items hiding behind fresh ones).
- What happens if an item is equipped but general inventory is full when the player tries to unequip? → Unequip rejects with `InventoryFullError`; item remains equipped.
- What happens if a weight-limited entity picks up items through a transfer that would exceed weight? → Transfer rejects with `WeightLimitExceededError`; atomicity preserved.
- What happens to equipped items when item weight changes (e.g., material rebalance)? → Equipped items recalculate total weight on next query; no retroactive rejection of already-equipped items.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide an `Inventory` component attachable to any entity (person, vehicle, furniture, chest, etc.).
- **FR-002**: System MUST support configurable slot count per inventory instance (e.g., a chest has 20 slots; a citizen has 8 slots).
- **FR-003**: System MUST support per-material configurable stack limits (e.g., `Coin` stacks to 10000; `Wood` stacks to 50; `Cheese` stacks to 20).
- **FR-004**: System MUST fill existing partial stacks of the same material before consuming a new slot.
- **FR-005**: System MUST reclaim (free) a slot when its stack quantity reaches zero.
- **FR-006**: System MUST provide `store(material, quantity)` that places items into inventory, respecting stack limits and slot availability.
- **FR-007**: System MUST provide `retrieve(material, quantity)` that removes items from inventory, respecting availability.
- **FR-008**: System MUST reject store operations that exceed capacity with `InventoryFullError`, leaving inventory unchanged.
- **FR-009**: System MUST reject retrieve operations that exceed availability with `InsufficientItemsError`, leaving inventory unchanged.
- **FR-010**: System MUST provide `canStore(material, quantity)` returning available capacity for a given material without modifying inventory.
- **FR-011**: System MUST provide `canRetrieve(material, quantity)` returning availability of a given material without modifying inventory.
- **FR-012**: System MUST provide `balance()`, `credit(amount)`, and `debit(amount)` as convenience methods for money, backed by money's material slot.
- **FR-013**: System MUST reject `debit(amount)` when balance is insufficient, with `InsufficientFundsError`, leaving balance unchanged.
- **FR-014**: System MUST provide `transfer(source, destination, material, quantity)` that atomically moves items between inventories; rejects if source insufficient or destination full, with no partial state.
- **FR-015**: System MUST provide `storeUpTo(material, quantity)` that stores the maximum integer quantity that fits and returns `{ stored, remainder }`; never errors on capacity.
- **FR-016**: System MUST support per-material optional weight values; weight is represented as a non-negative integer (or fixed-point integer) per unit.
- **FR-017**: System MUST support per-inventory optional weight limits; stores and transfers that would exceed a weight limit are rejected with `WeightLimitExceededError`.
- **FR-018**: System MUST provide `availableWeight()` query returning remaining weight capacity for weight-limited inventories.
- **FR-019**: System MUST support per-material optional perishability: a game-time duration after which a stored stack expires.
- **FR-020**: System MUST track per-stack expiry timestamps (game time at storage + duration); each stack expires independently.
- **FR-021**: System MUST automatically remove or reduce expired stacks when game time advances past their expiry, and emit a `MaterialExpiredEvent`.
- **FR-022**: System MUST support named equipment slots per entity (e.g., `mainHand`, `chest`), each holding exactly one item (not a stack).
- **FR-023**: System MUST support equipment slot type restrictions; equipping an incompatible item rejects with `EquipmentSlotIncompatibleError`.
- **FR-024**: System MUST support equip/unequip operations that move items between general inventory and equipment slots atomically.
- **FR-025**: System MUST support ownership and access restrictions; unauthorized access rejects with `AccessDeniedError`.
- **FR-026**: System MUST serialize full inventory state (slots, materials, quantities, stack limits, expiry timestamps, weight, equipment slots, ownership, access rules) to JSON without loss.
- **FR-027**: System MUST deserialize inventory state from JSON and produce identical inventory state.
- **FR-028**: System MUST operate identically in headless environments (no renderer).

### Key Entities

- **Inventory**: Component attachable to any entity. Has a slot count, a collection of `InventorySlot`s, an owner entity ID, and optional access restriction rules.
- **InventorySlot**: A single slot in an inventory. Contains a material type and a quantity (0 means empty/reclaimed). Quantity cannot exceed the material's stack limit.
- **Material**: A typed, registered game resource (e.g., `Wood`, `Cheese`, `Coin`, `Iron`). Has a name, a stack limit, an optional weight per unit (non-negative integer), and an optional perishability duration (in game hours).
- **InventorySlot**: A single general-storage slot. Contains a material type, an integer quantity, and — for perishable materials — an expiry timestamp in game hours.
- **EquipmentSlot**: A named slot for a single worn/wielded item. Has a name (e.g., `mainHand`), a type restriction (e.g., `weapon`), and holds at most one item.
- **InventoryTransaction**: Represents a store, retrieve, transfer, equip, or unequip operation. Used for atomicity guarantees and serialization of in-progress operations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Store and retrieve operations on inventories with up to 100 slots and 10,000 items complete in under 1ms.
- **SC-002**: Capacity and availability queries (`canStore`, `canRetrieve`) return correct results 100% of the time on any inventory state.
- **SC-003**: All failed operations (full, insufficient, access denied) leave inventory in exactly the pre-operation state (zero side effects).
- **SC-004**: Money balance is conserved across all transfer operations; total money in game never increases or decreases through inventory operations alone.
- **SC-005**: Inventory state serialized to JSON and deserialized produces bit-for-bit identical slot contents, quantities, and ownership.
- **SC-006**: Transfer and equip/unequip operations are atomic; no partial state is observable or serializable.
- **SC-007**: Inventory helper methods are usable directly from entity component access: `entity.inventory.balance()`, `entity.inventory.store(...)`, `entity.inventory.canRetrieve(...)`.
- **SC-008**: All inventory operations behave identically in headless and browser environments.
- **SC-009**: `storeUpTo` always returns `stored + remainder == quantity` (integer conservation).
- **SC-010**: Perishable stack expiry events fire at the correct game time tick; no expiry fires early or late by more than one tick.
- **SC-011**: Weight accounting is exact; total weight of all items in inventory matches sum of (material weight × quantity) for all slots.

## Assumptions

- **Money as Material**: Money is a registered material type (`Coin` or equivalent) with a very high or effectively unlimited stack limit. All money interactions go through the same inventory slot mechanism as other materials; `balance()`, `credit()`, `debit()` are convenience wrappers.
- **Single Currency**: The game has one primary money type at this stage. Multiple currencies are out of scope.
- **Integer Quantities Only**: All item quantities are integers. There are no fractional items. Partial stacks (e.g., 64 out of 100 max) are valid as long as the quantity is a whole number.
- **Weight as Integer**: Item weight per unit is expressed as a non-negative integer (e.g., in tenths of a unit for precision). No floating-point weight values.
- **Per-Stack Expiry**: Perishability is tracked per stack, not per individual item. Each stack's expiry timestamp is set when the stack is created; merging stacks uses the earlier expiry.
- **Full-Stack Expiry Only**: At expiry, the entire stack is removed at once. Partial decay within a stack is out of scope.
- **Equipment Slots Are Entity-Level**: Equipment slot definitions (which slots exist, type restrictions) are part of the entity prototype, not the inventory itself.
- **`store()` Is All-or-Nothing**: `store(material, quantity)` rejects if the full amount doesn't fit. `storeUpTo(material, quantity)` is the explicit partial variant.
- **Transfer Location-Agnostic**: Transfer operations between two inventories do not involve physical movement. Physical travel is handled by entity task queues.
- **Deterministic Slot Order**: Slot allocation order is deterministic (seeded PRNG for tie-breaking if needed), ensuring identical saves produce identical slot layouts.
- **Access Default Open**: Inventories are open-access by default unless a restriction is explicitly set.
- **Material Registry at Startup**: All material types (including weight and perishability) are registered at game startup. Materials cannot be defined dynamically during gameplay.

## Clarifications

_(None pending — all design decisions resolved through constitution and session clarifications.)_
