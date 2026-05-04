# Feature Specification: Job Work Prioritization System

**Feature Branch**: `017-job-work-prioritization`
**Created**: 2026-05-02
**Status**: Unimplemented (fresh start)
**Input**: User description: "I want to specify the job work prioritization system. Any entity can only pick up new work at a job board (which is an entity). There can be several job boards in the map, some rooms require one. Every job board has its own list of jobs, they are not connected. Most jobs get taken off the job-board when an entity starts to perform it so that other entities do not also start performing it. Some jobs are posted in duplicate, so that multiple entities can work concurrently. Some jobs reappear on the job board automatically when they are done (eg. 'bake a bread'), while others don't ('transport this bread'). Entities will prefer to do work that they are familiar with but can do new jobs too, rather than sitting idle. Some job boards are completely managed by the game, for example the jobboard belonging to a bakery, with the user having only minimal influence (stop bakery, resume bakery). Other job boards, such as one in a town square, is managed by the user. When the user does, a town crier is dispatched who will walk towards that job board and the job board is updated at the user specification when the town crier arrives there and does so."

> **Note (2026-05-04)**: A previous implementation of this feature was discarded. This spec is being reimplemented from scratch following the conventions in spec 023 (TypeScript code style). All code lives under `src/game/`, tests are co-located, no barrel files, no default exports. Entities are pure data objects; systems provide behavior. See spec 023 for the full code style reference.


## User Scenarios & Testing _(mandatory)_

### User Story 1 - Entity Picks Up Work at a Job Board (Priority: P1)

When an entity becomes idle (task queue empty, no pending needs), it looks for the nearest reachable job board and travels to it. At the board, it browses available jobs, selects the most suitable one based on familiarity and priority, claims the job (removing it from the board so no other entity claims the same posting), and begins executing it.

**Why this priority**: This is the fundamental work-assignment loop. Without it, entities are permanently idle after completing their current task. Blocking for all gameplay.

**Independent Test**: Can be fully tested headlessly by: placing a job board with 3 posted jobs, making an entity idle, verifying it travels to the board, claims one job (board now shows 2 remaining), and begins executing the claimed job.

**Acceptance Scenarios**:

1. **Given** an idle entity and a nearby job board with 2 available jobs, **When** the entity reaches the board, **Then** the entity claims the most suitable job and the board's available count decreases by 1.
2. **Given** two idle entities and a board with 1 exclusive job, **When** both entities arrive at the board simultaneously, **Then** exactly one entity claims the job; the other finds no suitable job and waits or seeks another board.
3. **Given** an entity that has just completed a job, **When** the entity's task queue empties, **Then** the entity immediately seeks the nearest reachable job board rather than remaining idle.
4. **Given** a job board with no suitable jobs for an entity, **When** the entity checks the board, **Then** the entity does not claim anything and may seek another board or enter a waiting state.
5. **Given** a claimed job, **When** the entity begins executing it, **Then** the job is no longer visible to other entities on the board (exclusive claim enforced).

---

### User Story 2 - Exclusive vs. Concurrent Jobs (Priority: P1)

Most jobs are exclusive: when one entity claims them, they are removed from the board and no other entity can start the same posting. Some jobs are posted with a concurrency count greater than one, meaning multiple entities can claim and work on them simultaneously (e.g., "haul stone to the build site" posted 3 times, or "patrol the perimeter" with concurrency 4). When a concurrent job is claimed, the board decrements available slots but does not remove the posting until all slots are claimed or the job expires.

**Why this priority**: The exclusive/concurrent distinction governs how many workers can be directed to a task simultaneously. Without it, every task would either block concurrent work or allow infinite workers.

**Independent Test**: Can be fully tested headlessly by: posting a job with concurrency 3, having 4 entities arrive at the board, verifying 3 claim it and the 4th cannot, verifying the board shows 0 remaining slots after the 3rd claim.

**Acceptance Scenarios**:

1. **Given** a job posted with concurrency 1 (exclusive), **When** one entity claims it, **Then** the posting is removed from the board; a second entity cannot claim the same posting.
2. **Given** a job posted with concurrency 3, **When** 2 entities claim it, **Then** the board still shows 1 remaining slot; a third entity can still claim it.
3. **Given** a job posted with concurrency 3 and all 3 slots claimed, **When** a fourth entity arrives, **Then** the posting is no longer claimable; the entity treats the board as having no remaining instance of that job.
4. **Given** a concurrent job where one executing entity abandons the job mid-way, **When** the slot is released, **Then** the board re-opens the slot and another entity may claim it.
5. **Given** a mix of exclusive and concurrent jobs on the same board, **When** entities browse the board, **Then** exclusive jobs are removed on first claim; concurrent jobs remain claimable until all slots are filled.

---

### User Story 3 - Recurring vs. One-Time Jobs (Priority: P1)

Jobs have a recurrence policy. One-time jobs are permanently removed from the board when completed (e.g., "transport this bread to the stockpile"). Recurring jobs are re-posted automatically when the previous instance completes (e.g., "bake a loaf of bread" re-appears after each bake). Recurring jobs enable standing work orders at production facilities without player intervention.

**Why this priority**: Recurring jobs are what make production facilities self-sustaining. Without recurrence, players must manually re-issue every production job after each completion.

**Independent Test**: Can be fully tested headlessly by: posting a recurring job (bake bread), having an entity complete it, verifying the job re-appears on the board immediately after completion, and verifying a one-time job (transport bread) does not re-appear.

**Acceptance Scenarios**:

1. **Given** a recurring job "bake bread" on a bakery board, **When** an entity completes the job, **Then** the job is automatically re-posted on the same board with a fresh available slot.
2. **Given** a one-time job "transport Bread to stockpile", **When** an entity completes it, **Then** the job is not re-posted; the board no longer contains this posting.
3. **Given** a recurring job that is suspended (board paused), **When** the currently-executing instance completes, **Then** the job does not re-post until the board is resumed.
4. **Given** a recurring job with concurrency 2, **When** both instances complete, **Then** 2 new instances are re-posted (recurrence restores the full concurrency count).
5. **Given** a recurring job, **When** the job board is deleted or the associated zone becomes invalid, **Then** the recurring job stops re-posting.

---

### User Story 4 - Entity Familiarity and Job Preference (Priority: P1)

Entities prefer jobs they are familiar with (aligned with their occupation or prior experience) over unfamiliar ones, but will take unfamiliar jobs rather than remain idle. Familiarity is based on occupation: a Baker is familiar with baking and cooking jobs; a Smith is familiar with smithing jobs. When browsing a board, an entity scores available jobs by familiarity and picks the highest-scoring suitable job. If no familiar jobs exist, the entity takes the least unfamiliar available job.

**Why this priority**: Familiarity-based preference creates natural specialisation without forced assignment. Workers gravitate toward their trade while remaining flexible. Critical for simulation realism.

**Independent Test**: Can be fully tested headlessly by: placing a Baker entity near a board with 1 baking job and 1 hauling job, verifying the Baker claims the baking job; then removing the baking job and verifying the Baker claims the hauling job rather than staying idle.

**Acceptance Scenarios**:

1. **Given** a Baker entity at a board with a "bake bread" job (familiar) and a "haul stone" job (unfamiliar), **When** the Baker picks a job, **Then** the Baker claims "bake bread" (familiar job preferred).
2. **Given** a Baker entity at a board with only unfamiliar jobs, **When** the Baker evaluates the board, **Then** the Baker claims a job anyway rather than remaining idle (no suitable familiar work available).
3. **Given** two entities at the same board — a Baker and a Smith — and one baking job and one smithing job, **When** both evaluate simultaneously, **Then** the Baker takes the baking job and the Smith takes the smithing job (each gravitates to their specialty).
4. **Given** an entity with no occupation (generalist), **When** evaluating a board, **Then** the entity claims any available job using priority as the tiebreaker.
5. **Given** an entity mid-job that has become familiar with a new job type from completing it, **When** the entity next visits a board, **Then** the newly-familiar job type is preferred alongside original occupation jobs.

---

### User Story 5 - System-Managed Job Boards (Priority: P1)

Some job boards are owned and managed by a game system (e.g., the job board belonging to a Bakery zone). The system posts, re-posts, and removes jobs automatically based on production orders, zone requirements, and game state. The player has minimal direct control: they can pause the entire board (stopping all job posting from that system) or resume it. They cannot add, remove, or reorder individual jobs on a system-managed board.

**Why this priority**: System-managed boards are how production facilities (Bakery, Smithy, Farm) generate continuous work for colonists without player micromanagement. Core to autonomous colony operation.

**Independent Test**: Can be fully tested headlessly by: creating a Bakery zone with a system-managed board, verifying baking jobs are automatically posted, pausing the board, verifying no new jobs appear, resuming, verifying jobs re-appear.

**Acceptance Scenarios**:

1. **Given** a Bakery zone with active requirements (feature 015) and its system-managed board, **When** the zone becomes active, **Then** the board begins posting baking-related jobs automatically.
2. **Given** a system-managed board, **When** the player attempts to add or remove individual jobs, **Then** the action is rejected; a message indicates the board is system-managed.
3. **Given** a system-managed board that is paused by the player, **When** currently-executing jobs complete, **Then** no new jobs are posted until the board is resumed.
4. **Given** a system-managed board for a zone whose requirements are no longer met (e.g., Oven removed), **When** the zone deactivates, **Then** the board automatically pauses (or stops posting) until the zone is re-activated.
5. **Given** a system-managed board resumed after a pause, **When** the board becomes active again, **Then** it resumes posting jobs as if it had never been paused (no backlog of missed jobs).

---

### User Story 6 - User-Managed Job Boards and the Town Crier (Priority: P1)

Some job boards are managed directly by the player (e.g., a board in the town square). The player can post, remove, reorder, or modify jobs on these boards. However, changes are not applied instantly: when the player makes an update, a **Town Crier** entity is dispatched from the player's seat of government. The Town Crier physically walks to the target job board and applies all pending changes upon arrival. Until the Town Crier arrives, the board continues showing its old state.

**Why this priority**: The Town Crier mechanic makes player decisions have physical weight — distance matters, timing matters. It prevents instant remote control and encourages players to build governance infrastructure close to their workforce.

**Independent Test**: Can be fully tested headlessly by: issuing a job posting change to a distant user-managed board, verifying a Town Crier entity is spawned and begins traveling, verifying the board still shows old state during transit, verifying the board updates when the Town Crier arrives.

**Acceptance Scenarios**:

1. **Given** a user-managed board 30 tiles away, **When** the player posts a new job to it, **Then** a Town Crier is dispatched, travels to the board, and the new job appears on the board only when the Town Crier arrives.
2. **Given** a Town Crier en route to a board, **When** queried, **Then** the Town Crier entity's destination, status (traveling/arrived), and pending changes are inspectable.
3. **Given** the player makes multiple updates to the same board while a Town Crier is already en route, **When** another Town Crier becomes available, **Then** the new Town Crier picks up the accumulated pending changes and travels to the board; if the first Town Crier has not yet departed, it simply absorbs the new changes into its payload. Each Town Crier carries all pending changes for its destination board at the moment it departs.
4. **Given** the Town Crier is dispatched but the target board is destroyed before arrival, **When** the Town Crier reaches the former location, **Then** the Town Crier returns to base (update is abandoned) and an event is emitted.
5. **Given** the player cancels a pending update before the Town Crier arrives, **When** the cancellation is issued, **Then** the Town Crier is recalled (or the pending changes are cleared) and the board remains unchanged.

---

### User Story 7 - Cross-Board Job Seeking (Priority: P2)

When an entity's nearest job board has no suitable jobs, the entity may travel to another reachable job board rather than idling. Each entity has a **home board** — the board in their work zone, or the nearest board at the time of their last assignment. Entities always check their home board first. If the home board has been empty of suitable jobs for a sustained period (a configurable number of ticks), the entity may seek other reachable boards as a fallback.

**Why this priority**: Cross-board seeking prevents idle workers when nearby boards are empty but distant boards have work. P2 because entities function on a single board for POC; multi-board seeking adds realism.

**Independent Test**: Can be fully tested headlessly by: emptying the nearest board for an entity, placing jobs on a second board across the map, and verifying the entity walks to the second board rather than going idle.

**Acceptance Scenarios**:

1. **Given** an entity's nearest board has no suitable jobs, **When** another board is reachable and has suitable jobs, **Then** the entity travels to the second board and claims a job there.
2. **Given** an entity that has cross-board seeking enabled, **When** multiple boards have suitable jobs, **Then** the entity selects the board with the nearest/highest-priority suitable job.
3. **Given** no board in the entire map has suitable jobs, **When** the entity finishes evaluating, **Then** the entity enters an idle wait state and re-evaluates when a `jobboard.job.posted` event is emitted.
4. **Given** an entity assigned to a specific board (e.g., assigned worker at a bakery), **When** that board is empty, **Then** the entity waits at or near its assigned board rather than seeking other boards.
5. **Given** a board that becomes available after an entity has started traveling to a farther board, **When** the closer board posts a suitable job during transit, **Then** the entity may optionally re-route to the closer board (greedy re-evaluation).

---

### Edge Cases

- What happens if a Town Crier is destroyed en route? → The pending changes are lost; the board remains in its old state. The player must re-issue the update, which dispatches a new Town Crier.
- What happens if all Town Criers are busy (multiple boards being updated simultaneously)? → Each update dispatches its own Town Crier (one per pending update target). Multiple Town Criers can be active concurrently.
- What happens if a job's required workstation is destroyed after the job is posted? → The job becomes unclaimmable (validation at claim time, not post time). The board marks the job as "blocked" and does not offer it to entities until the requirement is resolvable.
- What happens if an entity claims a job but then becomes unable to complete it (e.g., required material disappears)? → The entity abandons the job, which returns to the board as available (or suspended if the blocking condition is permanent).
- What happens if a recurring job's zone is paused while an instance is in-flight? → The current instance completes; the recurring re-post is suppressed while paused.
- What happens if two boards are equidistant from an idle entity? → The entity selects the board with the higher-priority or more-familiar available jobs. PRNG breaks ties.
- What happens to claimed jobs during a save/load cycle? → Claimed jobs are serialized as "in-progress" with their assigned entity. On load, the entity resumes the job (jobs are not returned to the board on load).
- What happens if a board is placed in an inaccessible location (behind walls with no door)? → Jobs on that board are unreachable; the board is effectively inert until accessible. No automatic resolution.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST implement a JobBoard entity. Each JobBoard maintains its own independent list of job postings. Job boards on the same map are not connected; entities interact with individual boards.
- **FR-002**: Entities MUST only claim new jobs by physically traveling to a job board. Remote job assignment without physical presence at the board is not supported.
- **FR-003**: Each job posting on a board MUST declare: job type ID, concurrency count (default 1), recurrence policy (one-time or recurring), familiarity tags (occupation/skill alignment), priority (integer), and any additional job-specific parameters.
- **FR-004**: When an entity claims a job, the board MUST decrement the available slot count for that posting. When available slots reach 0, the posting is no longer claimable. For concurrency 1 (exclusive) jobs, the posting is removed from the board upon claim.
- **FR-005**: When a recurring job completes, the board MUST automatically re-post the job with a fresh set of available slots (restoring the original concurrency count). Re-posting does not occur if the board is paused or its owning zone is inactive.
- **FR-006**: When a one-time job completes or is cancelled, the posting is permanently removed. No re-posting occurs.
- **FR-007**: Entities MUST score available jobs by familiarity (occupation and experience alignment) before claiming. Higher-familiarity jobs are preferred. Entities claim an unfamiliar job rather than idle when no familiar jobs are available.
- **FR-008**: System MUST support two job board management modes: **system-managed** (jobs posted/removed by game systems, player can only pause/resume) and **user-managed** (player controls job postings via Town Crier mechanic).
- **FR-009**: On a system-managed board, the owning system (e.g., production order system, zone system) is the sole authority for posting and removing jobs. Player-initiated individual job changes on a system-managed board MUST be rejected.
- **FR-010**: On a user-managed board, player-issued changes (post job, remove job, reorder, modify) MUST be queued as pending changes and applied only when a Town Crier entity physically arrives at the board.
- **FR-011**: When a player issues changes to a user-managed board, a Town Crier entity MUST be dispatched from the seat of government, travel to the target board via pathfinding, and apply all pending changes on arrival.
- **FR-012**: Town Criers operate as a finite fleet. The colony has a limited number of Town Crier entities (defined by the number of Town Crier entities placed or spawned in the world). When a player update is issued, the system dispatches the first available Town Crier. A Town Crier carries all pending changes for its destination board at departure time. If additional changes arrive for the same board while a Town Crier is in transit, and another Town Crier is available, the new Town Crier departs with those additional changes. If no Town Crier is available, new changes are queued and picked up by the next Town Crier to become free. A single Town Crier can carry updates for multiple boards in one trip (visiting each in sequence) if dispatched with multiple pending destinations.
- **FR-013**: If the target board is destroyed before the Town Crier arrives, the Town Crier MUST return to base and the pending changes are discarded. A `jobboard.update.abandoned` event is emitted.
- **FR-014**: System MUST support pausing and resuming any job board. A paused board does not offer jobs to entities and does not re-post recurring jobs. Currently in-progress jobs (already claimed) continue to completion.
- **FR-015**: System MUST emit events for job board lifecycle: `jobboard.job.posted`, `jobboard.job.claimed`, `jobboard.job.completed`, `jobboard.job.abandoned`, `jobboard.update.applied` (when Town Crier updates a board), `jobboard.paused`, `jobboard.resumed`.
- **FR-016**: All job board state (postings, concurrency slots, pending Town Crier changes, pause status) MUST serialize to GameState (feature 006) and resume identically on load.
- **FR-017**: Each entity MUST have a designated home board (the board in its work zone, or the nearest board at last assignment). Entities check their home board first when seeking work. If the home board has had no suitable jobs for a configurable number of ticks (idle-threshold), the entity MAY seek other reachable boards as a fallback. Entities assigned to a zone with a board do not leave their zone's board indefinitely — they return to their home board as soon as it posts suitable work.
- **FR-018**: Job boards may be required by zone types (feature 015). A zone type definition may declare `requiresJobBoard: true`, which means a JobBoard entity must be present in the zone for its effects to activate.

### Key Entities

- **JobBoard**: An entity placed in the world. Maintains a list of JobPosting entries. Has a management mode (system-managed or user-managed) and a pause state. May be owned by a zone (system-managed) or by the player governance layer (user-managed). Serializable.
- **JobPosting**: A single entry on a JobBoard. Declares job type, concurrency (available slots), recurrence policy, familiarity tags, priority, and current status (available / partially-claimed / fully-claimed / suspended). Serializable.
- **TownCrier**: An entity spawned by the governance system when the player issues changes to a user-managed job board. Travels to the target board via pathfinding and applies pending changes on arrival. Despawns after delivering the update.
- **PendingBoardUpdate**: A queued set of changes (add/remove/reorder postings) waiting to be applied to a user-managed board. Carried by a Town Crier. Serializable.
- **JobClaim**: A record linking an entity to a JobPosting it has claimed. Contains entity ID, posting reference, claim time (tick), and status (in-progress / completed / abandoned). Enables slot tracking and recurrence.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An idle entity detects a job board, travels to it, and claims a suitable job within 1 game tick of arriving at the board (no multi-tick delay at the board itself).
- **SC-002**: Concurrency enforcement is airtight: in 100% of test cases, no job posting is claimed by more entities than its declared concurrency count.
- **SC-003**: Recurring jobs re-post within 1 tick of completion when the board is active.
- **SC-004**: Familiarity-based preference correctly directs occupation-matched entities to aligned jobs in 90%+ of scenarios where both familiar and unfamiliar jobs are available.
- **SC-005**: Town Crier travel time is proportional to board distance; a board 50 tiles away takes measurably longer to update than one 5 tiles away.
- **SC-006**: Board state (all postings, slots, pending updates, pause status, assigned Town Crier) is fully preserved through save/load with no job loss or duplication.
- **SC-007**: System-managed boards correctly pause when their owning zone deactivates and resume when the zone re-activates.
- **SC-008**: 20+ job boards active simultaneously on a single map with continuous job claiming and recurrence execute without performance degradation (<10ms per tick for all board evaluations).

## Clarifications

### Session 2026-05-03 (Cross-cutting: Diplomacy & Factions)

- Q: Are Town Criers also used to dispatch diplomatic messages to other factions? → A: No. Diplomatic dispatch uses a separate **Diplomatic Envoy** entity type (distinct from Town Criers). Town Criers are scoped to internal colony job board management only. The Diplomatic Envoy mechanism will be specified in a future diplomacy spec.

## Assumptions

- **Physical presence required**: Claiming work requires the entity to physically reach the board. There is no remote job assignment. This is intentional: board location, worker routing, and travel time are all meaningful.
- **Familiarity = occupation + experience tags**: An entity's familiarity with a job type is determined by: (1) occupation match (from feature 013), (2) accumulated experience tags gained from completing jobs. Both are checked; occupation is the primary signal.
- **Seat of government is a defined location**: The Town Crier spawns from a specific entity or location designated as the seat of government (e.g., a Town Hall entity). If no seat of government exists, user-managed board updates are rejected until one is placed.
- **Town Crier fleet is finite**: The colony has a limited number of Town Crier entities. Town Criers are real entities in the world (placed or spawned, like any other). A Town Crier that is traveling cannot simultaneously carry a new dispatch until it completes its current trip and returns. New player updates queue up and are carried by the next available Town Crier. A single Town Crier trip carries all pending changes accumulated since its last departure.
- **Home board determines cross-board fallback**: Each entity has a home board. Cross-board seeking is a fallback, not the default. The idle-threshold (number of ticks with no suitable home board work before fallback kicks in) is a game balance constant.
- **Boards are not connected across maps**: Job boards are map-local. An entity on Map A cannot claim jobs from a board on Map B without physically traveling to Map B first.
- **System-managed boards are owned by zones or production orders**: The source of truth for a system-managed board is the zone or production order system. The board's posting list is derived from the zone's active production orders and requirements.
- **Job type registry exists**: Job types (bake.bread, haul.materials, patrol.perimeter, etc.) are an open set registered with the job system. This spec does not define the full job type registry; it assumes one exists and job postings reference job type IDs.
