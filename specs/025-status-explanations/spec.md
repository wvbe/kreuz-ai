# Feature Specification: Status Explanations & Production Flow

**Created**: 2026-10-05
**Input**: User description: "Every stalled thing explains itself: idle citizens, stopped workstations and unhauled piles show a one-line reason, plus an Anno-style flow view of goods produced and consumed per day, so casual players always know why nothing is happening."

## User Scenarios & Testing

### User Story 1 - Every Stalled Subject Exposes a Machine-Readable Reason (Priority: P1)

The engine keeps a **status** for every subject that can stall: citizens (adult humanoids with a task queue, spec 003), job postings (spec 017), job boards (spec 017), workstations (spec 014), construction and deconstruction sites (spec 016), zones (spec 015), loose piles (materials dropped on the ground, spec 016 FR-003/FR-005/FR-014), standing orders (spec 026) and dwellings with their households (spec 029). A status is one of three states (`StatusState` enum: Active, Idle, Blocked). Idle means nothing has been asked of the subject (a citizen with no work, a workstation with no orders). Blocked means something has been asked of it but cannot go ahead. Every Idle or Blocked status carries at least one `BlockedReason`: a fixed `BlockedReasonKind` enum value plus a small set of integer and content-ID parameters (e.g. `MissingInput { materialId: "flour", required: 2, available: 0 }`). The engine works out these reasons from game state. It never produces display text; the renderer turns them into words.

**Why this priority**: This is the whole point of the feature. If the engine cannot say _why_ a subject is stalled in a structured form, the renderer has nothing to show and headless tests cannot check it. Every other story builds on this one.

**Independent Test**: Headlessly, set up a Bakery with an Oven and a `bake_bread` production order but no flour anywhere. Advance past the grace period (FR-006), query the Oven's status, and check that it is `Blocked` with primary reason `MissingInput { materialId: "flour" }`. Add flour to a reachable chest, let a baker start, and check that the status turns `Active`.

**Acceptance Scenarios**:

1. **Given** an Oven with an active `bake_bread` order and no flour reachable anywhere, **When** its status is queried after the grace period, **Then** the state is `Blocked` and the primary reason is `MissingInput { materialId: "flour", required: 2, available: 0 }`.
2. **Given** an adult citizen with an empty task queue whose home board has no suitable jobs (spec 017 FR-017), **When** its status is queried, **Then** the state is `Idle` with reason `NoJobsAvailable { jobBoardId }`.
3. **Given** an adult citizen with no reachable job board on its map, **When** its status is queried, **Then** the state is `Idle` with reason `NoReachableJobBoard`.
4. **Given** a loose pile of 3 stone blocks dropped by deconstruction, and no storage anywhere accepts stone, **When** its status is queried, **Then** the state is `Blocked` with reason `NoStorageDestination { materialId: "stone_block" }` (the same condition that emits `storage.no-compatible-destination`, spec 018 FR-015).
5. **Given** a construction job waiting for a Hammer that does not exist anywhere (spec 016 US3 scenario 3), **When** its status is queried, **Then** the reason is `MissingTool { tag: "hammer" }`.
6. **Given** a workstation whose job board the player has paused, **When** its status is queried, **Then** the state is `Blocked` with reason `Paused { jobBoardId }`, and this reason shows up with no grace period.
7. **Given** a subject that is Active (a crafter mid-craft, a hauler walking to a chest), **When** its status is queried, **Then** the state is `Active` and the reason list is empty.

---

### User Story 2 - One Primary Reason, Chosen Deterministically (Priority: P1)

A subject is often stalled for more than one reason at once. Say a workstation is in an inactive zone, has no input and has no qualified worker. The engine lists every reason that applies, sorted by one fixed precedence order (FR-004). The first reason is the **primary reason**, which the renderer shows as the one-line explanation. The order puts the cause the player must fix first ahead of the causes that only matter after that. For example, "the Bakery is not enclosed" comes before "no flour".

**Why this priority**: Casual players read one line. If the line changes between equal states, or shows a symptom instead of the root cause, they end up more confused than with no line at all. The ordering must also be deterministic so that replays and scenario snapshots agree.

**Independent Test**: Headlessly, build a workstation that is at once in an inactive zone, missing its input, and without any qualified worker. Check that the reason list contains all three in precedence order, that the primary reason is `ZoneInactive`, and that two runs from the same seed give byte-identical status lists.

**Acceptance Scenarios**:

1. **Given** a workstation with reasons `MissingInput`, `ZoneInactive` and `NoQualifiedWorker`, **When** its status is queried, **Then** the reasons are ordered `ZoneInactive`, `NoQualifiedWorker`, `MissingInput` and the primary reason is `ZoneInactive`.
2. **Given** a recipe needing two missing inputs (flour and salt), **When** the status is queried, **Then** both `MissingInput` reasons are listed, ordered by their order in the recipe's `inputs` array (spec 014 FR-002).
3. **Given** the same save loaded twice and advanced the same number of ticks, **When** all statuses are serialized, **Then** the two results are identical.
4. **Given** a blocked subject whose primary reason is cleared while a lower-precedence reason still holds, **When** the status is re-evaluated, **Then** the subject stays Blocked and the next reason becomes primary.

---

### User Story 3 - Status Change Events and Grace Period (Priority: P1)

When a subject becomes Idle or Blocked, or its primary reason changes, the engine emits `status.blocked`. When it becomes Active again, or is removed from the world, the engine emits `status.unblocked`. To avoid flicker from short, normal waits (a hauler between two trips, a crafter walking to fetch inputs), a reason only counts once it has held continuously for a grace period (`statusGraceTicks`). The exception is a reason caused directly by a player command, such as `Paused`, which counts at once. Both events go through the event bus (spec 010) and are processed at the tick boundary in FIFO order.

**Why this priority**: Events let the renderer show notifications and update the idle/blocked list without polling. They also let other systems react, for example the Steward re-evaluating standing orders (spec 026) or milestones (spec 027). Without the grace period, the event stream would be noise.

**Independent Test**: Headlessly, subscribe to `status.**`. Make a workstation run out of input, advance `statusGraceTicks − 1` ticks and check that no event fired. Advance 1 more tick and check that `status.blocked` fired with the right subject, reason and `sinceTick`. Deliver the input and check that `status.unblocked` fires once crafting resumes.

**Acceptance Scenarios**:

1. **Given** a workstation that runs out of input at tick T, **When** the reason still holds at tick T + `statusGraceTicks`, **Then** `status.blocked` is emitted with `{ subject, state: Blocked, reason, previousReason: null, sinceTick: T }`.
2. **Given** a reason that clears before the grace period has passed, **When** the grace period would have expired, **Then** no event is emitted and the subject stays Active.
3. **Given** a blocked subject whose primary reason changes from `MissingInput` to `NoQualifiedWorker`, **When** the new reason has held for the grace period, **Then** `status.blocked` is emitted again with `previousReason` set to the old reason and `sinceTick` left unchanged (the subject has been stalled the whole time).
4. **Given** a blocked subject that becomes Active, **When** the tick boundary is processed, **Then** `status.unblocked` is emitted with `{ subject, previousReason, stalledTicks }`.
5. **Given** a blocked subject that is removed from the world (a pile hauled away completely, a cancelled construction job), **When** it is removed, **Then** `status.unblocked` is emitted with `removed: true` and the status record is discarded.

---

### User Story 4 - Production Ledger: Goods Produced and Consumed per Day (Priority: P1)

The engine keeps a **ProductionLedger**: integer counts of each material produced and consumed per game day, broken down by source (`FlowSource` enum: Recipe, Gathering, Deconstruction, Construction, NeedConsumption, HouseholdConsumption, Spoilage, Trade). The ledger is a rolling window of the last `ledgerWindowDays` complete game days plus the current partial day. Game days come from the tick count using the calendar helper of spec 001 FR-011. The ledger is part of game state, so it is saved and can be queried headless.

**Why this priority**: The flow view needs this data, and it answers the second question casual players ask: "am I making enough bread?". Recording it in the engine (instead of the renderer counting events) means it survives save/load and can be tested.

**Independent Test**: Headlessly, run a Bakery that bakes 6 bread per day while citizens eat 8 per day. Advance 3 game days. Query the ledger for `bread` and check that each complete day shows `produced: 6` (source Recipe), `consumed: 8` (source NeedConsumption) and a net of −2.

**Acceptance Scenarios**:

1. **Given** a recipe completion producing 4 plank from 2 wood_log, **When** `production.crafting.completed` is processed, **Then** the current day's ledger gains `plank produced +4 (Recipe)` and `wood_log consumed +2 (Recipe)`.
2. **Given** a construction job consuming 4 stone_block on completion (spec 016 FR-008), **When** it completes, **Then** the ledger records `stone_block consumed +4 (Construction)`.
3. **Given** 5 cheese expiring in a chest (spec 005 FR-021), **When** `inventory.item.expired` is processed, **Then** the ledger records `cheese consumed +5 (Spoilage)`.
4. **Given** `ledgerWindowDays` = 7 and the game reaching day 9, **When** the ledger is queried, **Then** it contains days 2–8 as complete days plus day 9 as the current partial day, and no older days.
5. **Given** a game saved mid-day, **When** it is loaded and advanced, **Then** the current day's counts continue from the saved values with nothing lost or counted twice.

---

### User Story 5 - Why-Chains Across the Production Graph (Priority: P2)

A `MissingInput` reason can point to the subject that _would_ produce the missing material, if that subject is itself stalled. The engine fills an optional `causeRef` on the reason with that producer's subject reference. The player can then follow the chain: "Oven: no flour → Mill: no grain → Farm Field: waiting for a worker". If nothing in the settlement can produce the material (no registered recipe whose workstation exists, and no gathering source), the reason carries `noProducer: true`, which the renderer shows as "nobody makes flour".

**Why this priority**: Root causes in production chains are often several steps away from the symptom. Chains turn "nothing is happening" into one action the player can take. P2 because single-step reasons already deliver most of the value.

**Independent Test**: Headlessly, set up Oven → Mill → Farm Field where the Farm Field's sow posting is unclaimed because every worker is busy. Ask for the Oven's explanation chain and check that it returns three linked statuses ending in `AwaitingWorker`.

**Acceptance Scenarios**:

1. **Given** an Oven missing flour and a Mill (the only flour producer) blocked on `MissingInput { materialId: "wheat" }`, **When** the Oven's status is queried, **Then** its `MissingInput { flour }` reason has `causeRef` pointing at the Mill's workstation subject.
2. **Given** a material with at least one Active producer, **When** a consumer is missing it, **Then** `causeRef` is null (supply is on its way; the consumer is waiting, not cut off).
3. **Given** a material with no producer of any kind in the settlement, **When** a consumer is missing it, **Then** the reason carries `noProducer: true` and `causeRef` is null.
4. **Given** a cycle in the production graph (A waits on B, B waits on A), **When** the explanation chain is requested, **Then** the chain stops at the first repeated subject and is never longer than `maxExplanationDepth` links.

---

### User Story 6 - Reason Badges and Idle/Blocked List in the Renderer (Priority: P2)

The React app (spec 024) shows a small badge over every Blocked or Idle subject on the map. The badge icon depends on the primary `BlockedReasonKind`. The subject's inspection panel (spec 024 FR-007) starts with the one-line reason, written in modern English because it is a system message (spec 024 clarification), plus a "why?" link that opens the explanation chain. A single **Idle & Blocked** list collects every stalled subject, groups them by reason kind, sorts them by stalled time, and centres the camera on a subject when the player clicks it.

**Why this priority**: This is how casual players actually see the engine data. P2 because the engine part (US1–US4) can be tested and is useful headless without it.

**Independent Test**: Load a scenario with 3 idle citizens, 2 blocked workstations and 1 unhauled pile. Open the Idle & Blocked list and check that it shows exactly 6 entries, each with a one-line reason that mentions the right material or board name. Click one and check that the camera centres on it.

**Acceptance Scenarios**:

1. **Given** a workstation blocked on `MissingInput { materialId: "flour" }`, **When** it is visible on the map, **Then** a missing-input badge is drawn above it, and its inspection panel's first line reads like "Waiting for flour — none in storage".
2. **Given** a reason with parameters that reference content IDs or entities, **When** the line is shown, **Then** the IDs are shown as display names and are links (spec 024 FR-008).
3. **Given** the Idle & Blocked list is open, **When** a subject becomes Active, **Then** it leaves the list within one simulation tick (spec 024 SC-003).
4. **Given** a subject whose primary reason has a `causeRef`, **When** the player clicks "why?", **Then** the full chain is shown, one line per link, each line a navigable link.

---

### User Story 7 - Anno-Style Flow View (Priority: P2)

The player opens a **Flow** view showing one row per material that has had any flow in the ledger window. Each row shows: produced per day, consumed per day and the net balance (averaged over complete days), current stock, days of supply (stock ÷ net deficit, shown only when net is negative), a small trend over the window, and the material's producer subjects with their status. Rows with a deficit come first. Clicking a row opens a breakdown by `FlowSource`, and clicking a producer jumps to that subject.

**Why this priority**: This is the second half of the user's request. It lets a player see a coming shortage before anything stalls. P2 because it only reads data that US4 and US1 already provide.

**Independent Test**: Load a scenario where bread production is 6/day, consumption 8/day and stock 10. Open the Flow view and check that the bread row shows +6, −8, net −2, stock 10, about 5 days of supply, and comes before every row with zero or positive net.

**Acceptance Scenarios**:

1. **Given** the ledger and stock above, **When** the Flow view opens, **Then** bread shows net −2/day and 5 days of supply.
2. **Given** a material with positive net, **When** shown, **Then** days of supply is left out (shown as "surplus") instead of an infinite or negative number.
3. **Given** a bread row, **When** the player expands it, **Then** produced and consumed are broken down by `FlowSource` (e.g. consumed: NeedConsumption 7, Spoilage 1).
4. **Given** a producer workstation listed under a row, **When** it is Blocked, **Then** its badge and one-line reason are shown inline.

---

### User Story 8 - Status Notifications (Priority: P3)

When a subject has been Blocked longer than a notification threshold, the renderer may show a short toast. Toasts are throttled and grouped (e.g. "3 workstations waiting for flour"), so a single shortage does not flood the screen.

**Why this priority**: Nice to have. The list and badges already cover the need.

**Independent Test**: Make 3 workstations block on the same missing material within one game hour. Check that one grouped toast appears, not three.

**Acceptance Scenarios**:

1. **Given** 3 subjects blocked on `MissingInput { flour }` within the same throttle window, **When** their `status.blocked` events arrive, **Then** one grouped toast is shown.
2. **Given** the player has turned notifications off for a reason kind, **When** a matching event arrives, **Then** no toast is shown (the badge and list still update).

---

### Edge Cases

- What happens to a citizen who is eating, sleeping or socialising (spec 013)? → It is `Active`. Satisfying a need is not stalling. Idle applies only when the task queue is empty and no need-driven behaviour is running.
- What happens to a citizen waiting at an assigned board (spec 017 US7 scenario 4)? → `Idle` with `NoJobsAvailable { jobBoardId }` for its home board.
- What happens to a citizen standing at a workstation waiting for inputs (spec 014 US8 scenario 4)? → The citizen is `Blocked` with the same `MissingInput` reason as the workstation, and `causeRef` points to the workstation subject.
- What happens to a hauler holding material it cannot store (spec 018 US5 scenario 4)? → The hauler is `Blocked` with `NoStorageDestination { materialId }`. The material is in the hauler's inventory, not on the ground, so no pile subject exists for it.
- What happens when a crafter has finished but output space is full (spec 014 edge case, `production.output.blocked`)? → The workstation and the crafter are both `Blocked` with `OutputBlocked { materialId }`.
- What happens when the target board of a user-managed change has no Town Crier free (spec 017 FR-012)? → The job board is `Blocked` with `AwaitingTownCrier { townCrierId: null, pendingChanges }`. While a crier is on its way, `townCrierId` is that crier's ID.
- What happens when there is no seat of government, so user-managed updates are rejected (spec 017 Assumptions)? → The job board is `Blocked` with `NoSeatOfGovernment`.
- What happens when a job board itself is unreachable (spec 017 edge case: behind walls with no door)? → Each posting on it is `Blocked` with `Unreachable { entityId: jobBoardId }`. Citizens who would use it see `NoReachableJobBoard`.
- What happens when no entity in the world meets a job's prerequisites (spec 016 edge case: no adult humanoids; or a recipe skill minimum nobody meets, spec 014 FR-018)? → `NoQualifiedWorker`, with optional `skillId` and `requiredLevel` when a skill threshold is the cause.
- What happens when a posting is claimable but nobody claims it, because every worker is busy? → After the grace period it is `Blocked` with `AwaitingWorker { postingRef }`. This is different from `NoQualifiedWorker`: workers exist but are busy elsewhere.
- What happens when a subject that is already stalled is loaded from a save? → Its status is re-evaluated on load (FR-012). If the primary reason is unchanged, `sinceTick` is kept and no event is emitted.
- What happens when a material's flow comes only from trade or from deconstruction yields? → It is recorded under `Trade` or `Deconstruction` and shown in the Flow view like any other source.
- What happens when a material is moved between storage containers? → Moving is neither production nor consumption. The ledger does not count hauling, transfers or wages.
- What happens to a dwelling that is not upgrading (spec 029)? → The Dwelling subject is `Idle` with `DwellingRequirementsUnmet` when only next-level requirements are unmet, and `Blocked` when a current-level requirement is unmet (the dwelling is at risk of downgrade). A dwelling at the highest level with its current requirements met is `Active`. The per-requirement current and required values come from the spec 029 FR-019 requirement status query, not from this spec.
- What happens to a standing order when no Steward holds office (spec 026)? → The StandingOrder subject is `Blocked` with `NoSteward`. A paused order is `Blocked` with `Paused { standingOrderId }`.
- What happens with the ledger on a game shorter than one day? → Only the current partial day exists. Per-day averages use complete days only, so the Flow view shows "—" until the first day completes.

## Requirements

### Functional Requirements

- **FR-001**: The engine MUST keep a status for every subject of the kinds in the `StatusSubjectKind` enum: Citizen, JobPosting, JobBoard, Workstation, ConstructionSite, Zone, LoosePile, StandingOrder, Dwelling. A subject reference is `{ kind: StatusSubjectKind, entityId: integer }`, extended with `postingId: integer` for JobPosting. A StandingOrder is not an entity (spec 026 FR-001); its reference is `{ kind: StandingOrder, orderId: integer }` with no `entityId`. A Dwelling subject is the dwelling zone entity (spec 029 FR-004) and stands for its household as well. Citizen means an adult humanoid entity with a TaskQueue (spec 003 FR-006). ConstructionSite covers both ConstructionJob and DeconstructionJob (spec 016 FR-002/FR-003).
- **FR-002**: Each status MUST hold: `state` (`StatusState` enum: Active, Idle, Blocked), `reasons` (an ordered array of `BlockedReason`, empty when Active), and `sinceTick` (integer tick at which the current non-Active state began). Idle applies only to Citizen (no work), Workstation (no production order or recurring posting, reason `NoOrders`) and Dwelling (only next-level requirements unmet, reason `DwellingRequirementsUnmet`). For every other kind, a non-Active state is Blocked.
- **FR-003**: `BlockedReason` MUST be `{ kind: BlockedReasonKind, params, causeRef: StatusSubjectRef | null }`. The `BlockedReasonKind` enum (spec 023 FR-005) and its params are:
  - `Paused { jobBoardId?, constructionJobId?, standingOrderId? }` — board paused (spec 017 FR-014), construction job paused (spec 016 FR-014) or standing order paused (spec 026 FR-005).
  - `NoSeatOfGovernment {}` — no Throne Room with a Throne (spec 017 FR-011).
  - `NoSteward {}` — StandingOrder only; no Steward holds office, so the daily review is skipped (spec 026 FR-014).
  - `LockedByTier { contentKind, contentId, requiredTier }` — the subject asks for content whose `unlockTier` is above the current settlement tier: a standing order, production order or posting for locked content loaded from a scenario or save, or a dwelling whose next level is tier-locked (spec 029 FR-007 `TierUnlocked`). `contentKind` is the spec 027 `LockedContentKind`, `requiredTier` a spec 027 `SettlementTier` value. New commands for locked content are rejected with spec 027 `ContentLockedError` and never become a status.
  - `ScopeZoneMissing { zoneId }` — StandingOrder only; the order's scope zone no longer exists (spec 026 US5 scenario 3).
  - `ZoneRequirementsUnmet { gaps: ZoneRequirementGap[] }` — on a Zone subject. `ZoneRequirementGap` is `{ kind: ZoneGapKind (enum: NotEnclosed, TooSmall, MissingFurniture, MissingJobBoard), furnitureId?, required?, present? }`, built from the requirement gap structure of spec 015 FR-017 (requirement evaluation per spec 015 FR-007).
  - `ZoneInactive { zoneId }` — the subject depends on an inactive zone; `causeRef` points at the Zone subject.
  - `MissingWorkstation { workstationTag }` — spec 014 FR-003, spec 017 edge case "required workstation destroyed".
  - `MissingRoom { zoneTypeId }` — the recipe requires its workstation to stand in a zone/room of this type and it does not (spec 014 FR-003, US4 scenario 2).
  - `LocationBlocked {}` — construction target no longer buildable (spec 016 edge cases).
  - `Unreachable { entityId }` — the target (board, site, source, pile, workstation) cannot be reached by pathfinding (spec 012) from any eligible worker, or, for a Citizen, from the citizen itself. Reachability (and, where used, minimum path cost) depends only on the adjacency graph and integer costs, never on tie-breaking between equal-cost paths, and draws nothing from the PRNG (FR-008).
  - `NoReachableJobBoard {}` — Citizen or StandingOrder; no job board reachable on its map (for a StandingOrder: no reachable user-managed board, spec 026 FR-025).
  - `NoQualifiedWorker { skillId?, requiredLevel? }` — no entity in the world meets the job prerequisites (adult humanoid, recipe skill minimum).
  - `MissingTool { tag }` — required non-consumed tool not available anywhere (spec 016 FR-006).
  - `MissingInput { materialId, required, available, noProducer }` — recipe input (spec 014 US2 scenario 4) or construction material (spec 016 US2 scenario 3) not available in reachable storage. `required`/`available` are integer quantities; `noProducer` is a boolean (US5).
  - `NoHouseholdStorage {}` — Dwelling only; the level demands supplied goods but the dwelling has no storage furniture (spec 029 FR-009).
  - `NoStorageDestination { materialId }` — the condition behind `storage.no-compatible-destination` (spec 018 FR-015).
  - `OutputBlocked { materialId }` — the condition behind `production.output.blocked` (spec 014 FR-011).
  - `AwaitingTownCrier { townCrierId: integer | null, pendingChanges: integer }` — JobBoard with pending user-managed changes (spec 017 FR-010/FR-012), or StandingOrder whose queued postings are waiting for delivery (spec 026 FR-025).
  - `AwaitingWorker { postingRef }` — a claimable posting nobody has claimed.
  - `NoJobsAvailable { jobBoardId }` — Citizen only; home board (spec 017 FR-017) has no suitable job, and no fallback board has one either.
  - `DwellingRequirementsUnmet { targetLevel, unmet: DwellingRequirementKind[] }` — Dwelling only; the requirements of `targetLevel` (the next level, or the current level when at risk) that are unmet, in spec 029 FR-007 kind order. Current and required values are read from the spec 029 FR-019 requirement status query. This is the engine's answer to "why hasn't this house upgraded?".
  - `NoOrders {}` — Workstation only; nothing has been asked of it.

  New reason kinds are added by amending this list. Every parameter is an integer, boolean, entity ID, content ID string or fixed enum value (spec 023 FR-005); there are no free-text fields.

- **FR-004**: The `reasons` array MUST be sorted by this fixed precedence (earlier = more fundamental): Paused, NoSeatOfGovernment, NoSteward, LockedByTier, ScopeZoneMissing, ZoneRequirementsUnmet, ZoneInactive, MissingWorkstation, MissingRoom, LocationBlocked, Unreachable, NoReachableJobBoard, NoQualifiedWorker, MissingTool, NoHouseholdStorage, MissingInput, NoStorageDestination, OutputBlocked, AwaitingTownCrier, AwaitingWorker, NoJobsAvailable, DwellingRequirementsUnmet, NoOrders. Ties within one kind are broken by the source order of the item that caused them (recipe `inputs` order, construction material list order, gap order), then by ascending entity ID. `reasons[0]` is the **primary reason**.
- **FR-005**: The owning systems MUST report their stall conditions to the status system as `BlockedReason` values: crafting (spec 014), construction (spec 016), job boards and Town Criers (spec 017), hauling and storage (spec 018), zones (spec 015), standing orders and the Steward (spec 026), dwellings and household fetch chores (spec 029). The free-text "reason" strings currently mentioned in those specs (e.g. "missing materials: Stone", "requires Forge") are expressed as these kinds. The status system only gathers and orders them; it does not re-derive another system's rules.
- **FR-006**: A non-Active state or a new primary reason MUST be **settled** before it is published (events and the `settled: true` flag on query results). A change settles once it has held continuously for `statusGraceTicks` ticks (engine constant, default 12 = one game hour, spec 001). `Paused`, `NoSeatOfGovernment`, `NoSteward`, `LockedByTier`, `ScopeZoneMissing` and `NoOrders` settle at once. StandingOrder and Dwelling subjects are evaluated by their owning systems once per game day (spec 026 FR-008, spec 029 FR-006), so their reasons settle at once when reported. Unsettled status is still queryable, flagged `settled: false`.
- **FR-007**: The engine MUST emit `status.blocked` when a subject's non-Active state first settles and whenever its settled primary reason changes. The payload is `{ subject, state, reason, previousReason: BlockedReason | null, sinceTick }`. The engine MUST emit `status.unblocked` when a settled non-Active subject becomes Active or is removed from the world, with payload `{ subject, previousReason, stalledTicks, removed: boolean }`. Both go through the event bus (spec 010 FR-009) and may be subscribed to with `status.*`.
- **FR-008**: Status evaluation MUST run once per tick at a fixed point in the system order (after all simulation systems, before the event-queue boundary of spec 010). It MUST visit subjects in entity insertion order (spec 002 FR-007), then StandingOrder subjects in ascending `orderId`. It MUST be a pure function of game state and MUST NOT draw from the PRNG (spec 011). Implementations MAY re-evaluate only subjects whose inputs changed, as long as the result is identical to a full evaluation.
- **FR-009**: For `MissingInput`, the engine MUST resolve `causeRef` and `noProducer` as follows. The producers of material M are the Workstation subjects with an active production order or recurring posting for a recipe that outputs M (spec 014 FR-016), plus the JobPosting subjects whose job type lists M in its `outputs` (spec 022 FR-024). If any producer is Active, `causeRef` is null. Otherwise `causeRef` is the first non-Active producer in insertion order. If no producer exists, `noProducer` is true.
- **FR-010**: The engine MUST provide headless queries: `getStatus(subjectRef)`, `getStatuses({ state?, subjectKind?, reasonKind?, settledOnly? })` (insertion order), and `explain(subjectRef)`, which returns the chain of statuses reached by following `causeRef`. The chain stops at a subject already in it or after `maxExplanationDepth` links (engine constant, default 5).
- **FR-011**: The engine MUST keep a `ProductionLedger`: for each game day index (spec 001 FR-011 `toDay(tickCount)`), integer counts keyed by `(materialId, FlowDirection, FlowSource)`, where `FlowDirection` is an enum (Produced, Consumed) and `FlowSource` an enum (Recipe, Gathering, Deconstruction, Construction, NeedConsumption, HouseholdConsumption, Spoilage, Trade). The ledger MUST hold the last `ledgerWindowDays` complete days (engine constant, default 7) plus the current day. Days that fall out of the window MUST be dropped.
- **FR-012**: The ledger MUST be updated from these events at the tick boundary, in FIFO order: `production.crafting.completed` (Recipe: outputs produced, inputs consumed; spec 014 FR-011), `construction.job.completed` (Construction: materials consumed; spec 016 FR-010), `construction.job.completed` for a DeconstructionJob (Deconstruction: `yield` produced; spec 016 FR-010), `inventory.item.expired` (Spoilage; spec 005 FR-021), `jobboard.job.completed` for gathering job types (Gathering; spec 017 FR-015), `need.item.consumed` (NeedConsumption; spec 013 FR-023), `housing.goods.consumed` (HouseholdConsumption: supplied goods used up by households; spec 029 FR-009), and `trade.completed` where exactly one party belongs to the player settlement (Trade; spec 019 FR-010). Until spec 019 defines the player settlement as a trade party, a trade counts only when exactly one party's inventory is a Throne Room treasury container (spec 019 FR-003; see Assumptions). The day bucket is the day of the tick being processed. Hauling, transfers, wages and treasury payments MUST NOT be recorded.
- **FR-013**: The engine MUST provide `getLedger({ materialId?, fromDay?, toDay? })`, returning per-day counts, and `getFlowSummary(materialId)`, returning `{ producedPerDay, consumedPerDay, netPerDay }` as fixed-point ×1000 averages over complete days in the window (null when no complete day exists), `stock` (integer sum of that material across all storage furniture inventories, spec 018 FR-001, excluding household storage on dwelling tiles, spec 029 FR-017; spec 026 FR-006 builds its counted stock on this definition), `daysOfSupply` (fixed-point ×1000 `stock ÷ −netPerDay` when net is negative, else null), and `producers` (subject refs per FR-009).
- **FR-014**: Statuses (subject, state, reasons, `sinceTick`, settle progress) and the ProductionLedger MUST serialize to GameState (spec 006) as `statuses` and `productionLedger`, with only integers, booleans and string IDs. On load, statuses MUST be re-evaluated from current state. A subject whose re-evaluated primary reason equals the saved one keeps its `sinceTick` and settle progress and emits no event. A subject whose reason differs follows the normal settle rules from the load tick.
- **FR-015**: The engine MUST NOT produce display text for statuses. The renderer (spec 024) MUST map each `BlockedReasonKind` to one modern-English line template (spec 024 clarification: system messages), filling content IDs with display names from the registries (spec 022) and entity IDs with entity names.
- **FR-016**: The renderer (spec 024 FR-025) MUST draw a reason badge, chosen by the primary reason kind, over every settled Idle or Blocked subject that is visible on the map. It MUST show the one-line primary reason as the first line of the subject's inspection panel (spec 024 FR-007), with a "why?" control that shows `explain()` when the primary reason has a `causeRef`.
- **FR-017**: The renderer (spec 024 FR-026) MUST provide an Idle & Blocked list of all settled non-Active subjects, grouped by primary reason kind and sorted by `sinceTick` ascending within each group. Each entry is a navigable link that centres the camera on the subject (spec 024 FR-008).
- **FR-018**: The renderer (spec 024 FR-027) MUST provide a Flow view with one row per material that has non-zero ledger counts in the window. Each row shows produced/day, consumed/day, net/day, stock, days of supply (or "surplus"), a per-day trend over the window, and the material's producers with their status badges. Rows are sorted by net/day ascending (largest deficit first), then by material ID. Expanding a row shows the `FlowSource` breakdown. Material names link to the content browser (spec 024 FR-019).
- **FR-019**: The renderer (spec 024 FR-028) MAY show grouped, throttled toasts for `status.blocked` events (US8). Grouping is by `(subjectKind, reason kind, key content ID)`. The player MUST be able to turn toasts off per reason kind. Toast settings are renderer preferences, not game state.

### Key Entities

- **StatusSubjectRef**: `{ kind: StatusSubjectKind, entityId, postingId? }`, or `{ kind: StandingOrder, orderId }`. Identifies a citizen, job posting, job board, workstation, construction site, zone, loose pile, standing order or dwelling.
- **Status**: The derived condition of one subject: `state`, ordered `reasons`, `sinceTick`, settle progress. Serialized in `statuses`, re-evaluated on load.
- **BlockedReason**: `{ kind: BlockedReasonKind, params, causeRef }`. Machine-readable, no free text. `reasons[0]` is the primary reason.
- **ZoneRequirementGap**: One unmet zone requirement (`ZoneGapKind` + furniture ID and counts). Lets "the Bakery needs an Oven" be shown without the renderer evaluating zone rules again.
- **ExplanationChain**: The ordered list of statuses returned by `explain()`, following `causeRef` links, cycle-safe and depth-bounded.
- **ProductionLedger**: A rolling window of per-day integer counts per `(materialId, FlowDirection, FlowSource)`. Serialized in `productionLedger`.
- **FlowSummary**: The derived per-material view (averages, stock, days of supply, producers) that the Flow view and other systems (spec 026 Steward, spec 027 milestones) read. Not stored.
- **LoosePile**: The inventory-bearing ground entity created where spec 016 drops materials (deconstruction yield, cancelled-job returns). **Open question:** no spec yet defines the loose-pile prototype or which system posts the `haul.deliver` job for it. This spec assumes a pile is an entity with an Inventory component and a marker component, and that a `haul.deliver` posting targeting it exists while it holds material.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In 100% of the scenario-library stall cases (missing input, missing workstation, missing tool, paused board, inactive zone, no storage, no Town Crier, no qualified worker, all workers busy, unreachable target, no job board), the stalled subject reports a settled non-Active status with the expected primary reason within `statusGraceTicks` + 1 ticks.
- **SC-002**: Two runs from the same save and seed produce byte-identical `statuses` and `productionLedger` after 2,000 ticks.
- **SC-003**: For a settlement with 50 citizens, 30 workstations, 40 job postings, 20 construction sites, 15 zones and 50 loose piles, status evaluation costs under 2 ms per tick headless.
- **SC-004**: The ledger matches an independent count of the same events exactly (zero difference per material per day) over a 10-day scenario.
- **SC-005**: A save/load round trip mid-day loses or duplicates no ledger counts and emits no `status.*` events for subjects whose reason did not change.
- **SC-006**: In a play test, a first-time player shown a stalled workstation can name what is missing from the one-line reason alone, without opening another panel, in at least 9 of 10 cases.
- **SC-007**: From any stalled subject, the player reaches the root cause through the "why?" chain in at most 3 clicks for chains up to `maxExplanationDepth`.
- **SC-008**: The Flow view's net/day and days of supply match `getFlowSummary` exactly for every material shown.

## Assumptions

- **Status is derived, not authoritative**: Like zone requirement status (spec 015 FR-013), a status is worked out from game state. Only `sinceTick` and settle progress need saving, so that "stalled for 2 days" and event suppression survive a load. The whole record is saved anyway, for transparency (Constitution: State Transparency).
- **Grace period default of one game hour**: 12 ticks (spec 001: 5 game minutes per tick) is long enough to hide normal trips and short enough that a casual player sees a stall within a minute or two of real time at 1x. It is an engine constant, tunable without code changes.
- **Precedence reflects fix order**: The order in FR-004 puts first whatever the player must fix before the other causes even matter (a paused board makes missing flour irrelevant). It is a design choice, and only an amendment to this spec can change it.
- **Producers come from orders and postings, not from registry potential**: A recipe that exists in the registry but has no workstation or order is not a producer. That is exactly the case `noProducer: true` reports to the player.
- **Stock means storage furniture**: Material carried by haulers, staged at build sites (spec 016 FR-005) or locked in a workstation mid-craft (spec 014 FR-013) does not count as stock, matching spec 018's definition of storage. Household storage on dwelling tiles (spec 029 FR-017) is not settlement stock either. Spec 026 counts this stock plus in-flight goods for its own over-posting guard (spec 026 FR-006).
- **Ledger is settlement-wide**: One ledger covers all maps of the player settlement. Per-map or per-zone flow is out of scope.
- **Need consumption event**: NeedConsumption flow is recorded from `need.item.consumed { entityId, needId, materialId, quantity }` (spec 013 FR-023).
- **Gathering outputs**: Gathering job types (spec 022) report produced materials in the `outputs` array of `jobboard.job.completed` (spec 017 FR-015).
- **Trade attribution**: **Open question:** spec 019 has no notion of "the player settlement" as a trade party, so it is unclear which trades count as imports or exports. Until that is decided, the Trade source only records trades in which one party's inventory is a Throne Room treasury container (spec 019 FR-003).
- **Metrics beyond production flow stay on the roadmap**: The ledger covers material flow only. Wider metrics time series, graphs and heatmaps (docs/ROADMAP.md "Metrics & Visualizations") stay out of scope, although this ledger is a first concrete instance of them.
