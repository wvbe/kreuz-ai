# Feature Specification: React Game Application

**Created**: 2026-05-04
**Input**: User description: "I want to specify the React application for this game."

## Clarifications

### Session 2026-05-04

- Q: Which camera projection should the map renderer use? → A: Option A — Orthographic isometric camera (true isometric projection). Rationale: predictable tile-aligned raycasts, consistent visual scale, and no perspective distortion for low-poly cell-shared view.

- Q: What language style should user-facing text use? → A: Option B — Mixed: modern English for core UI controls and system messages; pseudo-old English (thematic, stylized) for flavor text, lore, and non-critical immersion elements. Rationale: preserves usability and clarity while delivering historical atmosphere where it matters.

## User Scenarios & Testing

### User Story 1 — Player explores the map and inspects entities (Priority: P1)

The player opens the game and sees a large isometric 3D map of the colony. They can rotate, pan and zoom the camera freely. They click any visible entity on the map — a colonist, an animal, a piece of furniture — and a panel opens showing the entity's current state: what it is doing, its needs, skills, inventory, faction membership and location. From the inspection panel the player can navigate to any related record (e.g. the job it is performing, the zone it is in, the recipe it is executing).

**Why this priority**: The map view and click-to-inspect flow is the core feedback loop of the game. Everything else builds on top of being able to see and understand what is happening.

**Independent Test**: Load a saved game with 50 entities, click any entity on the map, and verify the correct inspection panel opens with accurate live data. Verify that at least one link in the panel navigates to a related record.

**Acceptance Scenarios**:

1. **Given** the game is loaded, **When** the player opens the application, **Then** the ThreeJS map renders within 3 seconds and all live entities are visible.
2. **Given** a rendered map, **When** the player clicks an entity, **Then** the raycast resolves to the correct entity and its inspection panel opens.
3. **Given** an open inspection panel for a colonist, **When** the player clicks the colonist's current job link, **Then** the view navigates to the job detail without a full page reload.
4. **Given** a live simulation, **When** an entity's state changes (need drops, job completes), **Then** the inspection panel updates in real time without the player re-clicking.

---

### User Story 2 — Player issues government commands (Priority: P1)

The player acts as the colony's governing authority. They can open a command interface from anywhere in the UI to issue directives: pause or resume a building's job board, set trade policy (**Open question:** no spec defines player trade policy or trade directives yet — spec 019 has none and the policy system is listed on docs/ROADMAP.md; the closest existing player action is proposing a Trade Agreement via diplomacy, spec 021), open diplomatic channels, designate a zone, or dispatch a town crier with new instructions. Commands that take physical time to execute (e.g. dispatching a town crier) show a pending state until completed.

**Why this priority**: Without the ability to issue commands, the game is a passive observer. Government commands are the primary player agency.

**Independent Test**: Pause the bakery's job board, verify no new jobs are claimed from it, then resume it and verify jobs are claimed again within one game tick.

**Acceptance Scenarios**:

1. **Given** a running bakery, **When** the player pauses its job board, **Then** no new entities claim jobs from that board until resumed.
2. **Given** a town-square job board managed by the player, **When** the player issues a command update, **Then** a town crier entity is dispatched, the board shows "pending update", and the board updates when the crier arrives.
3. **Given** a pending town crier dispatch, **When** the player opens the command panel, **Then** the pending command is listed with an estimated arrival time.
4. **Given** a faction relationship, **When** the player issues a diplomatic directive, **Then** the directive is shown as pending until the Envoy physically reaches the faction leader (spec 021), and the faction's standing towards the player changes once it is delivered.

---

### User Story 3 — Player places furniture (Priority: P2)

The player opens the build menu, selects a furniture item from the catalogue, and places it on a valid map tile. The placement preview snaps to valid tiles, highlights invalid placements in red, and confirms on click. Confirming creates a ConstructionJob (spec 016) shown on the map as a pending build site (blueprint); the furniture becomes a live entity on the map when construction completes.

**Why this priority**: Furniture placement is the primary method of expanding production capacity. Without it, the colony is static.

**Independent Test**: Place a forge on a stone-floor tile inside a smithy zone. Verify a pending build site appears, and once construction completes the forge appears on the map as a live entity and the smithy's job board begins posting smithing jobs.

**Acceptance Scenarios**:

1. **Given** the build menu is open and a furniture type selected, **When** the player hovers over the map, **Then** a placement ghost follows the cursor and snaps to whole tiles.
2. **Given** a tile that does not satisfy the furniture's placement constraints, **When** the player hovers over it, **Then** the ghost turns red and the player cannot confirm placement.
3. **Given** a valid tile, **When** the player clicks to confirm, **Then** a ConstructionJob (spec 016) is created and shown as a pending build site (blueprint), the furniture appears as a map entity when construction completes, and the build menu remains open for chaining placements.

---

### User Story 4 — Player creates zones and places walls and doors (Priority: P2)

The player enters zone-drawing mode, paints a region of tiles to define a zone, assigns a zone type (e.g. bakery, dormitory), and optionally surrounds it with walls and doors. The zone becomes active once minimum furniture requirements are met. Walls and doors are placed tile-by-tile or via a rectangle tool.

**Why this priority**: Zones are the spatial foundation of the production and social systems. Most other building interactions depend on zones existing.

**Independent Test**: Draw a 4×4 zone, assign it as a "Warehouse", place walls around the perimeter, add a door on one side. Verify the zone entity is created, shows "incomplete" until minimum storage furniture is placed, then becomes active.

**Acceptance Scenarios**:

1. **Given** zone-drawing mode is active, **When** the player paints tiles, **Then** the painted region is highlighted and the zone type picker appears.
2. **Given** a named zone, **When** the minimum required furniture is placed inside it, **Then** the zone transitions to active and its job board starts posting.
3. **Given** a wall-placement tool selected, **When** the player drags across tiles, **Then** a ConstructionJob (spec 016) is created for every traversed tile and shown as a pending build site; each wall appears when its construction completes (each wall entity occupies and is drawn on a whole cell; there are no edge walls).
4. **Given** a placed door, **When** an entity's pathfinding routes through it, **Then** the entity opens the door and passes through without being blocked.

---

### User Story 5 — Player browses the content catalogue (Priority: P2)

The player can open a content browser from any point in the UI to explore all open-ended sets: materials, recipes, skills, traits, terrain types, factions, entities, furniture, zone types, jobs, needs, behavior trees, and name lists. Each entry is searchable and filterable. Records are interlinked: a recipe entry shows its input materials as links; a material entry shows which recipes consume it.

**Why this priority**: With 300+ content entries across 13 registries, discoverability is essential for both new players and designers tuning content.

**Independent Test**: Open the recipe browser, search for "bread", click the result, verify the recipe card shows linked input materials, and clicking a material navigates to its material record.

**Acceptance Scenarios**:

1. **Given** the content browser is open, **When** the player types a search term, **Then** results filter live across all registries.
2. **Given** a recipe record, **When** the player clicks an input material link, **Then** they navigate to that material's record without losing browser scroll state.
3. **Given** a material record, **When** the player opens it, **Then** it lists all recipes that use the material as an input, as links.

---

### User Story 6 — Player inspects inventories (Priority: P3)

Any inventory-enabled entity (colonist, furniture with storage) shows its current inventory when inspected. Stockpile and other zones have no inventory of their own (spec 018); inspecting one shows the aggregated inventories of the storage furniture within it. The player can see what items are held, quantities, and available capacity. From the inventory view the player can navigate to the item's material record.

**Why this priority**: Inventory visibility is needed to understand resource flow, but it is a read-only view that builds on top of entity inspection (US1).

**Independent Test**: Click a Warehouse zone on the map, open its inventory tab, verify it lists all materials stored in the furniture inside the zone (aggregated) with correct quantities matching the simulation state.

**Acceptance Scenarios**:

1. **Given** an open inspection panel with an inventory tab, **When** the player opens the tab, **Then** all held items are listed with current quantity and capacity.
2. **Given** a live simulation, **When** a hauler deposits an item into a stockpile, **Then** the stockpile's inventory panel updates within one render frame.

---

### Edge Cases

- What happens when the player clicks empty terrain? → A terrain inspection panel opens showing the terrain type, its traversability, buildability, and any harvestable resources.
- What happens when multiple entities occupy the same tile? → The click resolves to the topmost entity; a small entity list appears letting the player cycle through all occupants.
- What happens when the player navigates to a sub-map (cave, cellar)? → The camera transitions to the sub-map with a visible breadcrumb showing the parent map; a back button returns to the parent.
- What if the player places furniture outside a valid zone? → The furniture is placed but shown with the spec 025 `ZoneInactive` badge; relevant zone-dependent jobs will not post until the zone requirement is met.
- What happens in very large maps (voronoi with 1000+ tiles)? → Only entities and tiles within camera frustum are rendered; off-screen entities are culled.

## Requirements

### Functional Requirements

#### Map View

- **FR-001**: The application MUST render the game map using ThreeJS with an orthographic isometric camera (true isometric projection) that supports rotate, zoom, and pan via mouse and touch input. The orthographic projection avoids perspective distortion and preserves tile-aligned world coordinates for deterministic raycasting and consistent visual scale.
- **FR-002**: The map renderer MUST support both square-tile mode and voronoi-tile mode. The default game map MUST use voronoi mode.
- **FR-003**: Each terrain tile MUST be rendered with a color or texture matching its terrain type. Tiles outside the camera frustum MUST be culled to maintain performance with large maps.
- **FR-004**: Live entities (colonists, animals, furniture, stockpiles) MUST be represented by low-poly 3D models, geometric shapes, or symbolic markers on the map. Entity representations MUST visually distinguish entity type (humanoid, livestock, wild animal, furniture). Dwelling zones (spec 029) MUST be drawn with the model of their current level (FR-042).
- **FR-005**: The player MUST be able to click any visible map entity or tile and receive a raycasted selection resolved to the correct game object.
- **FR-006**: Sub-maps (caves, cellars) MUST be navigable from the main map. A breadcrumb navigation element MUST show the current map context and allow returning to the parent map.

#### Entity Inspection

- **FR-007**: Clicking a selected entity or tile MUST open an inspection panel showing all relevant live state: current activity, needs (with values), skills (with levels), inventory (if applicable), faction memberships, current zone, and active behavior tree node. The first line MUST be the one-line primary status reason (spec 025 FR-016; see FR-025). A citizen's panel MUST show its styled name, title and offices (spec 028; see FR-038); a dwelling zone's panel MUST show the housing details of FR-043.
- **FR-008**: Every entity reference in an inspection panel MUST be a navigable link. Clicking a linked entity, job, zone, recipe, or material MUST navigate to that record's detail view without a full page reload.
- **FR-009**: Inspection panels MUST reflect live simulation state and update in real time as the simulation ticks; the player MUST NOT need to re-click to see updated values.

#### Government Commands

- **FR-010**: The application MUST provide a command interface from which the player can: pause or resume any job board, modify trade priorities (**Open question:** not yet defined by any spec — see User Story 2), issue diplomatic directives to factions, post custom jobs to player-managed job boards, create, edit, pause and delete standing orders, and appoint or dismiss the Steward (spec 026; see FR-029–FR-031).
- **FR-011**: Commands that require physical in-game execution (e.g. dispatching a town crier to update a job board) MUST show a visible pending state with the dispatched entity's progress until the command takes effect.
- **FR-012**: The player MUST be able to cancel a pending command before it takes effect.

#### Build Tools

- **FR-013**: The application MUST provide a build menu listing all available furniture types from the furniture registry. Selecting a type MUST enter placement mode.
- **FR-014**: In placement mode, a preview ghost MUST follow the cursor, snapping to whole tiles. Tiles that violate placement constraints MUST be highlighted in red. Valid tiles MUST allow confirmation by click.
- **FR-015**: The application MUST provide zone-drawing tools: paint a tile region, assign a zone type from the zone-type registry, and place walls and doors tile-by-tile or via drag-rectangle.
- **FR-016**: Placed walls MUST block entity pathfinding. Walls and doors are entities occupying a cell and MUST be rendered on that cell (not on tile edges). Placed doors MUST be traversable by entities and MUST animate open/close as entities pass through.

#### Content Browser

- **FR-017**: The application MUST include a content browser accessible from any screen, covering all 13 content registries of spec 022 FR-018 (materials, skills, needs, terrain, traits, furniture, zones, factions, jobs, recipes, behavior trees, entity prototypes, name lists). The fixed-key configuration tables of spec 022 FR-018 (dwelling levels, settlement tiers, difficulty modes, content constants, moment and name-format templates) are not registries; the browser MAY show them as read-only reference pages.
- **FR-018**: The content browser MUST support live text search that filters results across all registries simultaneously.
- **FR-019**: All cross-references between registry entries MUST be navigable links within the content browser (e.g., a recipe links to its input materials; a material links to all recipes that consume it).

#### Inventory Inspection

- **FR-020**: Any inventory-enabled entity (colonist backpack, furniture with storage) MUST expose an inventory tab in its inspection panel showing items, quantities, and capacity. Stockpile and other zone inspection panels MUST show the aggregated inventories of the storage furniture within the zone (zones have no inventory of their own, spec 018).
- **FR-021**: The inventory view MUST update in real time as items are deposited or withdrawn during the simulation.

#### General Application

- **FR-022**: The application MUST be a single-page React application. Navigation between views MUST NOT require a full page reload.
- **FR-023**: The application MUST load and display a playable game state within 5 seconds on a modern desktop browser.
- **FR-024**: The application MUST provide save and load UI. The player MUST be able to save the current game state to a file and load a previously saved file to resume play. Auto-save on a configurable interval SHOULD be supported. The save format is defined in spec 006-save-format.

#### Status & Flow (spec 025)

- **FR-025**: The map MUST draw a reason badge, chosen by the primary reason kind, over every settled Idle or Blocked subject that is visible (spec 025 FR-016). Each `BlockedReasonKind` maps to one modern-English line template (spec 025 FR-015). The inspection panel's first line (FR-007) MUST offer a "why?" control that shows `explain()` when the primary reason has a `causeRef`.
- **FR-026**: The application MUST provide an Idle & Blocked list of all settled non-Active subjects, grouped by primary reason kind and sorted by `sinceTick` within each group; each entry centres the camera on its subject (spec 025 FR-017).
- **FR-027**: The application MUST provide a Flow view with one row per material with ledger activity: produced/day, consumed/day, net/day, stock, days of supply, trend, and producers with status badges, sorted by largest deficit first; rows expand to the `FlowSource` breakdown and material names link to the content browser (spec 025 FR-018).
- **FR-028**: The application MAY show grouped, throttled toasts for `status.blocked` events, which the player can turn off per reason kind (spec 025 FR-019). Toast settings are renderer preferences, not game state.

#### Standing Orders (spec 026)

- **FR-029**: The application MUST provide a standing-orders panel listing each order with counted stock, target, restock threshold, in-flight runs by status (pending-add, open, claimed), state and its spec 025 badge, from which the player can create, edit, pause, resume and delete orders and request a Steward review (spec 026 FR-005).
- **FR-030**: Material records, inventory rows and recipe cards MUST offer a "Keep in stock…" action that opens a prefilled standing-order form, so an order can be created in at most 3 interactions (spec 026 SC-008).
- **FR-031**: An eligible citizen's inspection panel MUST offer "Appoint as Steward"; the current Steward's panel MUST offer "Dismiss". The player MUST be able to choose the Steward board.
- **FR-032**: Steward postings MUST appear in the FR-011 pending list with their delivery route: Town Crier, Notice Post or the next bell ring (spec 026 FR-021–FR-023).
- **FR-033**: Notice Posts and Bell Towers MUST have visible models, and a Bell Tower MUST show a bell-ring indicator on `bell-tower.rang`.

#### Settlement Progress & Difficulty (spec 027)

- **FR-034**: The application MUST show the current settlement tier and a panel with the next tier's requirements and their live progress (`current` / `target`, met or not) from `getSettlementProgress()` (spec 027 FR-006).
- **FR-035**: The build menu, zone-type picker, production dialogs and standing-order form MUST show locked content greyed out with an "Unlocks at <Tier>" badge and MUST NOT let the player select it (spec 027 FR-008). Locked content stays browsable in the content browser.
- **FR-036**: `settlement.tier.reached` and `settlement.milestone.reached` MUST produce notifications, written in the flavour style of the language clarification.
- **FR-037**: The new-game screen MUST offer the difficulties Peaceful, Steady (default) and Harsh, each with a one-line description (spec 027 FR-013).

#### Citizen Identity (spec 028)

- **FR-038**: Wherever a citizen is named (map hover label, inspection panel header, job and trade records), the application MUST show the styled name; the inspection panel MUST show the title rank and offices, including the Steward office (spec 026) (spec 028 FR-022).
- **FR-039**: A citizen's inspection panel MUST have a "Journal" tab rendering its journal with the shared formatting helper (spec 028 FR-016, FR-022).
- **FR-040**: Each Major `chronicle.moment.recorded` MUST appear as a small, non-blocking notification linking to the citizen (or to the chronicle for milestones). More than `toastBurstLimit` (renderer setting, default 3) within one game hour MUST fold into a single "N more tidings" notification linking to the chronicle. Minor moments are not notified (spec 028 FR-023).
- **FR-041**: The application MUST provide a chronicle view, newest first, filterable by citizen and kind, linking to citizens that still exist (spec 028 FR-024).

#### Housing (spec 029)

- **FR-042**: Each `DwellingLevel` MUST have a distinct low-poly model: Hovel (wattle-and-daub, thatch), Cottage (whitewashed daub, chimney), Timber-Framed House (exposed timber framing), Burgher House (stone ground floor, timber upper storey, tiled roof). The model MUST swap on `housing.dwelling.upgraded` and `housing.dwelling.downgraded`.
- **FR-043**: A dwelling's inspection panel MUST show its level, residents (as links), capacity and rent, and a checklist of the requirements of its current and next level with current and required values and streak progress against the grace days (spec 029 FR-019).
- **FR-044**: Dwellings at risk of downgrade (`housing.dwelling.at-risk`, until their downgrade streak resets or the level changes) MUST be flagged on the map.

### Key Entities

- **Map tile**: A single terrain cell, either square or voronoi-shaped, with terrain type, occupants, and optional zone membership.
- **Live entity**: Any game object present on the map at runtime (colonist, animal, furniture, stockpile, job board, door, wall).
- **Inspection panel**: A side panel or overlay showing the full live state of a selected entity or tile.
- **Content record**: A read-only entry from any of the 13 content registries, displayed in the content browser.
- **Government command**: A player-issued directive that modifies simulation behaviour, potentially dispatching an in-world actor to carry it out.

## Success Criteria

### Measurable Outcomes

- **SC-001**: The map renders 50 live entities at a stable frame rate on a mid-range desktop browser without dropped frames during normal camera movement.
- **SC-002**: A player unfamiliar with the codebase can navigate from a colonist on the map to the recipe it is executing within 3 clicks.
- **SC-003**: Every live entity state change (need decay, job completion, item transfer) is reflected in open inspection panels within one simulation tick, with no manual refresh required.
- **SC-004**: A player can place furniture, draw a zone, and issue a government command within the same session without navigating away from the map view.
- **SC-005**: The content browser returns search results within 200ms of the last keystroke for any query across all 13 registries.
- **SC-006**: The application loads to a playable state from cold start in under 5 seconds on a modern desktop with a broadband connection.

## Assumptions

- React and ThreeJS are the mandated front-end technologies. No alternative rendering or framework is in scope.
- The game simulation runs in the same browser context as the React application (no server-side simulation). The engine is the headless TypeScript engine built in prior specs.
- Save/load UI is in scope for this feature. The save format is defined by spec 006-save-format; this spec covers the UI surface (save button, load file picker, auto-save interval setting).
- The default starting map is a voronoi terrain map large enough to host approximately 50 live entities. Sub-maps (caves, cellars) are smaller square-tile maps linked to the main map.
- The isometric camera is fixed to an isometric projection angle; free perspective is not required.
- Mobile support is out of scope for the first version. The application targets desktop browsers only.
- The TypeScript code style conventions defined in spec 023 apply to all code written for this feature.
