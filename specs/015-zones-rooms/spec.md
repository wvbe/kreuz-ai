# Feature Specification: Zones & Rooms

**Created**: 2026-05-02
**Input**: User description: "I want to specify what zones and rooms are. Zones and rooms function the same in the sense that they enable certain activities or entity modifiers (such as happiness) if they are of sufficient size and has the correct furniture in it. A zone can be any amount of contiguous tiles, a room is a zone but needs to be enclosed in walls and doors on all sides. When a zone or room is for a specific profession, eg. 'bakery', then entities will also prefer to store related materials (eg. tools) there rather than somewhere else. Zones and rooms can be designated by the user because they are the colony government."

## User Scenarios & Testing

### User Story 1 - Designate a Zone by Painting Tiles (Priority: P1)

The player (as colony government) selects a zone type and paints tiles on the map to designate a zone. The designated tiles must form a contiguous area. The system validates contiguity and assigns the zone an identity. The zone is immediately active and queryable by other systems.

**Why this priority**: Zone designation is the user-facing primitive on which everything else builds. Without it, no zones exist and no effects can apply.

**Independent Test**: Can be fully tested headlessly by: issuing a designation command covering N tiles, verifying the zone entity is created with correct tile membership, querying zone type and tile membership, and verifying contiguity validation rejects disconnected tile sets.

**Acceptance Scenarios**:

1. **Given** a player designates a 5×5 area as "Bakery", **When** the designation is committed, **Then** a Zone entity exists with type "Bakery", containing 25 tiles, all contiguous.
2. **Given** a partially-designated zone, **When** the player adds more tiles that are adjacent to existing zone tiles, **Then** the zone expands to include the new tiles (contiguity maintained).
3. **Given** a player attempts to designate tiles that are not contiguous (two separate tile groups), **When** the designation is committed, **Then** two separate zones are created (one per contiguous group) or the system rejects disconnected input. **Open question:** which of the two behaviors the designation tool uses.
4. **Given** a zone exists, **When** the player removes tiles from it, **Then** the zone shrinks; if the remaining tiles become non-contiguous, the zone splits into two separate zones.
5. **Given** a zone is deleted by the player, **When** deletion is confirmed, **Then** the Zone entity is removed, all zone effects cease, and tiles return to undesignated state.

---

### User Story 2 - Auto-Detect Rooms from Enclosed Terrain (Priority: P1)

A "Room" is a zone that is fully enclosed: every cell bordering the zone is occupied by a wall or door entity (open or closed), with no gaps. When the player designates an enclosed area as a zone, or when the terrain changes such that an existing zone becomes enclosed, the system automatically recognizes it as a Room (in addition to being a Zone). Room status enables additional effects not available to open zones. Room detection runs after any terrain modification (including wall or door entities being placed or removed).

**Why this priority**: The zone/room distinction drives architectural gameplay (players build walls to unlock room-exclusive bonuses). Auto-detection means players build terrain naturally and the system rewards enclosure without manual room designation.

**Independent Test**: Can be fully tested headlessly by: creating a 5×5 area enclosed by wall entities with a door, designating the interior as a zone, and verifying the zone is automatically classified as a Room. Then remove one wall entity and verify Room status is lost.

**Acceptance Scenarios**:

1. **Given** a 5×5 area surrounded by walls with a single door, **When** the interior tiles are designated as a zone, **Then** the zone is classified as a Room (fully enclosed).
2. **Given** a zone classified as a Room, **When** a wall entity is removed (creating a gap), **Then** the zone loses Room status and reverts to an open Zone.
3. **Given** a room with a closed door, **When** the door is opened, **Then** the zone retains Room status. Door entities always count as enclosing perimeter tiles regardless of open/closed state. Only a missing door (gap in wall) breaks enclosure.
4. **Given** terrain alterations adjacent to an existing zone, **When** alteration creates complete enclosure, **Then** room detection runs automatically and the zone upgrades to a Room without player action.
5. **Given** two separate enclosed areas that share a wall, **When** the shared wall is removed (creating a passage), **Then** room detection re-evaluates, and if both zones are of the same type the system offers to merge them into one zone (or one Room if still enclosed) with player confirmation (FR-015).

---

### User Story 3 - Zone Effects: Enabling Activities and Entity Modifiers (Priority: P1)

Each zone type has a definition that specifies: required size (minimum tile count), required furniture (types and quantities), whether it must be a Room, and the effects it grants when requirements are met. Effects include: enabling specific activities at this location (e.g., baking is only possible in a Bakery zone) and applying entity modifiers (e.g., +mood bonus when a citizen visits their bedroom). Effects are only active when all requirements are satisfied.

**Why this priority**: Effects are the reason zones exist. Without them, designating a zone has no gameplay consequence. Effects tie together terrain, furniture, production, and AI systems.

**Independent Test**: Can be fully tested headlessly by: defining a zone type with requirements (size ≥ 10 tiles, 1 Oven, must be Room), creating a zone meeting all requirements, verifying effects are active, then removing the Oven and verifying effects deactivate.

**Acceptance Scenarios**:

1. **Given** a Bakery zone type requiring: Room, ≥ 6 tiles, 1 Oven, **When** a zone meets all requirements, **Then** the "baking" activity is enabled at this location and a `zone.requirements.met` event is emitted.
2. **Given** a Bedroom zone type granting +mood modifier to entities who sleep there, **When** a citizen sleeps in a valid Bedroom, **Then** the citizen receives the mood bonus for the duration of sleep.
3. **Given** a zone currently meeting requirements, **When** a required furniture item is removed (Oven sold or destroyed), **Then** effects deactivate immediately, a `zone.requirements.lost` event is emitted, and activities requiring this zone can no longer begin here.
4. **Given** a zone below the minimum tile size requirement, **When** the zone is queried for active effects, **Then** zero effects are active; a query for "unmet requirements" lists the size shortfall.
5. **Given** a zone type that does not require a Room (e.g., "Farm Field"), **When** a contiguous open-air zone of that type is designated, **Then** zone effects apply without requiring walls.

---

### User Story 4 - Zone Requirements as an Open Set (Priority: P1)

Zone types are data-driven: the set of zone types, their requirements, and their effects are defined in a registry (analogous to the Material and Recipe registries). New zone types can be added without code changes. Zone type definitions declare: name, required furniture types/quantities, minimum tile count, whether a Room is required, and the list of effects (activity unlocks, entity modifiers). Effects use a hybrid schema: **activity unlocks** are named references (e.g., `{ type: "activity.unlock", activityId: "baking" }`) that reference activity IDs registered by the production and AI systems; **entity modifiers** are declarative values (e.g., `{ type: "entity.modifier", modifier: "mood.bonus", value: 5 }`) interpreted by the AI/needs system. Adding a new zone with existing effect types requires only data; adding a new effect _type_ requires engine support.

**Why this priority**: An open registry is what enables game content to scale. A fixed hardcoded list of zones would severely limit content depth. This parallels the Material and Recipe registry design.

**Independent Test**: Can be fully tested by: defining 10+ zone types in a data file, loading them at bootstrap, verifying all types are queryable, and verifying a newly-added zone type (added without code change) functions correctly in-game.

**Acceptance Scenarios**:

1. **Given** a zone type definition `{ id: "bakery", requiresRoom: true, minTiles: 6, furniture: [{ type: "oven", count: 1 }], effects: [...] }`, **When** loaded, **Then** the zone type is available for player designation and requirements are enforced.
2. **Given** a zone type with no furniture requirements (e.g., "Farm Field"), **When** loaded, **Then** the zone still enforces size and room requirements if defined, and grants its effects when met.
3. **Given** a zone type referencing a furniture type that doesn't exist in the entity registry, **When** loaded at bootstrap, **Then** validation rejects with a clear error (referential integrity).
4. **Given** 50+ zone types loaded, **When** the system queries which zone types are satisfiable at a given location, **Then** results return in under 5ms.

---

### User Story 5 - Profession Zones: Material Storage Affinity (Priority: P2)

When a zone has a profession affinity (e.g., "Bakery" for bakers, "Smithy" for smiths), entities whose skill-derived affinity matches it (e.g. dominant skill or skill above a threshold, spec 020; "Baker" is a descriptive label only, there is no profession component) prefer to store related materials and tools in that zone rather than generic stockpiles. This preference influences hauling decisions: when an entity has a tool or profession-specific material to put away, it routes to the profession zone first if space is available. The preference is a routing priority, not a hard constraint — entities still store in generic stockpiles if the profession zone is full or inaccessible.

**Why this priority**: Material affinity creates emergent organisation (workplaces accumulate their own supplies). Without it, materials drift to generic stockpiles and entities waste time traveling across the map. P2 because the base zone system works without it, but profession affinity significantly improves simulation realism.

**Independent Test**: Can be fully tested headlessly by: creating a Bakery zone with available storage, creating a generic Stockpile zone, and verifying that a Baker entity with Flour routes to the Bakery before the Stockpile when both have space.

**Acceptance Scenarios**:

1. **Given** a Bakery zone (valid, requirements met) and a generic Stockpile zone, **When** a Baker entity needs to store Flour, **Then** the Bakery zone is preferred over the Stockpile (closer to their workplace).
2. **Given** a Bakery zone that is full (no inventory space), **When** a Baker entity needs to store Flour, **Then** the entity falls back to the generic Stockpile (affinity is preference, not hard requirement).
3. **Given** a zone with profession affinity, **When** an entity whose skills do not match that affinity needs to store materials, **Then** the entity does not prefer the profession zone over generic stockpiles (affinity is skill-derived).
4. **Given** multiple Bakery zones (e.g., in different buildings), **When** a Baker entity stores materials, **Then** the nearest reachable Bakery zone with available space is preferred.
5. **Given** a profession zone's requirements are unmet (effects inactive), **When** an entity with matching skill-derived affinity tries to route materials there, **Then** the profession zone is still used for storage even if effects are inactive (storage affinity is independent of effect activation).

---

### User Story 6 - Zone Overlap and Tile Membership (Priority: P2)

A tile can belong to at most one zone. If a player attempts to designate a tile that already belongs to another zone, the system either rejects the overlap or reassigns the tile (clearing it from its previous zone); **Open question:** which behavior applies (see FR-004). Zones can be adjacent but not overlapping. Zone membership is always unambiguous.

**Why this priority**: Ambiguous tile membership would break activity routing (which zone should grant this effect?) and storage affinity. Unambiguous membership is required for deterministic behaviour.

**Independent Test**: Can be fully tested headlessly by: creating two adjacent zones, verifying no tile is in both, attempting to extend zone A into zone B's territory, and verifying rejection or reassignment behaviour.

**Acceptance Scenarios**:

1. **Given** two adjacent zones sharing a boundary, **When** both zones are queried for tile membership, **Then** no tile appears in both zones (disjoint membership).
2. **Given** zone A already owns tile (10,5), **When** the player designates that tile as part of zone B, **Then** the system either rejects the designation with "tile already in zone A" or reassigns the tile to zone B and removes it from zone A (**Open question:** which one, see FR-004).
3. **Given** a zone, **When** queried for all tiles, **Then** results are deterministic and stable across ticks.
4. **Given** a zone split into two non-contiguous areas (by a wall being placed through it), **When** the split is detected, **Then** the system creates two zones and assigns tiles unambiguously.
5. **Given** a tile in no zone, **When** queried for zone membership, **Then** the result is null/empty (clearly undesignated).

---

### Edge Cases

- What happens if a zone's required furniture is moved to another tile that is still inside the same zone? → Furniture is still "in the zone"; requirements remain met. Zone membership is tile-based, not furniture-specific location within zone.
- What happens if a zone's required furniture is moved to a tile outside the zone? → Requirements re-evaluated; if now unmet, effects deactivate.
- What happens if zone size falls below minimum after tile removal? → Requirements re-evaluated; if size drops below minimum, effects deactivate.
- What happens if a door in a room's wall is removed entirely (not just opened)? → Room enclosure is broken; room status lost; effects deactivate.
- What happens when a zone type definition is removed from the registry while zones of that type exist? → Registries are immutable after bootstrap, so this can only arise when loading a save against different content; a zone referencing an unknown zone type is a dangling reference and a load error (spec 022).
- What happens if two zones of the same type are adjacent — do their effects stack? → Effects apply per zone independently; two Bedrooms are two separate zones, each with their own requirements evaluation.
- What happens if a zone type requires furniture by tag/category (not specific prototype)? → Any furniture entity matching the required tag counts toward the requirement.

## Requirements

### Functional Requirements

- **FR-001**: System MUST support a Zone Type Registry: an open set of zone type definitions, loadable at bootstrap from data files. Each zone type defines: `id`, `requiresRoom` (boolean), `minTiles` (integer), `furniture` (array of `{ type/tag, count }`), `skillAffinity` (optional; matched against entities' skill-derived affinity, see FR-011), `requiresJobBoard` (optional boolean, default false; when true a JobBoard entity must be present in the zone for its effects to activate, spec 017 FR-018), and `effects` (array of effect definitions).
- **FR-002**: System MUST validate zone type definitions at load time: referenced furniture types must exist in the entity prototype registry. Invalid zone types are rejected with clear errors.
- **FR-003**: System MUST allow the player to designate zones by assigning a zone type to a set of tiles. Designated tiles must form a contiguous set (contiguity from the map's adjacency graph); non-contiguous inputs create separate zones or are rejected. Designating tiles with a zone type whose `unlockTier` is above the current settlement tier MUST be rejected with `ContentLockedError` (spec 027 FR-008). **Open question:** split into separate zones or reject.
- **FR-004**: System MUST enforce that each tile belongs to at most one zone. Designating an already-owned tile either rejects or reassigns it (system logs the action). **Open question:** reject or reassign.
- **FR-005**: System MUST automatically detect Room status: a zone is a Room when every tile on its perimeter is bordered, on all non-zone sides, by a cell occupied by a wall entity, a door entity, or another wall-equivalent solid entity (walls and doors are cell-occupying entities, spec 004; there are no edge walls).
- **FR-006**: Room detection MUST re-run after any terrain modification (wall added/removed, door added/removed) affecting tiles adjacent to an existing zone.
- **FR-007**: System MUST evaluate zone requirements continuously: after any change to the zone (tile count, furniture presence, room status), requirements are re-evaluated and effects activated or deactivated accordingly.
- **FR-008**: System MUST emit events on requirement state changes: `zone.requirements.met` when a zone transitions from inactive to active, `zone.requirements.lost` when it transitions from active to inactive.
- **FR-009**: Zone effects of type "activity unlock" MUST be queryable: given a location and an activity type, the system returns whether the activity is permitted at that location (by a valid active zone).
- **FR-010**: Zone effects of type "entity modifier" MUST be applied to entities while they are within the zone tiles, and removed when they leave.
- **FR-011**: Zones with `skillAffinity` MUST be preferred as material storage destinations for entities whose skill-derived affinity matches (e.g. dominant skill or skill above a threshold, spec 020; there is no profession component). The routing order is defined by spec 018 FR-010. Affinity is a routing preference, not a hard constraint.
- **FR-012**: Zone tile membership MUST be persisted in GameState (feature 006). On save, each zone stores its tile list, type, and current requirements status.
- **FR-013**: On load, zone requirements MUST be re-evaluated from current terrain and furniture state (not trusted from save, since terrain may differ). Requirements status is derived, not stored as authoritative.
- **FR-014**: System MUST support zones being deleted by the player. On deletion, effects cease immediately and tiles are freed.
- **FR-015**: System MUST support splitting and merging of zones when tile connectivity changes. When a wall splits a zone into two disconnected areas, two zones are created. When a wall between two same-type zones is removed, the system may optionally offer to merge them (player confirmation required).
- **FR-016**: System MUST be queryable: given a tile, return its zone (or null); given a zone type, return all active zones of that type; given an entity, return the zone it is currently standing in (if any).
- **FR-017**: Requirement evaluation (FR-007) MUST expose each unmet requirement of a zone as a `ZoneRequirementGap` entry (`ZoneGapKind` enum: NotEnclosed, TooSmall, MissingFurniture, MissingJobBoard, with furniture ID and required/present counts where relevant), so spec 025 can report `ZoneRequirementsUnmet` without re-evaluating zone rules.

### Key Entities

- **Zone**: A designated area entity. Contains: zone type ID, tile membership list, Room status (boolean), current requirements status (met/unmet per requirement), and active effects. Serializable to GameState.
- **ZoneType**: A data definition in the Zone Type Registry. Declares requirements and effects for a class of zone (Bakery, Bedroom, Farm Field, etc.). Not an entity — a data record.
- **ZoneEffect**: A declared effect within a ZoneType definition. Two categories: (1) ActivityUnlock — permits a specific activity type at this zone location; (2) EntityModifier — applies a named modifier (mood, speed, skill bonus) to entities within zone tiles.
- **ZoneRequirement**: A declared requirement within a ZoneType definition. Types: MinSize (minimum tile count), FurniturePresent (type/tag + count within zone), RequiresRoom (enclosure required).
- **ZoneTypeRegistry**: Global catalog of all zone type definitions. Loaded at bootstrap. Immutable during gameplay. Queryable by ID, profession affinity, or required activity type.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Zone designation (paint N tiles as a given type) completes and zone entity is queryable within 1 game tick of the designation action.
- **SC-002**: Room detection runs after terrain modification and correctly classifies zones as Room or open Zone within 1 tick of the change (no manual re-trigger required).
- **SC-003**: Zone requirements are re-evaluated after any relevant change (furniture moved, tile removed, room status changed); active/inactive state is always consistent with current terrain and furniture state.
- **SC-004**: Zone effect queries (is activity X permitted at location Y?) return correctly for 100+ active zones in under 5ms.
- **SC-005**: Adding a new zone type via data file requires no code change; new zone type is functional immediately after bootstrap with new data.
- **SC-006**: Profession affinity routing directs entities to profession zones before generic stockpiles in 90%+ of test scenarios where a valid profession zone is available and accessible.
- **SC-007**: Zone state (tile membership, type, active effects) is fully preserved through save/load cycle; requirements are re-derived on load rather than trusted from save.
- **SC-008**: 200+ zones on a single map with continuous requirements evaluation do not cause performance degradation (all zone re-evaluations complete in <20ms per tick total).

## Assumptions

- **Cell-based designation**: Zones are collections of discrete map cells ("tiles" in this spec): square tiles or voronoi polygons (spec 004). Contiguity, perimeter and room enclosure are derived from the map's adjacency graph (4-connected on square maps, Delaunay dual on voronoi maps), so zones work identically on both grid types.
- **Room detection uses terrain API (feature 004)**: Enclosure detection queries the terrain system for wall/door entities occupying the cells bordering the zone. This spec does not implement terrain; it queries it.
- **Furniture presence is entity-based**: Furniture requirements are checked by querying for entities of a matching type/tag within the zone's tile set. Furniture entities placed on zone tiles count toward requirements.
- **One zone type per zone**: Each zone has exactly one zone type (e.g., a zone is either a Bakery or a Bedroom, not both). A single room cannot simultaneously be two different zone types.
- **Zone effects are immediately evaluated**: There is no warm-up or cooldown period for effects activating/deactivating. When requirements are met, effects are active on the next tick.
- **Open doors do not break enclosure**: Door entities always count as enclosing perimeter tiles for room detection, regardless of open/closed state. Only a missing door entity (gap in the wall with no door placed) breaks enclosure. This prevents room bonuses from flickering during normal use.
- **Profession affinity applies to hauling decisions**: The affinity system influences where entities choose to haul materials, not where they are forced to store them. Hauling uses the task/pathfinding system (features 003, 012); affinity is a priority weight, not a route override.
- **Zone registry is static during gameplay**: Zone type definitions are loaded at bootstrap and the registry is immutable afterwards (consistent with Material and Recipe registries). Duplicate IDs and dangling references are load errors.
- **Hybrid zone effect schema**: Activity unlock effects use named references (`activityId`) that must match IDs registered by the production system (feature 014) or other activity-providing systems. Entity modifier effects use declarative numeric values (`modifier` name + `value`) interpreted by the AI/needs system (feature 013). The zone system delivers the modifier; the receiving system defines its gameplay impact. New effect _types_ beyond these two categories require engine changes; new zone content using existing effect types requires only data.
