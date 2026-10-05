# Feature Specification: Construction System

**Created**: 2026-05-02
**Input**: User description: "I want to specify the construction and blueprints mechanism. There are not really blueprints, entities will simply build one or more other (furniture?) entities one-by-one, they are queued. A zone or room is created instantly but does not become effective until all of its requirements are met, such as necessary furnitures or enclosure in walls/doors. The construction of a thing is similar to crafting, in the sense that materials need to be brought and then an entity is busy with it for a bit. Building is always performed at the place where the furniture or wall will be placed. Sometimes the user needs an additional material, such as a tool, that is not consumed in the building process."

## User Scenarios & Testing

### User Story 1 - Queue Construction Jobs (Priority: P1)

The player (as colony government) issues construction jobs by selecting what to build and where to place it on the map. Each job is posted to a job board (feature 017); the colony-wide construction queue is the player-side ordering and view of all construction jobs. Entities that meet the prerequisites for a construction job (adult humanoid, feature 017) claim jobs from job boards, execute them one at a time, and mark them complete. The queue is persistent, ordered, and inspectable.

**Why this priority**: The queue is the player-facing interface for all construction. Without it, there is no way to issue building orders. Blocking for everything else.

**Independent Test**: Can be fully tested headlessly by: issuing 3 construction jobs (e.g., place Wall at A, place Table at B, place Oven at C), verifying the queue contains 3 pending jobs in order and the jobs are posted to a job board, letting an eligible entity claim them, and verifying jobs are picked up and executed one at a time.

**Acceptance Scenarios**:

1. **Given** the player issues a job to place a Wall at (10, 5), **When** the job is committed, **Then** a ConstructionJob entity exists at target location (10, 5) with status "pending" and the required materials listed.
2. **Given** multiple construction jobs queued, **When** an entity begins work, **Then** the entity takes one job at a time; it does not start a second job until the first is complete.
3. **Given** a job queue with 5 pending jobs, **When** the player cancels one, **Then** that job is removed from the queue; the remaining 4 jobs are unaffected and retain their order.
4. **Given** a job queue, **When** queried, **Then** the queue returns all pending, in-progress, and recently-completed jobs with their status and target location.
5. **Given** a job in-progress, **When** the game is saved and loaded, **Then** the job resumes with correct progress and the assigned entity continues work from where it left off.

---

### User Story 2 - Material Gathering for Construction (Priority: P1)

Before construction begins, the builder entity must transport all required consumable materials to the build site. The builder retrieves materials from stockpiles and deposits them at the target location. Once all materials are present at the build site, the builder begins the construction phase. The gathering phase uses pathfinding and the inventory system.

**Why this priority**: The gather → build flow is the actual gameplay loop. Without material transport, construction is instant and free, removing all economic meaning.

**Independent Test**: Can be fully tested headlessly by: defining a Wall requiring 4 Stone, placing Stone in a stockpile, issuing a Wall construction job, verifying the entity pathfinds to the stockpile, retrieves Stone, carries it to the build site, and deposits it before the build timer starts.

**Acceptance Scenarios**:

1. **Given** a Wall construction job requiring 4 Stone, and Stone is in a nearby stockpile, **When** an entity picks up the job, **Then** the entity travels to the stockpile, retrieves up to carrying-capacity Stone, travels to the build site, and deposits it.
2. **Given** a build site already has 2 of the required 4 Stone (from a previous partial delivery), **When** the entity gathers, **Then** only 2 more Stone are fetched (partial fulfilment awareness).
3. **Given** the required material is not available anywhere, **When** the entity attempts to gather, **Then** the job is suspended with reason "missing materials: Stone" and the entity is freed for other tasks. The job resumes when materials become available.
4. **Given** the entity's carrying capacity cannot hold all required materials at once, **When** gathering, **Then** the entity makes multiple trips until all materials are present at the build site.
5. **Given** multiple builders competing for the same stockpile materials, **When** one builder reserves materials for a job, **Then** those materials are not simultaneously claimed by another builder for a different job (no double-claiming).

---

### User Story 3 - Non-Consumed Tool Requirements (Priority: P1)

Some construction jobs require a tool that is used during construction but not consumed (e.g., a Hammer for carpentry, a Chisel for stonework). The builder entity carries the tool to the build site, uses it during the construction phase, and retains it afterwards. The tool is not deposited at the build site and is not consumed when construction completes. If no suitable tool is available, the job cannot begin.

**Why this priority**: Non-consumed tools differentiate construction from pure material consumption and create meaningful resource constraints (limited tools = limited concurrent builders). They also mirror real construction workflows.

**Independent Test**: Can be fully tested headlessly by: defining a Table construction job requiring a Hammer tool, verifying a builder with a Hammer can begin and a builder without one cannot, and verifying the Hammer remains in the builder's inventory after construction completes.

**Acceptance Scenarios**:

1. **Given** a Table construction job requiring a Hammer tool, **When** a builder entity with a Hammer in inventory picks up the job, **Then** construction proceeds and the Hammer remains in the builder's inventory at completion.
2. **Given** a builder without a Hammer, **When** the builder attempts to pick up the Table job, **Then** the builder first seeks a Hammer from a tool storage location, picks it up, then returns to begin the job.
3. **Given** no Hammer exists anywhere in the world, **When** a builder evaluates the Table job, **Then** the job is suspended with reason "missing tool: Hammer"; no builder attempts it until a Hammer is available.
4. **Given** a builder carrying a Hammer begins construction, **When** construction is interrupted mid-way, **Then** the Hammer remains with the builder (it was never deposited; interruption does not lose the tool).
5. **Given** multiple construction jobs all requiring Hammers and only 1 Hammer available, **When** builders compete for jobs, **Then** only one builder holds the Hammer at a time; others wait or take jobs not requiring a Hammer.

---

### User Story 4 - Construction Phase: Busy Time at the Build Site (Priority: P1)

Once all required materials are at the build site and the builder has required tools, the construction phase begins. The builder entity is "busy" at the build site location for a defined number of game ticks. Progress advances one tick per game tick. On completion, the built entity (wall, furniture, etc.) is placed in the world at the target location, consumed materials are removed, and the build site is cleared.

**Why this priority**: The busy phase is the time cost of construction. It makes building meaningful rather than instant, drives player planning, and mirrors the crafting time model (feature 014).

**Independent Test**: Can be fully tested headlessly by: starting a 20-tick construction job, verifying the builder is busy for exactly 20 ticks, verifying the built entity appears in the world at the target location after tick 20, and verifying consumed materials are gone.

**Acceptance Scenarios**:

1. **Given** a Wall construction job with duration 10 ticks, **When** construction begins (all materials present, tool available), **Then** the builder is marked busy for 10 ticks and cannot take other tasks.
2. **Given** construction in progress at tick 5/10, **When** queried, **Then** progress is reported as 5/10 (integer ticks elapsed / total).
3. **Given** construction completes at tick 10, **When** the tick resolves, **Then** the Wall entity is placed occupying the target cell (the cell becomes non-traversable; its terrain type is unchanged), consumed Stone is removed, and the build site ConstructionJob entity is marked complete.
4. **Given** a completed construction job, **When** the event system is checked, **Then** a `construction.job.completed` event was emitted with job ID, placed entity type, and location.
5. **Given** construction completes and places a furniture entity, **When** a zone containing that tile is checked for requirements, **Then** the zone re-evaluates its requirements immediately (furniture now present may activate zone effects).

---

### User Story 5 - Construction Enables Zone and Room Activation (Priority: P1)

Construction jobs are entirely independent of zone designation. The player can build any furniture anywhere at any time regardless of whether a zone has been designated. Zone activation is purely reactive: the zone system monitors the world state and activates whenever its requirements happen to be met, whether by deliberate construction or coincidence.

**Why this priority**: This is the core gameplay loop: player designates a zone, issues construction jobs for required furniture, builders construct them, zone activates. Without this connection, construction has no higher-level purpose.

**Independent Test**: Can be fully tested headlessly by: designating a Bakery zone (requirements: Room + 1 Oven), issuing a Wall construction job enclosing the zone (making it a Room) and an Oven construction job, completing both, and verifying the Bakery zone becomes active.

**Acceptance Scenarios**:

1. **Given** a Bakery zone (inactive, missing Oven) and a completed Oven construction job placing an Oven inside the zone, **When** the Oven entity is placed, **Then** the zone re-evaluates and activates if all other requirements are met.
2. **Given** an open zone that needs enclosure for Room status, **When** wall construction jobs complete around it, **Then** the room detection system re-evaluates and Room status is granted when fully enclosed.
3. **Given** a zone requiring 2 Workbenches and 1 has been constructed, **When** the second Workbench construction completes, **Then** the zone transitions from partial to fully active.
4. **Given** a construction job placing a wall that encloses a zone, **When** the wall is placed, **Then** the wall entity occupies its cell and marks it non-traversable, and room detection re-runs automatically.
5. **Given** a zone fully activated by construction, **When** a constructed furniture entity is deconstructed, **Then** the zone re-evaluates and may deactivate (losing the requirement).

---

### User Story 6 - Deconstruction (Priority: P2)

The player can issue a deconstruction order on an existing built entity (wall, furniture). An entity picks up the deconstruction job, travels to the target, and after a busy period, removes the entity from the world. Each entity prototype declares its deconstruction yield: a list of `{ materialId, quantity }` pairs returned when that entity is deconstructed (FR-003; quantities are defined in the prototype and may be anywhere from none to all of the materials it cost). A simple wall may return most of its stone; an elaborate piece of furniture may return little. Returned materials are dropped at the site as a pile and hauled to stockpiles.

**Why this priority**: Deconstruction is needed for players to rearrange their colony, correct mistakes, and reclaim materials. P2 because construction works without it, but deconstruction is essential for a playable game.

**Independent Test**: Can be fully tested headlessly by: placing a Wall, issuing a deconstruction order, verifying an entity travels to the Wall, the Wall is removed after the busy period, and materials are returned per the prototype's `deconstructionYield`.

**Acceptance Scenarios**:

1. **Given** a placed Wall entity, **When** the player issues a deconstruct order, **Then** a DeconstructionJob is queued for that entity.
2. **Given** a DeconstructionJob in the queue, **When** a builder picks it up, **Then** the builder travels to the target entity, enters a busy state for the deconstruction duration, and removes the entity from the world.
3. **Given** deconstruction completes on a Wall with yield `[{ materialId: "stone_block", quantity: 3 }]`, **When** the Wall is removed, **Then** 3 Stone Blocks are dropped at the tile as a loose pile and become available for hauling to a stockpile.
4. **Given** a wall that is part of an enclosed room, **When** it is deconstructed, **Then** the wall entity is removed and its cell becomes traversable again, room detection re-runs, and the room loses its Room status.
5. **Given** a deconstruction job in progress, **When** the game is saved and loaded, **Then** the job resumes with correct progress.

---

### User Story 7 - Construction Queue Priority and Reordering (Priority: P2)

The player can reprioritize construction jobs in the queue: moving urgent jobs to the front, pausing low-priority jobs, or setting a job as "urgent" so it jumps to the top. Entities always pick the highest-priority available job they are capable of executing.

**Why this priority**: Without priority control, players cannot direct construction effort effectively. P2 because a default FIFO queue works for small colonies, but priority becomes essential as colonies grow.

**Independent Test**: Can be fully tested by: queuing 5 jobs, marking job 4 as urgent, verifying the next entity to become available picks job 4 first, then resumes from job 1.

**Acceptance Scenarios**:

1. **Given** 5 queued jobs in order [A, B, C, D, E], **When** job D is marked urgent, **Then** the next idle entity picks D first.
2. **Given** a job marked as paused, **When** an idle entity evaluates the queue, **Then** the paused job is skipped; the entity picks the next non-paused job.
3. **Given** multiple entities and multiple queued jobs, **When** entities pick jobs concurrently, **Then** each job is assigned to only one entity at a time (no double-assignment).
4. **Given** a job reordered to position 1 in the queue, **When** current in-progress jobs complete, **Then** the reordered job is executed next.
5. **Given** a job queue, **When** the game is saved and loaded, **Then** queue order, priorities, and paused states are preserved.

---

### Edge Cases

- What happens if the target tile for a construction job is occupied by another entity when the builder arrives? → Construction is blocked until the tile is clear; the builder waits or the job is re-queued. **Open question:** entities do not block cells (spec 004), so does a mobile entity (citizen, animal) standing on the target cell block construction at all, and if so, does the builder wait or is the job re-queued?
- What happens if materials deposited at a build site are taken by another entity before construction begins? → The build site holds materials as a "reserved pile"; materials at a build site should not be available for general hauling. If taken, the gathering phase restarts.
- What happens if the builder entity is deleted mid-construction? → The job returns to "pending" status; materials remain at the build site; another builder can pick up the job.
- What happens if a construction job's target tile becomes non-buildable after queuing (e.g., a different entity is placed there)? → The job is suspended with a "location blocked" reason; the player must cancel or relocate the job.
- What happens if the same entity type is constructed twice at the same location? → The second job is rejected at queue time with "location already occupied".
- What happens if construction requires more materials than exist in the entire game world? → Job is suspended with "materials unavailable"; no builder will attempt it.
- What happens if a non-consumed tool is lost (destroyed, stolen) while the builder is en route to the build site? → The builder detects the missing tool before beginning the construction phase and re-seeks a replacement, or the job is suspended if none exists.
- What happens if the world has no adult humanoid entities? → All construction jobs remain pending; this is reported as `NoQualifiedWorker` (spec 025).

## Clarifications

### Session 2026-05-03

- Q: If a builder is interrupted during the gathering phase (materials partially at build site), what happens to already-delivered materials? → A: Materials already at the build site stay there; the next builder resumes gathering only the remaining missing materials.
- Q: What qualifies an entity to pick up and execute a construction job? → A: Building is a job in the job system (feature 017). The prerequisite is that the entity is an adult humanoid. Any entity meeting that prerequisite may claim and execute a construction job.
- Q: How are build site materials reserved — physical transfer or in-place tagging? → A: Materials are physically transferred into the BuildSite's inventory on delivery via the standard inventory system. They leave the source stockpile when picked up.
- Q: What happens when the player cancels an in-progress construction job? → A: Cancellation stops the builder immediately; no entity is placed; staged materials at the build site are returned to a nearby stockpile or dropped as a loose pile.
- Q: Are construction jobs coupled to zone designation, or can furniture be built independently of zones? → A: Construction jobs are fully independent of zones. The player builds anywhere at any time; zones activate reactively whenever their requirements are met in the world.

## Requirements

### Functional Requirements

- **FR-001**: System MUST post every ConstructionJob to a job board in the job system (feature 017); entities claim construction jobs from job boards, not from a separate queue. The colony-wide ConstructionQueue is the player-side ordered view of all ConstructionJob entities: the player issues, orders, prioritizes, pauses and cancels jobs through it, and that ordering is reflected in the job postings.
- **FR-001b**: Construction jobs MUST be expressed as job postings in the job system (feature 017). The prerequisite for accepting a construction job is that the entity is an adult humanoid. Any entity meeting this prerequisite may claim and execute a construction job; no additional capability flag or occupation is required.
- **FR-002**: Each ConstructionJob MUST declare: target location (map + tile), entity prototype to build, required consumable materials (materialId + quantity), required non-consumed tools (entity type/tag), construction duration (ticks), and status (pending / gathering / in-progress / complete / suspended / cancelled). A suspended job carries a spec 025 `BlockedReason` (`MissingInput`, `MissingTool`, `LocationBlocked`, `NoQualifiedWorker`; spec 025 FR-003).
- **FR-003**: System MUST support a DeconstructionJob as a variant of ConstructionJob with target = an existing placed entity. Deconstruction removes the entity from the world and drops returned materials at the tile as a loose pile. The quantity of returned materials per type is declared in the entity prototype's `deconstructionYield` field (a list of `{ materialId, quantity }` pairs). An empty yield means no materials are returned.
- **FR-004**: Materials required by a ConstructionJob MUST be transported to the build site (target tile or adjacent staging area) before the construction phase begins. Transport uses the entity's task queue (feature 003) and pathfinding (feature 012).
- **FR-005**: Materials staged at a build site MUST be physically transferred into the BuildSite's inventory using the standard inventory system (feature 005) at the moment the builder delivers them. Once in the BuildSite inventory, they are no longer present in any stockpile and are not available for general hauling. Reserved materials are transferred back to a nearby stockpile (or dropped as a loose pile) if the job is cancelled.
- **FR-006**: Non-consumed tool requirements MUST be carried by the builder entity during the construction phase and retained afterwards. Tools are never deposited at the build site.
- **FR-007**: The construction phase MUST place the builder entity in a "busy" state at the build site for the job's defined duration (integer ticks). Progress advances by 1 tick per game tick.
- **FR-008**: On construction completion: consumable materials at the build site are destroyed, the built entity is placed at the target location, the builder exits busy state, and the ConstructionJob is marked complete.
- **FR-009**: On construction completion, the terrain and zone systems MUST be notified so that room detection and zone requirement evaluation can re-run for affected areas.
- **FR-010**: System MUST emit events for construction lifecycle: `construction.job.queued`, `construction.job.started`, `construction.job.completed`, `construction.job.cancelled`, `construction.job.suspended`. The `construction.job.completed` payload includes `consumed: { materialId, quantity }[]` (empty for a DeconstructionJob); for a DeconstructionJob, `construction.job.completed` also carries `yield: { materialId, quantity }[]` (the returned materials, FR-003). Both are consumed by the ProductionLedger (spec 025 FR-012).
- **FR-011**: If a builder is interrupted during the **construction phase** (builder assigned higher-priority need, builder incapacitated), the job returns to "pending" status, materials remain staged at the build site, and progress resets to 0. The next builder who picks up the job starts the construction phase from the beginning. Materials are not re-gathered (they remain staged). If a builder is interrupted during the **gathering phase** (materials not yet fully at the build site), materials already delivered remain staged at the build site; the next builder (or the recovered original) resumes gathering only the remaining missing materials.
- **FR-012**: Only one builder entity may be assigned to a ConstructionJob at a time. A second builder cannot start the same job while another is in-progress on it.
- **FR-013**: System MUST support job priority: jobs have a priority value (integer) that is the posting's player priority in the job selection order of spec 017 FR-007; entities pick among the construction jobs they are eligible for (adult humanoid prerequisite met) according to that order, so the highest-priority available job wins. Player can modify priority of queued jobs.
- **FR-014**: System MUST support pausing and cancelling individual jobs. Paused jobs are skipped during entity job selection. Cancellation takes effect immediately regardless of job status: if the job is pending, it is removed from the queue and its job posting is withdrawn; if in-progress, the builder stops immediately, no entity is placed, and staged materials at the build site are transferred to a nearby stockpile or dropped as a loose pile at the site.
- **FR-015**: All ConstructionJob and DeconstructionJob state MUST serialize to GameState (feature 006) and resume identically on load.
- **FR-016**: System MUST validate construction jobs at queue time: target tile must be buildable (not already occupied by a non-removable entity, within map bounds). A prototype whose `unlockTier` is above the current settlement tier is rejected at queue time with `ContentLockedError` (spec 027 FR-008).
- **FR-017**: The entity prototype to be built is looked up in the entity prototype registry (feature 003). If the prototype does not exist, the job is rejected at queue time. If its `unlockTier` is above the current settlement tier, the job is rejected at queue time with `ContentLockedError` (spec 027 FR-008).

### Key Entities

- **ConstructionJob**: An active or pending construction order. Contains target location, entity prototype to build, required materials list, required tools list, assigned builder (if any), progress (ticks elapsed), and status. Serializable.
- **DeconstructionJob**: A variant of ConstructionJob targeting an existing entity for removal. Contains target entity ID, duration, assigned builder, progress, and status. Serializable.
- **BuildSite**: A transient in-world marker at the target tile for a ConstructionJob. Holds staged (reserved) materials. Cleared on completion or cancellation.
- **ConstructionQueue**: The colony-wide, player-side ordered view of all pending, in-progress, suspended, and recently-completed ConstructionJobs and DeconstructionJobs. The jobs themselves are posted to job boards (feature 017). Globally accessible; serializable.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A simple construction job (gather materials → build → place entity) executes end-to-end correctly and deterministically given the same seed and world state.
- **SC-002**: Zone and room requirements re-evaluate within 1 tick of a construction job completing that places a relevant entity.
- **SC-003**: 10+ concurrent construction jobs (different builders, different sites) execute without deadlock, double-claiming materials, or collision at build sites.
- **SC-004**: Construction queue state (job order, priorities, paused/cancelled status, in-progress progress) is fully preserved through a save/load cycle.
- **SC-005**: Material reservation at build sites is reliable: staged materials are not claimed by other hauling jobs in 100% of test cases.
- **SC-006**: Non-consumed tools remain with the builder after construction completes in 100% of test cases.
- **SC-007**: Job suspension (materials unavailable, tile blocked) correctly identifies the reason and resumes automatically when the blocking condition is resolved.
- **SC-008**: Deconstruction removes the target entity, re-triggers terrain/zone re-evaluation, and handles material return per policy in 100% of test cases.

## Assumptions

- **Entity prototype registry (feature 003) exists**: Construction places entities by prototype ID. The entity must exist in the prototype registry; construction does not define new entity types.
- **Inventory and transfer (feature 005) exists**: Material transport to build sites uses the inventory system. Staged materials at build sites are stored in a BuildSite inventory with restricted access (not available to general hauling).
- **Pathfinding (feature 012) exists**: Builders travel to stockpiles and build sites using pathfinding. Travel time is real game ticks.
- **Zone system (feature 015) exists**: Construction completion triggers zone re-evaluation. This spec does not implement zones; it notifies the zone system.
- **Terrain system (feature 004) exists**: Walls and doors are entities that occupy a cell and set its traversability (doors per their state); the cell's terrain type is unchanged. Construction completion calls terrain API to place the built entity and update traversability.
- **Single builder per job**: One builder entity works one construction job at a time. Cooperative construction (multiple builders on one job) is out of scope.
- **Build site as inventory (physical transfer)**: A BuildSite entity has its own inventory for staged materials. Materials are physically moved into the BuildSite's inventory by the builder when delivered — they leave their origin stockpile at pickup time. This means staged materials are fully governed by the inventory system (feature 005) with no additional reservation tagging needed.
- **Construction duration is defined per prototype**: The number of ticks to build a given entity type is a property of the entity prototype definition (or a separate construction data file). This spec does not define those durations.
- **Deconstruction duration is shorter than construction**: Tearing down is faster than building. Exact ratio is a game balance constant.
- **No partial construction visible state**: A construction job is either "not started," "in progress" (build site marker visible), or "complete" (entity placed). There is no intermediate visual representation of a half-built wall. This may be added by the renderer later.
- **Interruption resets progress**: When construction is interrupted, progress resets to 0. Materials remain staged at the build site. The next builder re-does the full construction phase. This is intentional: it discourages relying on interrupted builders and rewards continuous work assignment.
- **Deconstruction yield is prototype data**: Each entity prototype declares a `deconstructionYield` list. This is authored as part of the entity definition, not computed dynamically. Game balance determines yield fractions per entity type.
- **Loose piles**: **Open question:** the loose pile created by FR-003, FR-005 and FR-014 needs a defined prototype and an owner for its haul posting (spec 025 Key Entities, LoosePile).
