# Feature Specification: Stockpiles & Storage

**Created**: 2026-05-03
**Input**: User description: "I want to specify stockpiles and storages. There are furniture entities that can have inventories, including but not limited to boxes, cabinets, bookcases. These entities work the same as other entities. There are many kinds of zones/rooms, as specified before, and amongst those is a 'pantry' room (enclosed) that has an effect on inventories within it that make items decay less."

## User Scenarios & Testing

### User Story 1 - Storage Furniture as Inventory-Bearing Entities (Priority: P1)

Storage entities (boxes, cabinets, bookcases, barrels, chests, etc.) are standard ECS entities with an Inventory component. They are placed in the world via construction (feature 016), have a physical position on the map, and hold materials up to their configured capacity. Any other entity or system that can interact with inventories can interact with storage furniture inventories — there is no special-casing for storage. The set of storage furniture types is open: new types are added by defining new entity prototypes with inventory configurations.

**Why this priority**: Storage furniture is the fundamental unit of material organisation. All material hauling, production input/output, and zone requirements depend on having somewhere to put things. Blocking for economic gameplay.

**Independent Test**: Can be fully tested headlessly by: placing a Box entity with a 10-slot inventory, storing materials in it via the inventory API, querying the box's contents, and verifying results match the inventory spec (feature 005) contract.

**Acceptance Scenarios**:

1. **Given** a Box entity with a configured 10-slot inventory placed on the map, **When** a hauler deposits 5 Wood into the Box, **Then** the Box inventory contains 5 Wood and the slot count decrements accordingly.
2. **Given** a Cabinet entity with a weight-limited inventory, **When** materials are stored up to the weight limit, **Then** further storage is rejected with the same `WeightLimitExceededError` as any inventory.
3. **Given** any storage entity, **When** queried for its inventory state, **Then** the result is indistinguishable in API terms from querying a citizen's inventory (same interface, same error types).
4. **Given** a new storage entity prototype defined in data (e.g., a Barrel with 5-slot, 200-weight capacity), **When** registered, **Then** it is immediately constructable and functional as storage without any code change.
5. **Given** a storage entity with items, **When** the entity is serialized and deserialized, **Then** its inventory state is fully preserved (consistent with feature 005 serialization).

---

### User Story 2 - Stockpile Zones as Designated Storage Areas (Priority: P1)

A **Stockpile** is a zone type (feature 015) that designates an area as a preferred deposit destination for haulers. Items are always stored in the inventories of furniture entities placed within the zone — boxes, barrels, crates, etc. The zone itself has no inventory; it is purely a designation that influences hauling routing. A stockpile's effective capacity is the sum of the inventories of all storage furniture placed within its tiles.

**Why this priority**: Stockpile zones let players organise the colony by designating areas for bulk storage of specific materials. They tie together zones, furniture, and hauling routing into a coherent logistics system.

**Independent Test**: Can be fully tested headlessly by: designating a 4×4 area as a Stockpile zone, placing two Barrel entities (each 5-slot) inside it, and having a hauler deliver Stone. Verify Stone goes to the barrels' inventories, not to any zone-level container.

**Acceptance Scenarios**:

1. **Given** a Stockpile zone containing two Barrel entities (5 slots each), **When** a hauler delivers 8 Stone, **Then** the Stone is stored in the barrels' inventories according to the inventory system rules; the zone has no inventory of its own.
2. **Given** a Stockpile zone with all contained furniture inventories full, **When** a hauler attempts to deposit material, **Then** the deposit is rejected (all furniture full) and the hauler seeks an alternative storage location.
3. **Given** a Stockpile zone with a material filter set (only "raw materials" category), **When** a hauler attempts to deposit Bread, **Then** the hauler does not route Bread to any furniture in that zone.
4. **Given** a Stockpile zone, **When** a production system queries for available Iron Ore, **Then** the inventories of furniture entities within the zone are searched as normal inventory sources.
5. **Given** a Stockpile zone designation is removed, **When** storage furniture was inside it, **Then** the furniture and its contents are unaffected; the furniture remains in place with its inventory intact.

---

### User Story 3 - Material Filters on Storage Furniture (Priority: P1)

Storage furniture entities can have **material filters**: rules that restrict which materials may be deposited into their inventories. Filters are set by the player and define which material categories or specific material IDs are accepted. Furniture with no filter accepts all materials. Stockpile zones may also carry a filter that applies as a default to all furniture within the zone, but per-furniture filters override the zone filter. Haulers check the filter before depositing; filtered-out materials are redirected to a compatible location.

**Why this priority**: Without filters, all storage fills with whatever arrives first, creating chaotic organisation. Filters let players designate a chest for tools, a barrel for grain, a zone for ore — essential for meaningful logistics.

**Independent Test**: Can be fully tested headlessly by: configuring a chest with a filter for "food" category only, attempting to deposit Wood (rejected) and Bread (accepted), verifying Wood is redirected and Bread is stored.

**Acceptance Scenarios**:

1. **Given** a chest with filter `{ categories: ["food"] }`, **When** a hauler attempts to deposit Wood, **Then** the deposit is rejected and the hauler seeks another storage location that accepts Wood.
2. **Given** a chest with filter `{ materialIds: ["iron_ingot", "copper_ingot"] }`, **When** a hauler deposits Iron Ingot, **Then** it is accepted; depositing Stone is rejected.
3. **Given** a storage entity with no filter, **When** any material is deposited, **Then** it is accepted (subject only to the inventory capacity limits from feature 005).
4. **Given** a Stockpile zone with a category filter and furniture inside it that has no per-furniture filter, **When** a hauler evaluates deposit targets in that zone, **Then** the zone filter governs which materials are routed to that furniture.
5. **Given** a Stockpile zone with a category filter and furniture inside it that has its own explicit filter, **When** a hauler evaluates deposit targets, **Then** the furniture's own filter takes precedence over the zone filter.
6. **Given** a filter is updated by the player, **Then** existing inventory contents that no longer match the filter are not evicted — filtering is deposit-time only.
7. **Given** all storage locations compatible with a material are full, **When** a hauler needs to store that material, **Then** the hauler reports "no compatible storage available" and holds the material until space frees up.

---

### User Story 4 - Pantry Room: Reduced Decay Rate (Priority: P1)

The **Pantry** is a zone type that requires a Room (enclosed, feature 015). When a Pantry zone is active (all requirements met), all perishable inventory items held by furniture entities whose position is within the Pantry's tile area decay at a reduced rate. The decay reduction is defined in the Pantry zone type definition as an entity modifier effect (consistent with the hybrid zone effect schema from feature 015). Items outside the Pantry decay at the normal rate.

**Why this priority**: The Pantry is the first concrete example of a zone providing a material preservation effect. It gives players a meaningful reason to build enclosed food storage rooms, tying construction, zones, and inventory together.

**Independent Test**: Can be fully tested headlessly by: creating an enclosed Pantry zone, placing a chest entity inside it, storing perishable Cheese in the chest, advancing game time, and verifying the Cheese decays slower than identical Cheese in an identical chest outside the Pantry.

**Acceptance Scenarios**:

1. **Given** an active Pantry zone containing a chest with 10 Cheese (perishability tick-based, feature 005), **When** game time advances 100 ticks, **Then** the Cheese has a longer remaining expiry than identical Cheese stored outside the Pantry.
2. **Given** a Pantry zone that becomes inactive (wall removed, zone loses Room status), **When** items were previously benefiting from the decay reduction, **Then** the decay reduction stops immediately; items decay at the normal rate going forward.
3. **Given** a Pantry zone, **When** a non-perishable material (Wood) is stored in it, **Then** no decay-related change occurs (decay reduction only applies to perishable items).
4. **Given** two chest entities in the same Pantry zone, **When** the Pantry is active, **Then** perishable items in both chests benefit from the decay reduction.
5. **Given** a Pantry zone effect specifying `{ type: "entity.modifier", modifier: "inventory.decay.rate", value: 500 }` (fixed-point ×1000, i.e. 50% decay rate), **When** a perishable item in the zone would normally expire in 48 game hours, **Then** it expires in 96 game hours instead.

---

### User Story 5 - Storage Priority and Hauling Routing (Priority: P2)

When a hauler needs to deposit a material, it selects the best storage destination based on a priority order: (1) filtered furniture inside a profession-affinity zone matching the material (and the hauler's skill-derived affinity, spec 020), (2) any explicitly filtered furniture matching the material, (3) compatible furniture inside a Stockpile zone, (4) any other compatible open furniture with available capacity. Nearest valid destination wins within each tier. All deposit targets are storage furniture entities; the zone context influences routing priority but the item always ends up in a furniture inventory.

**Why this priority**: Routing determines whether materials end up in sensible locations. Without tiered priority, all materials go to the nearest available spot, defeating the purpose of profession zones and material filters. P2 because basic hauling works without it, but organisation collapses quickly.

**Independent Test**: Can be fully tested headlessly by: creating a Bakery zone with a filtered Flour chest inside, an unfiltered generic chest outside, and a Baker hauler. Verifying Flour routes to the Bakery chest first, then the generic chest if the Bakery chest is full.

**Acceptance Scenarios**:

1. **Given** a Bakery zone with a filtered Flour chest inside and a generic unfiltered chest outside, **When** a Baker hauls Flour, **Then** the Flour goes to the Bakery chest (profession affinity + filter match) before the generic chest.
2. **Given** the Bakery Flour chest is full, **When** the Baker still has Flour to deposit, **Then** the Baker falls back to the generic chest.
3. **Given** two chests with matching filters equidistant from the hauler, **When** the hauler deposits, **Then** the chest with more available space is preferred (or PRNG breaks the tie deterministically).
4. **Given** a material with no compatible storage anywhere, **When** the hauler evaluates, **Then** the hauler holds the material and emits a `storage.no-compatible-destination` event; the game does not deadlock.
5. **Given** a hauler carrying mixed materials (Wood and Bread), **When** depositing, **Then** the hauler routes each material type to its best compatible destination independently, potentially visiting multiple storage locations.

---

### User Story 6 - Storage Inventory Querying Across All Sources (Priority: P2)

Systems that need materials (production, construction, AI) query a unified storage query interface: "where is the nearest accessible source of N units of material X?" The query searches all inventory-bearing entities on the current map — storage furniture, haulers carrying materials — and returns the best match. The query is identical regardless of which entity type holds the material.

**Why this priority**: Without a unified query, every system (production, construction, AI hunger) must independently enumerate all storage types. A unified interface prevents duplication and ensures new storage types are automatically included.

**Independent Test**: Can be fully tested headlessly by: placing 5 Wood in a chest and 5 Wood in a hauler's inventory, then querying for 10 Wood and verifying the query returns both the chest and the hauler as sources.

**Acceptance Scenarios**:

1. **Given** Wood in a chest and in a hauler's inventory, **When** a query for Wood is issued, **Then** both sources are returned as candidates with their locations and available quantities.
2. **Given** a query for a material that exists only in an inaccessible location (locked chest, unreachable tile), **When** the query runs, **Then** the inaccessible source is excluded from results (accessibility checked at query time).
3. **Given** a query for 20 Iron when no single source has 20, **When** evaluated, **Then** the query returns multiple partial sources whose combined quantity meets the requirement (multi-source fulfilment).
4. **Given** 100+ inventory-bearing entities on the map, **When** a material query runs, **Then** results are returned in under 10ms.
5. **Given** storage contents change between query and retrieval (another entity took the material), **When** the retrieval is attempted, **Then** the retrieval fails gracefully and the requester re-queries.

---

### Edge Cases

- What happens if a storage entity is full and a hauler arrives with material to deposit? → Hauler is redirected to the next compatible storage. No blocking at the entity level.
- What happens if a chest inside a Pantry zone is moved outside the zone? → The chest and its contents no longer benefit from the Pantry effect. Zone effects apply based on current tile position of the storage entity.
- What happens if a perishable item in a Pantry is partially expired when the Pantry deactivates? → Decay resumes at normal rate from the current remaining time. No retroactive penalty.
- What happens if the Pantry zone type is configured with a decay multiplier of 0 (no decay)? → Items inside never expire. This is a valid configuration; game balance determines what the Pantry effect value is.
- What happens if two Pantry zones overlap (though tile overlap is disallowed by feature 015)? → Not possible; feature 015 enforces disjoint tile membership.
- What happens if a storage entity's inventory component is removed or modified at runtime? → The entity ceases to function as storage; any existing contents are orphaned (game logs a warning). Inventory components should not be removed from placed storage.
- What happens if a hauler is carrying materials and the game is saved? → The hauler's inventory (including carried materials) is serialized. On load, the hauler continues its delivery route.
- What happens if storage furniture inside a Pantry holds a mix of perishable and non-perishable items? → Only perishable items are affected by the decay modifier. Non-perishables are unaffected.

## Requirements

### Functional Requirements

- **FR-001**: Storage furniture entities (Box, Cabinet, Bookcase, Barrel, Chest, etc.) MUST be standard ECS entities with an Inventory component. Their behaviour is governed entirely by the inventory system (feature 005); no special storage-specific inventory logic is required.
- **FR-002**: Storage entity prototypes MUST be defined in the entity prototype registry (feature 003) with configurable inventory parameters: slot count, weight limit (optional), and default material filter (optional).
- **FR-003**: System MUST support a Stockpile zone type (defined in the zone type registry, feature 015). A Stockpile zone is a routing designation only; it has no inventory of its own. All items are stored in the inventories of furniture entities placed within the zone.
- **FR-004**: A Stockpile zone MAY carry a material filter that governs which materials haulers will route to furniture within that zone. Per-furniture filters override the zone filter. Filters are configurable by the player after zone designation.
- **FR-005**: Material filters on storage furniture MUST be enforceable at deposit time. Haulers MUST check both zone-level and furniture-level filters before depositing. Rejected materials are redirected to a compatible alternative storage location.
- **FR-006**: Filters MUST NOT evict existing inventory contents that no longer match an updated filter. Filtering is deposit-time only; existing contents remain until retrieved.
- **FR-007**: System MUST define a Pantry zone type in the zone type registry. Requirements: `requiresRoom: true`, minimum tile size (game balance constant). Effects: `{ type: "entity.modifier", modifier: "inventory.decay.rate", value: <multiplier> }` (multiplier stored as a fixed-point integer, ×1000) applied to perishable items in inventories of furniture entities located on Pantry zone tiles. The Pantry multiplier combines with the difficulty `decayMultiplier` per spec 027 FR-015 (Pantry first, then difficulty).
- **FR-008**: The Pantry decay modifier MUST apply to all perishable items in inventories of furniture entities whose position is on a tile within an active Pantry zone. Non-perishable items and entities outside the zone are unaffected.
- **FR-009**: The Pantry decay modifier MUST be applied and removed dynamically as the zone activates/deactivates and as storage entities move in/out of the zone tiles.
- **FR-010**: Hauler routing MUST follow a tiered priority: (0) for outputs of runs carrying `deliverToZoneId` (spec 026 FR-020), compatible storage in that zone, (1) profession-affinity zone storage matching the material, where the zone's affinity matches the hauler's skill-derived affinity (e.g. dominant skill or skill above a threshold, spec 020; there is no profession component), (2) explicitly filtered storage matching the material, (3) generic storage tier: compatible furniture inside a Stockpile zone (the zone's preferred-deposit designation, FR-003), (4) any other compatible open storage. Within each tier, nearest accessible destination wins. Storage furniture on a dwelling's tiles (spec 029) is excluded from every routing tier (spec 029 FR-017).
- **FR-011**: System MUST provide a unified material query interface: given a material ID and quantity, return all accessible inventory-bearing entities on the current map containing that material, sorted by proximity to the requesting entity.
- **FR-012**: Material queries MUST exclude inaccessible storage (locked, unreachable by pathfinding). Accessibility is checked at query time. Storage furniture on a dwelling's tiles is accessible only to that dwelling's residents (spec 029 FR-017).
- **FR-013**: Material queries MUST support multi-source fulfilment: return a list of sources whose combined quantity meets the requested amount, even if no single source has enough.
- **FR-014**: All storage state (furniture inventories, material filters) MUST serialize to GameState (feature 006) and resume identically on load.
- **FR-015**: System MUST emit `storage.no-compatible-destination` when a hauler cannot find any valid storage for a carried material. The same condition is reported as the spec 025 `BlockedReason` `NoStorageDestination { materialId }` on the hauler or the loose pile.

### Key Entities

- **Storage Furniture** (Box, Cabinet, Barrel, Chest, Bookcase, etc.): Standard ECS entities with Inventory component, placed in the world. Slot count and weight limit are prototype-defined. May have a MaterialFilter component. No special logic beyond what the inventory system (feature 005) already provides.
- **StockpileZone**: An instance of the Stockpile zone type. A routing designation that tells haulers to prefer depositing compatible materials into furniture within its tiles. Has no inventory of its own. May carry a zone-level MaterialFilter as a default for furniture inside it.
- **MaterialFilter**: A component attachable to any storage entity or a stockpile zone. Declares accepted material IDs and/or categories. Checked at deposit time; does not evict existing contents. Per-furniture filter overrides zone filter.
- **PantryZone**: An instance of the Pantry zone type. Active when fully enclosed (Room status) and minimum size met. Delivers an `inventory.decay.rate` modifier to perishable items in inventories of furniture entities on its tiles while active.
- **StorageQuery**: A query object representing a request for N units of material X from nearby accessible sources. Returns an ordered list of (source entity, quantity, distance) tuples.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A new storage furniture type (new prototype with inventory config) is functional as storage immediately after definition — no code change required.
- **SC-002**: Perishable items inside an active Pantry zone decay at the configured reduced rate; removing the zone restores normal decay within 1 tick.
- **SC-003**: Material filter enforcement is 100% reliable at deposit time: no deposit occurs that violates a filter constraint.
- **SC-004**: Hauler routing correctly places materials in profession-affinity zones before generic storage in 90%+ of test scenarios where both are reachable and have capacity.
- **SC-005**: Material query across 100+ inventory-bearing entities returns results in under 10ms.
- **SC-006**: All storage state (furniture inventories, filters, Pantry zone status) is fully preserved through save/load with no material loss or duplication.
- **SC-007**: Multi-source material fulfilment correctly identifies combinations of sources meeting a requested quantity in 100% of test cases where sufficient total stock exists.

## Assumptions

- **Storage furniture is just inventory-bearing entities**: No separate "storage system" is needed. The inventory system (feature 005), entity prototype system (feature 003), and construction system (feature 016) together fully cover storage furniture. This spec defines the data configuration and player-facing behaviour, not new engine mechanics.
- **Stockpile zones are routing designations only**: A Stockpile zone has no inventory of its own. Capacity of a stockpile is determined entirely by the combined inventories of furniture entities placed within it. Players increase stockpile capacity by building and placing more furniture.
- **Pantry effect value is a game balance constant**: The exact decay multiplier (e.g., 500 = half decay rate, fixed-point ×1000; content data may author 0.5, converted to fixed-point at load) is defined in the Pantry zone type data, not hardcoded. Game designers tune it via data.
- **Pantry applies to tile location of storage entity**: The decay modifier is applied based on where the storage entity is placed on the map. If a chest is on a Pantry tile, its contents benefit. If moved off the tile, they stop benefiting.
- **Material filters are player-configurable but not mandatory**: All storage works without filters. Filters are an optional player-organisation tool. Default state (no filter) accepts all materials.
- **Unified query interface is synchronous within a tick**: Material queries are evaluated eagerly within the tick they are requested. There is no async or lazy evaluation of storage queries.
- **Haulers are entities with inventory components**: Hauling is performed by entities using their own carrying inventory. The hauler's inventory is temporary storage in transit; it is not a persistent storage location.
