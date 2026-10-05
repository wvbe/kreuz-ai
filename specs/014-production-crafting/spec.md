# Feature Specification: Production & Crafting System

**Created**: 2026-05-02
**Input**: User description: "Help me specify a production/crafting system. I want this to be based on materials and recipes -- which are both open-ended sets. Most recipes will have certain restrictions, such as needing a specific furniture or even needing a specific room. The act of producing/crafting will then be that an entity collects the required materials in the inventory of a suitable entity (either the one performing work, or the furniture where work is being performed at) if they have not been collected yet, then spends some busy time 'crafting it'. This may repeat multiple times if a process has intermediate materials."

## User Scenarios & Testing

### User Story 1 - Execute a Simple Recipe (Priority: P1)

An entity with the appropriate capability selects a recipe, gathers required input materials into the designated work inventory (either the crafter's own inventory or the workstation furniture's inventory), and then spends a defined number of game ticks "crafting." Upon completion, the input materials are consumed and output materials are produced. The entire process is deterministic and driven by game ticks.

**Why this priority**: This is the irreducible core of production. Without a working recipe execution flow, no crafting happens. Every other story extends this.

**Independent Test**: Can be fully tested headlessly by: defining a recipe (e.g., 2 Wood → 4 Plank, 24 ticks, requires Sawmill), placing an entity near a Sawmill with 2 Wood in its inventory, advancing game time, and verifying: materials are consumed, output appears in designated inventory, and the correct number of ticks elapsed.

**Acceptance Scenarios**:

1. **Given** a recipe "2 Wood → 4 Plank" requiring 24 ticks at a Sawmill, **When** an entity with 2 Wood begins crafting at a Sawmill, **Then** after 24 ticks the 2 Wood are consumed and 4 Plank are produced.
2. **Given** a recipe requiring materials, **When** the crafter does not have sufficient materials, **Then** crafting cannot begin; the system reports which materials are missing and in what quantity (spec 025 `MissingInput`).
3. **Given** a recipe requiring a Sawmill, **When** no Sawmill is reachable by the entity, **Then** crafting cannot begin; the system reports the missing workstation requirement (spec 025 `MissingWorkstation`).
4. **Given** crafting in progress, **When** game time advances tick-by-tick, **Then** progress is tracked as an integer (ticks elapsed / ticks required) and observable.
5. **Given** crafting completes, **When** output materials are produced, **Then** an event `production.crafting.completed` is emitted with recipe ID, crafter entity ID, and output details.

---

### User Story 2 - Material Gathering Phase (Priority: P1)

Before crafting begins, the entity must ensure all required input materials are present in the work inventory (the inventory where the recipe executes — either the crafter's or the workstation's). If materials are not already present, the entity retrieves them: traveling to storage locations, picking up materials, and depositing them in the work inventory. This gathering phase uses the entity's task queue and pathfinding.

**Why this priority**: Inseparable from recipe execution. Without gathering, recipes only work when materials are magically pre-placed. The gather → craft loop is the actual gameplay.

**Independent Test**: Can be fully tested headlessly by: defining a recipe requiring 5 Iron at a Forge, placing Iron in a stockpile across the map, verifying the entity pathfinds to the stockpile, retrieves Iron, carries it to the Forge, and deposits it before starting the craft timer.

**Acceptance Scenarios**:

1. **Given** a recipe requiring 5 Iron at a Forge, and the Forge inventory has 0 Iron, **When** an entity is assigned this recipe, **Then** the entity first travels to a source containing Iron, retrieves 5 Iron, travels to the Forge, and deposits it into the Forge's inventory.
2. **Given** the Forge already contains 3 Iron and the recipe needs 5, **When** the entity evaluates what to gather, **Then** only 2 additional Iron are fetched (partial fulfillment awareness).
3. **Given** multiple material types needed (5 Iron + 2 Coal), **When** the entity gathers, **Then** the entity may make multiple trips or gather from multiple sources, collecting all required inputs before starting craft.
4. **Given** a required material is not available anywhere in the game world, **When** the entity attempts to gather, **Then** the task fails with a clear reason ("no source of Iron available", spec 025 `MissingInput`) and the entity can be reassigned.
5. **Given** the entity's own carrying capacity cannot hold all required materials at once, **When** gathering, **Then** the entity makes multiple trips (carrying capacity from inventory spec 005 is respected).

---

### User Story 3 - Multi-Step Recipes with Intermediate Materials (Priority: P1)

Some production chains require multiple sequential crafting steps where the output of one recipe is the input of the next (e.g., Ore → Ingot → Sword). The system supports recipe chains where an entity (or multiple entities) executes recipes in sequence, with intermediate outputs feeding into subsequent recipe inputs. Each step is a complete gather → craft cycle.

**Why this priority**: Multi-step production chains are the backbone of colony sim economies. Without this, the game has only trivial single-step conversions. Critical for economic depth.

**Independent Test**: Can be fully tested headlessly by: defining a 3-step chain (Ore → Ingot at Smelter, Ingot + Leather → Sword at Anvil), verifying an entity executes step 1, produces the intermediate, then executes step 2 using the intermediate as input.

**Acceptance Scenarios**:

1. **Given** recipe chain: "2 Ore → 1 Ingot" (Smelter, 36 ticks) then "3 Ingot + 1 Leather → 1 Sword" (Anvil, 60 ticks), **When** an entity is assigned to produce a Sword, **Then** the entity first produces 3 Ingots (3 separate smelting cycles), then produces the Sword.
2. **Given** intermediate materials already exist in storage (e.g., Ingots available), **When** the entity evaluates the chain, **Then** it skips completed steps and begins at the first step whose output is not yet available.
3. **Given** a multi-step recipe where step 2 requires a different workstation than step 1, **When** the entity transitions between steps, **Then** the entity travels to the appropriate workstation for each step.
4. **Given** a multi-step recipe in progress, **When** the game is saved and loaded, **Then** the entity resumes at the correct step with correct progress (no repeated or lost work).
5. **Given** two separate entities capable of different steps, **When** one produces intermediates and another consumes them, **Then** both can operate concurrently on different steps of the same chain (pipeline parallelism).

---

### User Story 4 - Recipe Restrictions: Workstation and Room Requirements (Priority: P1)

Recipes declare restrictions that must be met for crafting to proceed. Restrictions include: requiring a specific workstation type (furniture entity with a matching tag), requiring the workstation to be located in a specific room type, or requiring environmental conditions. The system validates all restrictions before allowing crafting to begin.

**Why this priority**: Restrictions give meaning to base-building — players build specific rooms with specific furniture to enable recipes. Without restrictions, crafting is location-independent and building has no purpose.

**Independent Test**: Can be fully tested headlessly by: defining a recipe that requires both a Forge (workstation) and a Smithy (room type), placing the Forge in various rooms, and verifying crafting only proceeds when the Forge is in a Smithy.

**Acceptance Scenarios**:

1. **Given** a recipe requiring workstation "Forge", **When** an entity attempts to craft at a Forge, **Then** crafting proceeds; attempting at a Sawmill or with no workstation fails with "requires Forge" error (spec 025 `MissingWorkstation`).
2. **Given** a recipe requiring room type "Smithy", **When** a Forge is placed in a room designated as Smithy, **Then** crafting proceeds; the same Forge in an undesignated room fails with "requires Smithy room" error (spec 025 `MissingRoom`).
3. **Given** a recipe with no workstation requirement (hand-crafting), **When** an entity attempts to craft anywhere, **Then** crafting proceeds using the entity's own inventory as the work inventory.
4. **Given** a recipe requiring workstation quality level (e.g., "Forge" quality ≥ 2), **When** evaluated against a low-quality Forge, **Then** crafting fails with "workstation quality insufficient" error.
5. **Given** multiple valid workstations for a recipe, **When** the entity selects one, **Then** the nearest reachable valid workstation is chosen (pathfinding integration).

---

### User Story 5 - Recipe and Material Registries as Open Sets (Priority: P1)

Materials and recipes are defined as data (not code). New materials and recipes can be added without modifying core engine logic. Materials define properties (stack limit, weight, perishability, value, categories). Recipes define inputs, outputs, duration, restrictions, and optional skill requirements. Both registries are loaded at bootstrap (including any content packs) and are immutable afterwards.

**Why this priority**: The open-set nature is what enables game content to scale. Adding a new recipe or material should be a data operation, not a code change. This is the extensibility foundation.

**Independent Test**: Can be fully tested by: loading a material registry with 50+ materials, loading a recipe registry with 30+ recipes, verifying all recipes can reference materials by ID, and verifying that adding new materials/recipes requires only data changes.

**Acceptance Scenarios**:

1. **Given** a material definition `{ id: "iron_ingot", stackLimit: 20, weight: 8, categories: ["metal", "refined"] }`, **When** registered, **Then** the material is available for recipe inputs/outputs and inventory operations.
2. **Given** a recipe definition `{ id: "smelt_iron", inputs: [{ materialId: "iron_ore", quantity: 2 }], outputs: [{ materialId: "iron_ingot", quantity: 1 }], duration: 36, restrictions: { workstation: "smelter" } }`, **When** registered, **Then** entities can execute this recipe at a smelter.
3. **Given** a recipe referencing a material ID that doesn't exist, **When** recipe is loaded, **Then** validation fails with a clear error at load time (not at craft time).
4. **Given** 100+ materials and 50+ recipes loaded, **When** an entity queries available recipes for a workstation, **Then** results are returned in under 5ms.

---

### User Story 6 - Crafting Time, Busy State, and Interruption (Priority: P1)

While crafting, the entity enters a "busy" state for the recipe's defined duration (in game ticks). During this time the entity is occupied and cannot perform other tasks. The crafting progress is deterministic and advances exactly one tick per game tick. When crafting is interrupted (by higher-priority tasks, entity damage, workstation destruction, or player override), all locked input materials are returned to the work inventory — no materials are lost from interruption.

**Why this priority**: Busy time creates meaningful time costs that drive player decisions (which recipes are worth the time). Essential for economic balance.

**Independent Test**: Can be fully tested headlessly by: starting a 30-tick recipe, advancing 15 ticks, verifying entity is busy, advancing 15 more ticks, verifying entity completes and exits busy state.

**Acceptance Scenarios**:

1. **Given** a recipe with duration 30 ticks, **When** crafting begins, **Then** the entity is marked "busy" and cannot accept new tasks for 30 ticks.
2. **Given** an entity mid-craft (15/30 ticks), **When** queried, **Then** the system reports progress as 15/30 (integer ticks elapsed vs. total).
3. **Given** a crafting entity, **When** tick advances, **Then** crafting progress increments by exactly 1 tick (deterministic).
4. **Given** crafting in progress, **When** the game is saved, **Then** progress (ticks elapsed) is serialized and resumed identically on load.
5. **Given** a busy entity, **When** a higher-priority task interrupts, **Then** crafting is cancelled, the entity exits busy state, and all locked input materials are returned to the work inventory (no material loss on interruption).

---

### User Story 7 - Skill Influence on Crafting (Priority: P2)

Entities may have skill levels relevant to crafting (e.g., Smithing, Carpentry, Cooking). Skills can affect: whether an entity is allowed to attempt a recipe (minimum skill requirement), the duration of crafting (higher skill = faster), and the quality or quantity of output. Skill improvement happens through successful crafting (learning by doing).

**Why this priority**: Skills differentiate entities and create specialization pressure. P2 because basic crafting works without skills, but skills add economic depth.

**Independent Test**: Can be fully tested by: defining a recipe with skill requirement "Smithing ≥ 3", verifying an entity with skill 2 cannot craft it, an entity with skill 3 can, and verifying skill increases after successful crafting.

**Acceptance Scenarios**:

1. **Given** a recipe requiring "Smithing ≥ 3", **When** an entity with Smithing skill 2 attempts it, **Then** crafting is blocked with "insufficient skill" reason (spec 025 `NoQualifiedWorker`).
2. **Given** an entity with Smithing skill 5 and a recipe base duration of 30 ticks, **When** the entity crafts, **Then** duration is reduced by skill bonus (e.g., 30 × (1 - skillBonus)).
3. **Given** an entity completing a recipe successfully, **When** crafting finishes, **Then** the relevant skill gains experience (amount from the skill registry's `baseGrowthPerCompletion`, spec 020 — not defined per recipe).
4. **Given** an entity with high skill, **When** crafting completes, **Then** output quality may be higher (if quality is defined for that material).
5. **Given** a recipe with no skill requirement, **When** any entity attempts it, **Then** crafting proceeds regardless of skill levels.

---

### User Story 8 - Production Orders and Repeat Crafting (Priority: P2)

Players can issue production orders: "craft 10 Swords." Settlement-level "keep N in stock" orders (e.g. "maintain 5 Bread in stockpile") are specified by spec 026 (Standing Orders & Steward). An entity assigned to a workstation with a production order will repeatedly execute the recipe until the order is fulfilled. Orders can be cancelled, paused, or adjusted. This creates standing work assignments without micromanagement.

**Why this priority**: Standing orders are core colony sim UX. Without them, players must manually assign every craft. P2 because individual recipe execution (P1) works without orders, but orders make the game playable.

**Independent Test**: Can be fully tested by: issuing a "craft 5 Swords" order at an Anvil, verifying an entity executes the recipe 5 times (including gathering for each), then stops.

**Acceptance Scenarios**:

1. **Given** a production order "craft 5 Planks" at a Sawmill, **When** an entity is assigned, **Then** the entity repeats the Plank recipe until 5 Planks have been produced.
2. **Given** the player wants 10 Bread kept in stock ("maintain 10 Bread"), **When** stock falls to the restock threshold (spec 026 FR-001, FR-003), **Then** more Bread is crafted until stock is back at 10. Maintain-N orders: see spec 026 (standing orders posted by the Steward); they are not workstation production orders.
3. **Given** a production order in progress, **When** the player cancels the order, **Then** the current craft completes (not interrupted) but no further cycles begin.
4. **Given** a production order, **When** input materials run out, **Then** the entity waits (idle at workstation) until materials become available, then resumes.
5. **Given** multiple production orders at the same workstation, **When** evaluated, **Then** orders are processed in priority order (player-assigned priority).

---

### User Story 9 - Byproducts and Recipe Variants (Priority: P3)

Some recipes produce byproducts in addition to the primary output (e.g., smelting produces slag alongside ingots). Some recipes have variants based on input quality or type (e.g., different ore types produce different ingot types using the same Smelter recipe pattern). Byproducts and variants are defined in recipe data.

**Why this priority**: Adds economic complexity and realism. P3 because core production works with simple input→output recipes; byproducts and variants are content depth.

**Independent Test**: Can be fully tested by: defining a recipe with a byproduct, executing it, and verifying both primary output and byproduct appear in the output inventory.

**Acceptance Scenarios**:

1. **Given** a recipe "2 Iron Ore → 1 Iron Ingot + 1 Slag" at a Smelter, **When** crafting completes, **Then** both Iron Ingot and Slag are produced and placed in output inventory.
2. **Given** a recipe variant system where different ores produce different ingots, **When** "2 Copper Ore" is used in a generic "Smelt" recipe, **Then** the output is "1 Copper Ingot" (input type determines output type).
3. **Given** a byproduct inventory is full, **When** crafting would produce a byproduct, **Then** craft completion blocks — all outputs (primary and byproducts) are treated equally. The craft does not complete until space is available for every output item. A `production.output.blocked` event is emitted.

---

### Edge Cases

- What happens if the workstation is destroyed mid-craft? → Crafting is interrupted; interruption behavior applies.
- What happens if the crafter dies mid-craft? → Craft is abandoned; materials follow interruption policy.
- What happens if input materials are removed from work inventory by another entity mid-craft? → Once crafting begins, inputs are "locked" (reserved) at craft start; they are consumed on completion (FR-009). They cannot be removed during the busy period.
- What happens if output inventory is full when crafting completes? → Output cannot be placed; crafting completion blocks until space is available. Entity remains busy at workstation until output is depositable. A `production.output.blocked` event is emitted.
- What happens if a recipe is removed from registry while an entity is mid-craft (registries are immutable during a session, so this only arises when a save is loaded with updated content)? → Current craft completes (recipe was valid at start); no new crafts of that recipe can begin.
- What happens if two entities try to use the same workstation simultaneously? → One workstation supports one active crafter at a time. Second entity waits or seeks alternative workstation.
- What happens if a recipe has 0 duration? → Output is produced instantly (same tick); used for trivial transformations (splitting stacks, converting formats).
- What happens if entity carrying capacity is insufficient to carry all inputs in one trip? → Entity makes multiple gathering trips (per Story 2 scenario 5).

## Requirements

### Functional Requirements

- **FR-001**: System MUST support a Material Registry: an open set of material definitions loadable at bootstrap. Each material defines at minimum: `id` (unique string), `stackLimit` (integer), `weight` (integer), `categories` (string array/tags).
- **FR-002**: System MUST support a Recipe Registry: an open set of recipe definitions loadable at bootstrap. Each recipe defines at minimum: `id` (unique string), `inputs` (array of materialId + quantity), `outputs` (array of materialId + quantity), `duration` (integer ticks), `restrictions` (object).
- **FR-003**: Recipe restrictions MUST support at minimum: `workstation` (entity prototype tag required), `room` (room type required), `skill` (skill ID + minimum level). All restrictions are optional per recipe; a recipe with no restrictions is hand-craftable anywhere.
- **FR-004**: System MUST validate recipe definitions at load time: all referenced material IDs must exist in the Material Registry. Invalid recipes are rejected with clear errors.
- **FR-005**: System MUST implement a crafting execution flow: (1) validate restrictions are met (a recipe whose `unlockTier` is above the current settlement tier cannot be started, rejected with `ContentLockedError`, spec 027 FR-008), (2) gather materials to work inventory, (3) lock (reserve) inputs, (4) advance craft timer tick-by-tick, (5) consume inputs and produce outputs on completion.
- **FR-006**: The "work inventory" for a recipe MUST be the workstation entity's inventory when a workstation is required, or the crafter's own inventory for hand-crafted recipes.
- **FR-007**: Material gathering MUST use the entity's task queue (feature 003) and pathfinding (feature 012) to retrieve materials from any available source and deposit them in the work inventory.
- **FR-008**: During crafting, the entity MUST be in a "busy" state and unable to accept other tasks. Craft progress is an integer (ticks elapsed) advancing by exactly 1 per game tick.
- **FR-009**: Upon craft completion, input materials MUST be consumed (removed from work inventory) and output materials MUST be placed in the destination defined by the recipe. Each recipe defines an `outputDestination` field, an `OutputDestination` enum: Workstation (output stays in workstation inventory), Crafter (output goes to crafter's inventory), or Stockpile (output is flagged for hauling, routed per spec 018 FR-010). Default is Workstation if not specified.
- **FR-010**: System MUST support multi-step recipe chains. When an entity needs material X that is itself craftable, the system identifies the chain and executes prerequisite recipes first (or uses existing stock if available).
- **FR-011**: System MUST emit events for crafting lifecycle: `production.crafting.started`, `production.crafting.completed`, `production.crafting.failed`, `production.crafting.interrupted`, `production.output.blocked`. The `production.crafting.completed` payload MUST include `inputs` and `outputs` arrays of `{ materialId, quantity }` with the actual quantities, including skill `outputBonus` extras (spec 020 FR-007), consumed by the ProductionLedger (spec 025 FR-012).
- **FR-012**: One workstation entity MUST support only one active crafter at a time. Additional entities seeking the same workstation wait or select an alternative.
- **FR-013**: Input materials MUST be reserved/locked at the moment crafting begins (not during gathering). Once locked, other entities cannot take them from the work inventory.
- **FR-013a**: When crafting is interrupted (by higher-priority task, entity incapacitation, workstation destruction, or player cancellation), all locked input materials MUST be returned to the work inventory. No materials are consumed on interruption. Craft progress resets to 0.

> **Amended by DECISIONS.md D-10**: `CancelProductionOrder` (current craft finishes) and `CancelCraft` (interruption per this FR) are separate commands, which resolves the US8.3 conflict. Automatic prerequisite chains (FR-010) and variant recipes are not implemented; chains are realised through production/standing orders.
- **FR-014**: Recipe and material registries MUST be serializable. On save, the active registry state is not saved (registries are re-loaded from data files on bootstrap); only in-progress crafts are serialized.
- **FR-015**: In-progress crafts (entity, recipe, progress ticks, work inventory reference) MUST serialize to GameState (feature 006) and resume identically on load.
- **FR-016**: System MUST support production orders: a queue of recipe executions assigned to a workstation. Orders specify recipe ID, quantity, and priority. Settlement-level "keep N in stock" orders are specified by spec 026 (Standing Orders & Steward). A production order for a recipe whose `unlockTier` is above the current settlement tier MUST be rejected with `ContentLockedError` (spec 027 FR-008).
- **FR-017**: Production orders MUST persist across save/load and be cancellable by the player.
- **FR-018**: System MUST support recipe skill requirements. An entity without sufficient skill cannot execute the recipe. Skill levels may modify craft duration.
- **FR-019**: System MUST support byproducts in recipe output (multiple output materials per recipe).
- **FR-020**: All crafting operations MUST be deterministic. Same inputs + same game state + same ticks = same outputs (compatible with PRNG feature 011 for any randomized quality).
- **FR-021**: Crafting stall conditions (missing input, missing workstation, insufficient skill, blocked output, no orders) MUST be reported to the status system as spec 025 `BlockedReason` values (`MissingInput`, `MissingWorkstation`, `NoQualifiedWorker`, `OutputBlocked`, `NoOrders`; spec 025 FR-003, FR-005).

### Key Entities

- **Material**: A registered material type in the Material Registry. Defines id, stackLimit, weight, categories/tags, optional perishability, and optional value. Materials are data definitions, not entities themselves — entity inventories hold stacks of materials.
- **Recipe**: A registered production rule in the Recipe Registry. Defines id, inputs (materialId + quantity pairs), outputs (materialId + quantity pairs, including byproducts), duration (ticks), restrictions (workstation, room, skill), and optional metadata (difficulty). Skill experience is not defined per recipe; it comes from the skill registry (spec 020).
- **Workstation**: A furniture entity with a component indicating it supports crafting. Has its own inventory (for work-in-progress materials), a list of compatible recipe tags/types, and occupancy state (occupied by crafter or available). One workstation = one concurrent crafter.
- **CraftingTask**: An active crafting operation tracked in the entity's task queue. Contains: recipe reference, progress (ticks elapsed), work inventory reference, locked input materials, and target output destination. Serializable for save/load.
- **ProductionOrder**: A player-issued standing instruction at a workstation. Contains: recipe ID, target quantity, priority, status (active/paused/completed/cancelled). Serializable.
- **MaterialRegistry**: Global catalog of all material definitions. Loaded at bootstrap from data files. Immutable during gameplay. Queryable by ID, category, or tag.
- **RecipeRegistry**: Global catalog of all recipe definitions. Loaded at bootstrap from data files. Immutable during gameplay. Queryable by output material, workstation type, or category.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A simple recipe (single input → single output) can be executed end-to-end (gather → craft → produce) in under 1 second of real time for the entire flow (excluding simulated game ticks).
- **SC-002**: A 3-step recipe chain executes correctly and deterministically; same seed + same inputs = identical outputs on every run.
- **SC-003**: 50+ entities crafting concurrently at different workstations execute without performance degradation (<100ms per tick total for all crafting systems).
- **SC-004**: Adding a new material or recipe requires only data definition (no code changes); new content is usable after the next bootstrap (registries are immutable during a session).
- **SC-005**: Recipe restriction validation (workstation, room, skill) correctly blocks invalid attempts in 100% of test cases.
- **SC-006**: Save/load preserves all in-progress crafts: after load, crafting resumes at the exact tick it was saved and completes identically.
- **SC-007**: Material gathering correctly handles multi-source retrieval, carrying capacity, and multiple trips without deadlocking or losing materials.
- **SC-008**: Production orders (repeat crafting) execute the correct number of times and stop when order quantity is fulfilled.
- **SC-009**: Workstation occupancy is enforced: no two entities craft at the same workstation simultaneously.

## Assumptions

- **Inventory system (feature 005) exists**: Crafting relies on the inventory system for material storage, retrieval, capacity checks, and slot management. Material definitions here extend (not replace) the inventory's material handling.
- **Task queue (feature 003) exists**: The gathering and crafting phases are tasks in the entity's task queue. Crafting integrates as a composite task (gather subtask + craft subtask).
- **Pathfinding (feature 012) exists**: Material gathering requires pathfinding to locate and travel to material sources and workstations.
- **Event bus (feature 010) exists**: Crafting lifecycle events are emitted on the global event bus for other systems to react to.
- **Game time (feature 001) exists**: Craft duration is measured in integer game ticks. Busy time is tick-based, not real-time.
- **Room restrictions use zones/rooms (spec 015)**: Recipe room restrictions are validated against the zone/room system (enclosed spaces and their player-assigned type).
- **Registries are loaded from static data files**: Materials and recipes are defined in data files (JSON or equivalent) loaded at bootstrap. They are not generated or modified during gameplay.
- **Skill system is a separate concern**: This spec defines the skill _interface_ for recipes (minimum requirement, duration modifier, experience gain) but does not define the full skill/experience system. Spec 020 details skill progression (including `baseGrowthPerCompletion`), level caps, and learning rates.
- **Single crafter per workstation**: Workstations support one crafter at a time. Cooperative crafting (multiple entities on one station) is out of scope.
- **Output destination is deterministic**: Output materials go to a well-defined location (the recipe's `outputDestination`, FR-009) — there is no randomized output placement.
- **No recipe failure/quality variation**: Recipes always succeed. Quality variation and failure chance can be added via skill system later.
- **Interruption returns materials**: When crafting is interrupted for any reason, all locked input materials are returned to the work inventory. No materials are lost. The entity exits busy state and the craft progress is reset to 0. The recipe can be re-attempted.
- **Output destination is configurable per recipe**: Each recipe declares where its outputs go (workstation inventory, crafter inventory, or flagged for stockpile hauling). Default is workstation inventory.
- **All outputs are equally important**: If any output (primary or byproduct) cannot be placed due to full inventory, craft completion blocks. No output is silently discarded.
