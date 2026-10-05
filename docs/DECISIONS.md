# Kreuzvibe — Design Decisions (contract for implementers)

Status: authoritative. Written by task 0.2 under the owner's standing authority (greenfield; specs may be amended when contradictory or unbuildable; no owner review needed). Where this file and a `specs/*/spec.md` disagree, **this file wins**; normative spec text that changed carries an `Amended by DECISIONS.md D-nn` note. Task ids (1.x, 2.x ...) refer to `tasks/plan.md`.

Sections: 0 Conventions · 1 Decisions D-01..D-30 · 2 Tick pipeline · 3 Command catalogue · 4 Event catalogue · 5 Query facade (summary) · 6 Spec errata · 7 Descopes.

---

## 0. Conventions

| Topic | Rule |
|---|---|
| IDs | `EntityId`, `MapId`, `TaskId`, `PostingId`, `OrderId`, `OfferId`, `JobId`, `MomentId`, `ReservationId` = non-negative safe integer. Monotonic counters, never reused, persisted in root `counters` (D-05). Content IDs (materials, recipes, terrain ...) = lowercase snake_case `string` (open vocab, 023 FR-005). |
| JSON | `JsonValue = null \| boolean \| number(safe integer) \| string \| JsonValue[] \| {[k:string]: JsonValue}`. Event payloads, task data, command payloads are `JsonValue`-compatible. No `unknown`/`any` in game code except the Zod/JSON boundary (AD11). |
| Maps keyed by ids | Never serialize an object keyed by integer-like keys. Use arrays of records sorted ascending by id (`standing: [{factionId,value,tradeAgreement}]`). Object keys that are strings (material ids) are allowed but serialization MUST sort keys (stable stringify). |
| Enums | Closed sets are TS `enum` (023). Serialized as the enum's string value except `SpeedSetting` (numeric). Zod via `z.nativeEnum`. |
| Errors | Domain failures return `{ok:false, error:{code:ErrorCode,message}}` at the command layer; library functions throw typed `Error` subclasses (spec names: `InventoryFullError` ...). `ErrorCode` is a string enum, member names = spec error names (`ContentLockedError` -> `ContentLocked`). |
| Time | `tick` = `time.tickCount` (int). `ticksPerHour=12`, `ticksPerDay=288`, `daysPerWeek=7`, `daysPerMonth=28`, `monthsPerYear=12` (year = 336 days). `toDay(tick)=floor(tick/288)` 0-indexed (UI shows +1). `tickOfDay=tick mod 288`. Always use the constant, never literal 288. |
| Randomness | Only through `Prng` named streams (D-03). Stream registry (names are API): `world.gen`, `site.gen`, `identity.names`, `housing.immigration`, `diplomacy.ai`, `skill.output`, `content.traits`, `ai.risk`. Pure derivations (A*, claim ordering, dominantSkill, finest scan) use deterministic tie-breaks (lowest id / lexicographic), never a stream. |
| Iteration order | Entities: ascending EntityId (== insertion order, IDs monotonic). Posting/order/zone/offer lists: ascending id. Content registries: file order then id. |
| Fixed point | See D-04 table. Nothing but `number` safe integers in state. Division = `Math.trunc`/`floorDiv`/`ceilDiv` helpers (`src/game/engine/FixedPoint.ts`, task 1.x); never `/` on state values. |

---

## 1. Decisions

### D-01 Behaviour runtime without JS async (conflict 1; AD3)
- **Amends 003 FR-009/012/015, US async stories; 010 FR-012; 002/004/005/012/013/014 wherever `await` appears.**
- No `async`/`Promise`/`await` in `src/game`. `walkTo`, `craft`, `purchase` etc. are **task handlers**: serializable step machines.
- `TaskRecord = { id:TaskId, type:string, priority:int, status:TaskStatus, phase:string, data:JsonValue, parentId:TaskId|null, waitFor:WaitCondition|null, createdTick:int, token:CancelToken|null }`.
  - `TaskStatus = Pending | Running | Waiting | Completed | Cancelled | Failed`.
  - `WaitCondition = {kind:Event, pattern:string, matchKey:string|null, matchValue:JsonValue} | {kind:ChildTask, taskId} | {kind:UntilTick, tick:int}`. `matchKey/matchValue` = optional top-level payload field equality (replaces `waitFor(predicate)`). The task system subscribes to patterns of `Waiting` tasks after load (subscriptions are never serialized).
  - `CancelToken = {category:Graceful|Ungraceful, reason:string}` (reasons: `entity_deleted`, `interrupted_by_priority`, `player_cancel`, `component_removed`, `unreachable`).
- `TaskHandler = { type; start(ctx,data):StepResult; step(ctx,record):StepResult; cancel(ctx,record,token):void }`; `StepResult = Continue | Wait(WaitCondition) | Done | Fail(reason)`. Handlers registered by `type` in a per-engine `TaskHandlerRegistry` (no giant switch). A handler may `ctx.spawnChild(type,data)` and `Wait(ChildTask)`; sequential "await chains" = one parent task with `phase` advancing as children finish.
- `TaskQueue` component: `{ tasks: TaskRecord[] (pending+current, ascending id), history: {taskId,type,outcome,tick}[] (capped `taskHistoryCapacity`=8) }`. One task `Running` per entity. Each tick the entity's highest-priority runnable task (priority desc, id asc) runs **one `step`**. A strictly higher-priority arrival cancels the running task with `Graceful interrupted_by_priority` at the next step boundary (handler rolls back, e.g. 014 FR-013a); changing the priority of a running task never interrupts it. `interrupt(entity)` = cancel running + clear pending. Entity deletion: `Ungraceful entity_deleted` to all; waiting parents fail.
- Required component removed mid-task: task `Fail('component_removed')`, never throws in the loop. Prototype serialization (003 US1 AC4) removed (D-05).
- Event: `task.finished` (4).

### D-02 Event bus (conflict 2; spec 010) — implemented by task 0.4
- `emit(topic,payload)` queues `{name,payload,depth}`; `processQueue()` drains FIFO at pipeline slot 20 and at `flush()`. **Amends 010 FR-011:** delivery set is resolved **when the event is processed**: every subscriber registered at that moment and matching receives it (including subscribers registered after emit, or after `load`). Matching subscribers are called in **global registration order** (exact and wildcard interleaved by subscription handle). A subscriber unsubscribed before its turn is skipped. `once` subscriptions are removed before invocation.
- `tick.begin {tick}` is emitted and **flushed immediately** at slot 0, so the queue is empty when systems start. 010 SC-001 holds at both ends of the tick.
- Depth: an event emitted outside any handler has depth 0; emitted while processing an event of depth `d` has depth `d+1`. `maxEventDepth = 16`; emit with depth > 16 is **not queued** and reported to the error sink with `kind: EventBusErrorKind.DepthExceeded`.
- **`waitFor`/Promise removed** (D-01).
- `subscribe(pattern, handler, options?:{once?:boolean}) : SubscriptionHandle` (positive int); `unsubscribe(handle)`. 010 FR-008's `(name, callback)` form removed.
- Subscriber exceptions are caught and passed to the injected `EventBusErrorSink(report: {kind: EventBusErrorKind, topic, message})`; processing continues. No `error.system-failed` event. The bus's own default sink ignores reports; `GameEngine` (1.8) injects a sink that collects to an inspectable array (`engine.errors`).
- Names: dot-separated lowercase kebab segments `[a-z0-9]+(-[a-z0-9]+)*`; wildcards `*` (exactly one segment) and `**` (one or more) only as the **last** segment; `inventory.**` does not match `inventory`. Invalid names/patterns throw `EventBusError` at emit and subscribe. A bare `*` or `**` pattern is allowed (global listener).
- Serialized: `EventBusState = { queue: {name:string, payload:JsonValue, depth:int}[] }` at root key `eventQueue`. Subscriptions never serialized. Payloads are deep-copied on emit by `cloneEventPayload`, which throws `EventBusError` for non-JSON values and for numbers that are not safe integers (Constitution II). API (all in `src/game/engine/EventBus.ts`): `EventBus` {`emit`, `subscribe`, `unsubscribe`, `processQueue`, `getQueue`, `serialize`, `restore`}, `isValidEventName`, `isValidEventPattern`, `eventNameMatches`, `isEventOf`, types `JsonValue`, `GameEvent`, `EventHandler`. There is no separate `flush()`: call `processQueue()`. Re-entrant `processQueue()` is a no-op.
- Emits outside a tick (bootstrap, command handlers between ticks) are queued and delivered at the next `processQueue()`/`flush()`.

### D-03 PRNG (conflict 2; spec 011; AD6) — implemented by task 0.3
- Algorithm PCG32 XSH-RR (O'Neill reference; multiplier `6364136223846793005`, default increment `1442695040888963407` is **not** used — each stream has its own odd `inc`). 64-bit values held as `[hi:uint32, lo:uint32]` pairs; arithmetic with 32-bit halves (no BigInt in the hot path).
- `Prng` (root): holds `seed` (0..2^32-1) and a name->stream registry. `stream(name): PrngStream` get-or-create **and persisted**; replaces `derive()`. Stream initial state = PCG seeding from four uint32 words derived from `(seed, fnv1a32(name))` (see golden note below); independent of how many values other streams or the root drew; two streams with different names differ.
- `PrngStream` integer API only: `nextU32()`, `nextInt(min,max)` (inclusive, unbiased rejection sampling), `chancePermille(p)` (0..1000, true with probability p/1000), `choice(array)`, `weighted(options, weights)` (positive integer weights, sum <= 2^32; draws in `[0,sum)`; fractional weights are NOT supported — callers convert to permille), `shuffle(array)` (in place, Fisher–Yates descending). `random()` float removed. Also `nextBelow(range)` (unbiased `0..range-1`). Validation errors: `PrngError` with clear messages (empty array, min>max, non-integer, negative/zero-sum weights, length mismatch).
- `Prng.create({seed?, entropy?})`: if no seed supplied, `entropy()` (must return a uint32) is called **exactly once**; the result is recorded in `initOptions.seed`. `GameEngine` receives `entropy` by injection (default in CLI/React host = host-side randomness; tests inject a constant).
- `setSeed(seed)` (tests/debug only): re-seeds; every existing stream is re-initialised from the new seed (same name -> same new sequence).
- `PrngState = { seed:int, streams: Record<name, {state:[int,int], inc:[int,int]}> }` (keys sorted by name) at root key `prng`. `serialize()/Prng.fromState()` exact round trip (a stream resumes mid-sequence).
- Pathfinding does not use the PRNG (D-21). 011 FR-016 fractional weights and `randomBool(float)` removed. 011 SC-005 (<1 KB) is relaxed to "<= 100 bytes per stream".
- Golden vectors committed in `Prng.test.ts`: the official PCG32 demo (initstate 42, initseq 54) and seed 12345/stream `main` plus a 1e6-draw checksum. Stream init uses a murmur3-fmix32/FNV-1a-32 word chain (not FNV-64); `PrngStream.fromInit(initState, initSeq)` is the reference seeding.

### D-04 Numeric conventions, currency, speed, calendar
Single table; "stored" is what appears in state/saves.

| Quantity | Stored as | Authored / displayed | Notes |
|---|---|---|---|
| Item quantities (all materials incl. currency) | plain integer count | integer | **Not** milli. `silver_penny` quantity 1 = one coin. |
| Stack limit, slot count, duration, ticks | int | int | durations in ticks |
| Material `value` (price) | milli-coins (`valueMilli`) | decimal coins (5 or 0.5) | price math in milli; settled to whole coins via `ceilDiv(x,1000)` |
| Wages, rent, gifts, treasury balance, prices paid | whole coins (int) | whole coins | "keep x1000 internally" applies to price/valuation math only; coin *holdings* are whole items |
| Material `weight`, inventory `weightLimit` | milli-units (`weightMilli`) | decimal | 022 authored "200" limit => 200000 |
| Perishable remaining time | milli-ticks (x1000) | ticks | decay per tick = `decayRateMilli` (1000 = normal) |
| Decay multipliers, price multipliers, margins, probabilities, ratios | permille (1000 = 1.0) | decimal | e.g. `priceMultiplier` 1000, `minimumMarginRate` 100, `bynameChance` 850 |
| Needs, mood, skills (0..100 scale) | milli-percent: `0..100000` | percent | 20% critical => 20000; skill level = `floor(v/1000)` |
| Relationship affinity, faction standing | affinity `-100000..100000`; standing plain `-100..100` int | | standing is an integer by 021 FR-007 |
| Mood→risk map | `p‰ = clamp(200, 800, 200 + floor((M-10000)*3/400))` | | M = mood milli-percent; M=50000 -> 500 exactly |
| Speed | `enum SpeedSetting { Quarter=250, Half=500, Normal=1000, Double=2000, Quadruple=4000 }` serialized as the number | | 001 FR-004 set; AutoRunner delay `= floorDiv(tickIntervalMs*1000, speed)`; `tickIntervalMs` int >=1, default 6250 |
| Terrain move cost | int per cell entry: fastest 5, fast 7, normal 10, slow 15, very slow 25 | classes in 022 | min step cost 5 |
| Movement speed | `moveSpeed` int per tick (default 10 = one normal cell/tick) | | `progress += moveSpeed; while progress>=cost: step; progress-=cost` |

Combine rule for multipliers: 027 FR-014 verbatim (`sign*trunc(|b|*m/1000)`, min magnitude 1). Content decimals -> fixed-point at load per 006 FR-014 using a per-field scale declared in the Zod schema (`milli`/`permille`/`int`).

### D-05 Save format, ID counters, root keys, versioning, geometry (conflicts 3, 10; AD9)
- Root keys (authoritative, **amends 006 FR-004/004a, US1 AC1**): `version, timestamp, time, prng, eventQueue, initOptions, counters, systems, statuses, productionLedger, stewardship, entities, maps`.
  - `counters = { nextEntityId, nextTaskId, nextMapId, nextPostingId, nextClaimId, nextOrderId(production), nextOfferId, nextReservationId, nextJobId, nextMomentId, nextZoneEventId }` all ints. (`stewardship.nextOrderId` is separate.)
  - `systems = { [systemId:string]: JsonValue }`: global per-system state without an owning entity (reservations, zone merge offers, trader visits, pending wage payments, difficulty cache ...). Keys sorted. Each system owns one key and one Zod schema.
  - Component-borne (not root): SettlementProgress, SettlementChronicle, Identity, Dwelling, Citizen.home*.
- `timestamp`: injected by host via `save({timestamp})`; engine default `"1970-01-01T00:00:00.000Z"`; excluded from equality (006 FR-006a). No `Date` in `src/game`.
- Version: `CURRENT_SAVE_VERSION = 1`. A v0 fixture exists in tests only (migration chain `0->1` renames difficulty normal/hard -> steady/harsh and adds `counters`). Errors: `InvalidSaveFormatError`, `UnsupportedSaveVersionError` (newer).
- `load` unknown fields: root and component records are Zod `.strict()` -> reject; `initOptions` unknown fields are ignored (007). Unknown content ids (terrain/material/prototype) -> `InvalidSaveFormatError` naming file/path.
- Prototypes and registries are never serialized (003 vs 006); content pack is supplied to `new GameEngine(content)`.
- Maps: `{ id, gridType, width?, height?, params:{generator:string, seed:int, cellCount?:int, relaxPasses?:int}, cells:[{terrain}] }`. **Voronoi geometry (sites, Delaunay, polygons, adjacency, centroids) is a pure integer function of `(params)` regenerated on load** (sites in `[0,65535]^2`, exact predicates with BigInt in the builder, integer Lloyd). Terrain edits live in `cells`. Cell order and `neighbors(cell)` order (ascending cellIndex) identical on both grid kinds. Delaunay lib: implemented in-house (no float).
- `save()` is read-only: no task cancellation (006 assumption removed); in-flight tasks serialize as records (D-01). Save requested mid-tick is queued to the end of the tick (`SaveGame` is an Immediate command only legal between ticks).
- Byte-for-byte: `save()` = stable stringify (sorted object keys, arrays preserved), no `-0`, no non-integers (validated).
- Position component `{mapId, cellIndex}` is the sole location source; occupant index is derived and rebuilt on load.

### D-06 Engine bootstrap (conflict 3; spec 007)
- `new GameEngine(content: ContentRegistries, deps?:{entropy, errorSink})`; **instance** methods `newGame(options?)`, `loadGame(save)`. Both validate/parse fully into a temporary state, then swap; failure leaves the current state untouched (replaces `OutOfMemoryError`, which is dropped). Static `GameEngine.newGame` removed. Registries are per-engine (AD8).
- Method names (amend 007 FR-016): `getTime()`, `getState()` (readonly snapshot view, not live), `getEntity(id)`, `getEntities()`, `getMap(id)`, `getComponents(id)`; `save()`/`loadGame()`; `tick()`. `getGameTime` removed.
- "Starting entity counts" option removed. **FR-017 removed**: bootstrap requires the government faction prototype; missing -> `ContentValidationError`.
- `newGame` with no map options yields exactly one entity (government faction). With `mapSize` it additionally runs the world generator (2.1) which places: main map, a starting settlement kit (job board, throne room furniture, N starting settlers incl. one Town Crier). `MapSize { Small=0..}` mapping: Small -> 600-cell Voronoi (004 default), Medium 1200, Large 2400; difficulty never affects generation (027 FR-016).
- `game.started`/`game.loaded` are queued at bootstrap, delivered at the first `processQueue()`.
- Option typos: unknown fields ignored (007), but the CLI/Zod layer logs a warning list in the command result.

### D-07 Inventory (conflict 4; spec 005)
- Permission model: every mutating function takes `ctx:{actor:EntityId|null}`; `null` = system actor (bypasses rules). Rule evaluation: first matching rule wins; **no match -> allow**; no rules -> allow. `transfer` checks `Retrieve` on source and `Store` on destination for the actor; `InventoryOperation.Transfer` is retained as an alias for "both".
- Material (single schema owner = 022 loader, `MaterialSchema`): `{id,name,categories,stackLimit,weightMilli,valueMilli?,perishabilityTicks?}`. Stack limit source of truth = registry; **slots do not serialize `stackLimit`** (amends 005 FR-026, US2 AC5).
- Slot layout: `slots: InventorySlot[]` dense occupied slots in creation order; `slotCount` is capacity. Store fills existing partial stacks in slot order, then new slots. Merge of perishable stacks uses the first partial stack with `remaining` weighted floor (005 FR-020a). Deterministic, no PRNG.
- Equipment: `equipment: {name:string, restrictionCategory:string, materialId:string|null}[]` inside the Inventory component (serialized). Slot restriction matches a material `categories` entry.
- `store/retrieve` quantity must be a positive integer else `InvalidQuantityError`. `retrieve` returns `{materialId, quantity}[]` removed. Self-transfer is a no-op error `InvalidTransferError`.
- Weight in milli (D-04). **Errata:** 005 US3 AC1 example: with wood 8/50, limit 50, 2 free slots, `canStore(wood,60)` -> `fits:true, maxFittable:142`; tests use the corrected numbers.
- Money: a normal material; `credit` uses `storeUpTo` semantic + `InventoryFullError` when it cannot fit all.
- Events are emitted at call time into the bus queue (delivered at the drain); queries see state immediately.
- Decay: `remaining -= combine(combine(1000, zoneModifierMilli), difficultyDecayMilli)` per tick scaled by stack `decayRateMilli`; expiry when `remaining<=0`, evaluated in slot 3.

### D-08 Shared job-posting model (conflict 5; specs 016/017/019/020/021/027)
`JobPosting` (amends 017 FR-003):
```
{ id:PostingId, boardId:EntityId, jobTypeId:string, params:JsonValue, concurrency:int, slotsFree:int,
  recurrence:Recurrence, priority:int(0..100, default 50), urgent:boolean, wage:int(coins, default job-type wage),
  posterFactionId:EntityId, eligibility:Eligibility[], status:PostingStatus, blocked:BlockedReason|null,
  standingOrderId:int|null, deliverToZoneId:EntityId|null, ownerSystem:PostingOwner }
Eligibility = AdultHumanoid | FactionMember{factionId} | NotHostileToPoster | MinSkill{skillId,level} | TierUnlocked{tier}
PostingOwner = Zone{zoneId} | ProductionOrder{orderId} | Construction{jobId} | StandingOrder{orderId} | Player | Housing
```
- Eligibility is evaluated at **claim time** by the claimer. `NotHostileToPoster` (021 labour gate): ineligible if the integer mean of `standing[f -> posterFactionId]` over the worker's factions (excluding the poster itself) is `< -30`; a worker belonging to the poster is eligible. Construction postings carry `[AdultHumanoid]` (016 FR-001b).
- **Claim order** (amends 017 FR-007; resolves 017/020): key tuple `(priority desc, urgent desc, familiarityBucket desc, pathCost asc, postingId asc)`. `familiarityBucket = floor(level/10)` (0..10) of the job type's `skillDomain` skill (0 when no domain). 020's `skillAffinityBonus` is therefore ordering-only (bucketed), no additive score. **PRNG tie-break removed** (017 FR-007, US7; 018 US5 likewise -> lowest id). Equal-distance boards: highest priority/familiar, then lowest entity id. Greedy re-route: **off** (decided, not optional).
- `urgent`: set by systems for need-driven postings (haul food to starving household) or by player `SetConstructionPriority(urgent)`; no other source.
- **Which board gets what:** postings created by *systems* (construction, production orders, zone auto-posts, housing) are placed **immediately** on the nearest non-paused board on the target's map (path distance; tie lowest id) — they bypass Town Criers. Town Criers carry only *player-edited* postings on user-managed boards (`PostJob/RemovePosting/ModifyPosting`) and Steward runs (026). A board's `mode` (`SystemManaged|UserManaged`) governs who may edit it (017 FR-009/010), not whether systems may post.
- **Wage/payer:** `jobboard.job.completed` carries `{workerId, wage, outputs}`. Treasury system (019) listens, enqueues `PendingWagePayment{paymentId = claimId}` and pays from the Throne Room treasury of the *poster faction*; only the player government has a treasury. Wage `0` = no transfer. Job types may declare a default `wage` (content).
- **Completion emitters:** the system that executes a job emits `skill.work.completed {entityId, skillId}` once per completed claim (production -> crafter with recipe skill; construction -> builder `construction`; gathering/haul -> worker with job-type `skillDomain`; trade -> both parties, skill `trading`). The board only emits `jobboard.job.completed`.
- `skillDomain` and wage live on the JobType (022). `urgency`/familiarity "experience tags" dropped.
- 016 status mapping: ConstructionJob `suspended` == posting `suspended` with `blocked`; `paused` == board-independent `paused` flag on the job (posting withdrawn from claims). 016 `construction.job.started` = construction phase begins (progress starts); `construction.job.claimed` added for claim.
- Town Crier = Citizen with a `TownCrier` component (`{status, boardQueue, carrying:PendingUpdateRef[]}`); fleet = count of such citizens; created by commands `AppointTownCrier/DismissTownCrier` and one is designated by the starting settlement kit. Steward cannot be a crier; criers cannot be Steward. Crier destroyed -> its carried changes are lost (017 edge), queued ones survive (they live in `systems.jobboard.pendingUpdates`).
- Pending updates: `PendingBoardUpdate {updateId, boardId, changes: BoardChange[], origin:Player|Steward, ownedRunRef?}`; withdrawal of a still-pending add removes both (no-op on delivery).
- Pause sources: `PauseSource {Player, System}` tracked separately on board; board is paused if either; zone re-activation clears only System.

### D-09 Reservations, locks, tool use (conflict 5; 014/016/018/019)
- `ReservationService` (state in `systems.reservations`): `Reservation {id, kind:Lock|Haul|Tool|Payment, holderId:EntityId, inventoryOwnerId:EntityId, materialId, quantity, createdTick}`. Reserved quantity is excluded from `StorageQuery.availableTo(requester)` for everyone except the holder.
- Material lock for crafting (014 FR-013) = `kind:Lock`; released on completion/interrupt.
- Excluded from material queries (018 FR-011): inventories of `BuildSite`, `loose_pile` is included (it is a source), carried hauler stock is NOT claimable, household storage on dwelling tiles (029), Inventory with `queryable:false`. Inventory component gains `queryable:boolean` (default true).
- "Locked chest" in 018 = inventory permission denies the requester (`AccessDenied`); no lock mechanic.
- Tools: a builder/worker reserves a tool item (`kind:Tool`) before fetching; a held tool is simply in the worker's inventory and never deposited. One tool, many jobs: second claimer's job suspends with `MissingTool` and re-evaluates each tick.
- Stockpile "sources": hauler-carried items are not sources (018 blocker 1 resolved).

### D-10 Production (conflict 6; spec 014)
- **Two commands** (014 US8.3 vs FR-013a): `CancelProductionOrder` stops the order, in-flight craft finishes; `CancelCraft{workstationId}` interrupts (return locked inputs, progress 0).
- Material registry owner: 022 `MaterialSchema` (D-07). 014 FR-001 references it.
- Recipe variants (014 US9.2): **not supported**; variant recipes are separate recipe entries. Multi-step chains (014 FR-010 auto-prerequisite crafting) **removed**: a craft whose input is missing reports `MissingInput` (with `noProducer`/`causeRef` per 025) and gathers from stock; intermediates are produced via their own production/standing orders. 014 US3 becomes "chain via orders".
- Skill duration: D-20 formula. Restrictions: `workstation` tag, `room` zone type id, `skill{id,min}`, optional `workstationQuality` removed. Room restriction = the workstation lies on a tile of an **active** zone of that type; failing -> `MissingRoom{zoneTypeId}` (025 maps 015 gaps via `ZoneRequirementsUnmet` on the zone subject).
- Crafter death: locked inputs return to the workstation inventory (work inventory) or, if crafting by hand, drop as `loose_pile` at the crafter's cell. Workstation destroyed: contents dropped as loose pile.
- 0-duration recipes complete in the step they start (progress 0->done, same tick); one active crafter per workstation.
- Orders: `ProductionOrder {orderId, workstationId, recipeId, remaining, priority, status:Active|Paused|Completed|Cancelled}` stored in component `ProductionOrders` on the workstation entity; each active order posts a `craft.produce` posting (ownerSystem ProductionOrder). Standing orders (026) post their own runs.
- Events per 4. `production.crafting.failed` reserved for hard failures (e.g. recipe removed): emitted with `reason`.

### D-11 Zones & rooms (conflict 6; spec 015, 009)
- **Rename:** spec 009 "Room" -> `Site` (`SiteGenerator`, `GeneratedSite`, `SiteSize`, `SiteScenario`). 015's Room stays. Generator is not stateless: it takes `Prng` stream `site.gen`; explicit `options.seed` -> private `Prng(seed)`; absent -> `seed = site.gen.nextU32()` recorded in the returned `GeneratedSite.params`. `generate` returns data to insert; it does not mutate game state. `objectCount` is not a param (only `objectDensity` permille 0..1000, 500 = default 5-10). Retries: 8.
- Timing: requirement/room evaluation is **dirty-flag driven in slot 9 of the same tick** as the triggering change; status and `zone.requirements.*` events appear that tick; *effects* (modifiers, activity-unlock queries) take effect from the **next tick**. On load: silent rebuild (no events); `zone.requirements.*` only on later transitions.
- Designation: tiles must be on one map. `DesignateZone` with disconnected tiles creates one zone per connected component (ids ascending by min cellIndex). Tile already in another zone -> command rejected `TileAlreadyZoned{cellIndex,zoneId}`; `reassign:true` option moves tiles. Remove-tiles disconnecting a zone splits it: largest part (tie: lowest min cellIndex) keeps the id, others get new ids ascending.
- Merge: when a separating wall disappears between same-type zones, system creates `MergeOffer{offerId,zoneAId,zoneBId}` in `systems.zones.mergeOffers` + `zone.merge.offered`; `ConfirmZoneMerge{offerId,accept}`; survivor = lower id. Offers lapse if zones change.
- Enclosure: perimeter neighbours (non-zone side) must contain a wall/door entity; map border counts as **not enclosed**; neighbour zone tiles that are not walls do not enclose; doors open or closed enclose and are **passable for pathing when closed** (D-21).
- Furniture requirement grammar: `FurnitureRequirement = { alternatives: { match: {tag:string}|{id:string}, count:int }[] }` (OR inside, list ANDs): "2x Crate or 2x Chest" = one requirement with two alternatives. Unbuilt blueprints/BuildSites do not count.
- Effects vocabulary: `ZoneEffect = {type:'activity.unlock', activityId} | {type:'entity.modifier', modifier:ModifierId, value:int milli}`; `ModifierId` is a code enum validated at load: `mood.bonus, social.bonus, faith.bonus, safety.bonus, inventory.decay.rate`. Modifiers apply to entities whose cell is in an active zone (not only while sleeping); same-modifier from several zones: only the highest absolute value applies (no stacking).
- Gap mapping: `ZoneGapKind.{NotEnclosed,TooSmall,MissingFurniture,MissingJobBoard}` -> 025 `ZoneRequirementsUnmet{gaps}`; 014 `MissingRoom` is a *crafting-side* reason pointing `causeRef` at the zone subject.
- Zone component: `Zone {zoneTypeId, mapId, tiles:int[] (ascending), isRoom, active, createdTick}`; entity id = zone id.

### D-12 Trade protocol (conflict 7; spec 019)
- Geography: buyer pathfinds to seller (task `trade.approach`) to path cost <= 1 cell, then emits the offer. Seller `sellsItems` entities do not move while an offer is pending.
- State machine per `TradeOffer{offerId, negotiationId, round, buyerId, sellerId, requested:Item[], offered:Item[], currencyCoins:int, createdTick, expiryTick}`: processed by TradeSystem (slot 10), ascending offerId:
  1. refuse `self-trade` silently; `faction-hostile` if standing gate; `unknown-item-value` if any item lacks `valueMilli`; `insufficient-stock` if seller lacks full quantity (**no partial counters**, amends 019).
  2. `minAcceptableMilli = ceilDiv(sum(valueMilli*qty) * priceMultiplier‰ * (1000 + marginRate‰), 1_000_000)`, `priceMultiplier‰ = base * agreementDiscount` (agreement => `*900/1000`), `marginRate‰ = minimumMarginRate + traitMarginAdd` (Greedy +50). Offered value = `currencyCoins*1000 + sum(valueMilli*qty of barter items)` **at plain `valueMilli` (no multiplier/margin on received goods)**. Accept iff `offeredMilli >= minAcceptableMilli`.
  3. Accept -> **execute in the same step** (atomic: pre-check both inventories with `canRetrieve/canStore`; both transfers or none). No "accepted, awaiting execution" state. Failure -> `trade.execution.failed {reason: buyer-inventory-full|seller-inventory-full|seller-deleted|buyer-deleted}`.
  4. Below threshold -> `countered` with `counterCoins = ceilDiv(minAcceptableMilli - barterMilli, 1000)` (>=0). The buyer's next trade step re-proposes with `round+1` if it can afford and still wants; round > `maxNegotiationRounds`(3) -> `expired`.
  - Offers expire after `offerTimeoutTicks`=24 if unresolved (seller gone). Pending offers serialize in `systems.trade.offers`.
- Hostile gate flips mid-negotiation (standing crosses `-30`): TradeSystem cancels affected offers with `trade.offer.cancelled {reason:'faction-hostile'}` (subscribes to `diplomacy.standing.changed`).
- Reserved goods: no reservation needed (offers resolve atomically in a step); simultaneous buyers resolved by ascending offerId.
- Treasury = sum of currency in storage furniture on active Throne Room tiles (via StorageQuery); wage payments: `PendingWagePayment` in `systems.treasury.payments`, retried each tick in order of `paymentId`; no containers -> `treasury.unavailable` once per day.
- Barter value, 019 US4 "applies multiplier on Stone lookup" clarified by item 2 above. Trade skill/Greedy trait: margin add only (D-20).

### D-13 Trader refined-credit ledger (conflict 9; owner decision; specs 019/021/027) — NEW RULE
Resolves "Hamlet has no iron source" together with D-16.
- `Trader` component (entities of NPC-faction caravans and any `sellsItems` NPC merchant): `{ refines: RefineRule[], ledger: {refinedMaterialId:string, creditMilli:int}[] }`; `RefineRule {rawMaterialId, refinedMaterialId, ratioMilli:int}` is **content** (on the trader prototype), e.g. `{iron_ore -> iron_ingot, 500}`.
- On `trade.completed` where the trader **buys** raw material `R` quantity `q` from the settlement: for each rule with that raw id, `credit[refined] += q * ratioMilli` (milli-items). Persisted; **no expiry**; survives save/load and trader departure (ledger keyed per settlement faction in `systems.trade.traderLedgers: {traderPrototypeId, settlementFactionId, refinedMaterialId, creditMilli}[]` so it outlives individual caravan entities).
- Invariant: trader stash (inventory) of the refined good == `floor(credit/1000)` (system tops up each trade step; capped by stash capacity, credit remains). A purchase of refined good `M` quantity `n` requires `n*1000 <= credit` (and stash); on execution `credit -= n*1000`. Over-ask -> `insufficient-stock` (reason `refined-credit-exhausted` reported in `trade.offer.rejected.detail`).
- Raw sold to the trader is consumed (removed from the economy); refined goods are minted only via this ledger.
- Visits: NPC factions with `traderPrototypeId` send a caravan (entity with `Trader`) every `traderVisitIntervalDays`=6 starting day 3, if not hostile (standing >= -30); it walks to the market/throne arrival cell, stays `traderStayDays`=2 then leaves (deleted at the map boundary). Constants in content-constants (022 FR-023).
- Test (4.1): sell 10 ore -> can buy exactly `10*ratio/1000` iron ingots; credit survives save/load + 5000 ticks; a second sale adds to remaining credit. Reachability validator (5.4) must prove Hamlet -> ore source -> sale -> refined purchase -> Village requirements.

### D-14 Diplomacy (conflict 7; spec 021)
- Descoped: **envoy combat**. `DispatchFailureReason.envoy-destroyed` kept for entity deletion only (no game rule produces it). Envoy fails by timeout: `envoyStuckTimeoutTicks`=576 -> `unreachable`.
- Seats: every faction has `seat:{mapId,cellIndex}`: player = Throne Room seat; NPC = a map-boundary cell chosen by the world generator (ties lowest cellIndex). NPC leaders are real entities placed at the seat, idle. Envoys spawn at the sender seat.
- Leader succession: when `leaderId` becomes null (leader deleted or SetFactionLeader null) the next tick the faction picks the member (Citizen, adult, `factions` contains it) with greatest total skill, tie lowest id; no members -> stays null (leaderless). Player faction: `SetFactionLeader` command or same automatic rule. Event `faction.leader.changed`.
- Membership hook: `faction.membership.changed {entityId,factionId,joined}` emitted by the faction helper that mutates `Citizen.factions` (all membership writes go through it) — fills the 028/027/026 gap.
- Standing deltas (content constants `diplomacyConstants`, all ints): Gift `delta = min(25, 5 + floor(valueCoins/20))` applied to target's view of sender, sender's view +half (floor); TradeAgreement accepted +10 both; Overture accepted +5 both / rejected -3 target's view of... rejecting side's view of proposer; Declaration war: both views `min(cur,-60)`; peace: `max(cur,-10)`; neutrality: `0`; completed trade between player and a faction's trader +1 (cap +5/day). `hostileThreshold=-30`, `agreementMinStanding=20`, `warStanding=-50`, `rejectionPenalty=3`. NPC-applied negative deltas toward the player are combined with `factionHostilityMultiplier` (027).
- Acceptance: NPC accepts TradeAgreement iff its standing toward the sender >= 20 (deterministic); player responds via `RespondToProposal{proposalId, response}`; rejection applies `rejectionPenalty`.
- Gift refund: when dispatch fails (any reason) the deducted items/coins return to the sender treasury (Throne Room containers; no container -> `loose_pile` at the Throne seat). NPC gifts are not accounted.
- NPC AI: each NPC faction evaluates when `tick mod 72 == factionId mod 72`; at most one act per `npcActCooldownTicks`=288; act chosen with `weighted` on stream `diplomacy.ai` (integer disposition weights scaled by `factionHostilityMultiplier` for hostile acts toward the player). War probability per evaluation for aggressive dispositions with standing <= -20: 100 permille.
- Faction destroyed = no members and no leader; standing entries removed from all factions, pending envoys recalled.
- Trade agreement discount applies at evaluation (D-12), never stored in `priceMultiplier`.

### D-15 Content blockers (conflict 8; spec 022)
- Engine-only prototypes added to the content pack (`engine-prototypes.json`): `wall`, `door` (component `Door{isOpen,locked:false}`), `job_board`, `build_site`, `loose_pile`, `diplomatic_envoy`, plus roles via components (`TownCrier`). Town Crier and Steward are roles, not prototypes.
- BT sub-tree reference: action handler `run_tree` with node field `params:{treeId:string}`; BT nodes may carry `params: {[k]:string|int}`; cycles rejected at load. Animal BTs added: `prey_behavior` (flee), `predator_behavior`, `livestock_behavior`; every animal prototype names one.
- Crops (no seasons, no calendar mechanics in v1): `FieldState {stage:Fallow|Sown|Ripe, growthTicks}` on farm_field zone; `farm.sow` (Fallow->Sown, no seed item), field ripens after `cropGrowthTicks`=864 (constant), `farm.harvest` (needs Ripe; `outputs` per crop on the zone type) -> Fallow. `farm.tend` is optional content (no engine effect). "one-time-per-season" recurrence = `one-time`.
- Gathering jobs: `outputs: {materialId,quantity}[]` required for gathering job types; authored in 5.2 (`fell.trees`: oak_log x3; `quarry.stone`: limestone x2; `mine.ore`: iron_ore x2 (Hamlet, D-16); `farm.harvest`: wheat x4; others per content).
- Hunt/butcher/shear/milk/charity: authored as ordinary gathering/consume jobs in 5.3 (`hunt.game`, `butcher.animal`, `charity.distribute`); `butcher.animal` deletes the target livestock entity and yields its `drops`. Not on the Phase <=4 critical path.
- Skill effects: `trading` and `preaching` get `qualityBonus` (no-op) only; special effects of 022 US removed. Mood is a `Mood` component stat (not in the need registry); trait `mood: bonus` -> `needModifier` on a pseudo need id `mood` handled by the mood system.
- Terrain move cost classes (D-04) and `clearsTo?: terrainId` field (forest clearing) added to TerrainSchema; clear job = `build.clear`. Weight/value/needs starting values: content defaults documented in `content-constants` (start value 80000 for all needs).
- Corpus counts stay content-pack tests (AD8).
- Name: `Item category` taxonomy lives in `categories.json` (closed list validated for filters; includes `valuable`, `flour`).

### D-16 Tier reachability (conflict 9; spec 027)
- Smelter/Forge stay at Village (owner). Iron for Village requirements arrives via D-13 trader credit. **Hamlet content must add:** job `mine.ore` (outputs iron_ore), zone `quarry` variant `mine`, or ore tile harvestable `iron_vein` — at least one Hamlet-unlocked ore source; and a Hamlet-reachable path to a merchant visit.
- `dwelling` zone type: `unlockTier` absent (Hamlet). Dwelling levels: Hovel hamlet, Cottage village, Timber-Framed House market_town, Burgher House market_town (satisfiable: Tavern=village, Church=market_town).
- Validator (5.4) algorithm: fixed-point over tiers; at tier T the available set = content with `unlockTier <= T` plus trader-refined goods reachable via raw materials whose source job is unlocked; every requirement of tier T+1 (zone types, their furniture, construction materials, recipe inputs transitively) must be producible. Failure names tier, requirement, missing material.
- 027 FR-004 uses `ticksPerDay`; evaluation at `tickOfDay==0 && tick>0` in slot 15 (after housing/steward day slots, so the tier lags dwelling upgrades by <= 1 day; accepted).

### D-17 028 vs 029 (conflict 10)
- `Arrived` is **Minor** (amends 028 FR-012, SC-005). Major set: `MasteryAchieved, BecameFinest, TookOffice, Died, SettlementMilestone, TierReached`.
- Size budget: `journalCapacity` default 16 (was 24); **028 SC-006 raised to 1 MB** for 200 full journals + chronicle.
- `Identity.seenSkills: string[]` (sorted) added for `FirstWork`; `nameSnapshot` kept in records.
- `entity.deleted` payload carries `name` (styled name at deletion) via a synchronous `beforeDelete` hook registered by the identity system (not an event).
- Name collision rechecked at `Arrived`: if full name now collides with another living member, assign ordinal (no redraw).
- `identity.title.changed` is not emitted at creation; initial snapshot set silently (no moment).

### D-18 Status explanations (conflict 11; spec 025)
- **Pull model:** systems register `StatusProvider {kind:StatusSubjectKind, subjects(): StatusSubjectRef[], reasons(ref, ctx): BlockedReason[]}` in a `StatusRegistry`; evaluation (slot 18) is a pure derivation, no push, no PRNG. Settle state stored under root `statuses`: `{subject, state, reasons, sinceTick, pendingSince:int|null, pendingPrimary:string|null, settled:boolean}[]`.
- Grace flapping rule: pending primary replaced -> `pendingSince` resets; the previously *published* reason stays published until a new primary settles.
- Re-emission only when published primary reason changes (not other reasons).
- Dwelling subject and Zone subject: dwelling zone reports `ZoneRequirementsUnmet` on the Zone subject and `ZoneInactive{zoneId}` on the Dwelling subject (029 FR-019a); both appear; no suppression.
- Loose piles: prototype `loose_pile`; each pile with no matching haul posting gets a `haul.deliver` posting auto-created by StockpileSystem (ownerSystem Zone-less, `System`); `NoStorageDestination` reported.
- Trade ledger attribution (025 FR-012): `trade.completed` counts when exactly one party inventory is a player-faction citizen or Throne Room container and the other is not player-faction.
- Orphan statuses purged on load. `explain()` stays pure; owners expose `causeRef` through reasons.

### D-19 026 defaults (conflict 11)
`maxOpenRunsPerOrder`=5, `maxStandingOrders`=50, `noticePostRadius`=12 hops, `bellRadius`=25 hops (adjacency hops, 004). New order starts `restocking=false` (state Satisfied); first review flips it if `stock <= threshold`. `StandingOrderState` is derived: Paused > Blocked (primary reason non-null) > (Restocking if `restocking` else Satisfied); hysteresis bit `restocking` persisted underneath. Intra-tick day order: housing evaluation (slot 13) then steward review (slot 14), both at tickOfDay 72; steward counts post-consumption stock. Steward audience: `govern.steward_audience` task created by the review. `via` on `jobboard.update.applied`. Crier route replanning with Notice Post/Bell: if the post is unreachable the crier goes to the board itself.

### D-20 Skills formulas (specs 020/013)
- Growth: `delta = baseGrowthMilli * aptitudeMilli/1000 * factor/1000` (integer, trunc); `factor = diminishingReturnsFactor` if `floor(current/1000) >= threshold` else 1000; capped at 100000; aptitude traits multiply (permille product, trunc). Examples calibrated in content (base 2.0, factor 0.25 give "2 at 10, 0.5 at 90").
- Work duration (computed at work start, fixed): `ticks = max(1, ceilDiv(base * (1000 - speedBonus‰) * 1000, 1000 * speedMultiplier‰))`, `speedBonus‰ = maxSpeedBonus‰ * level/100`; level = `floor(v/1000)`. Output bonus: `expected = maxExtraMilli*level/100`; `extra = floor(expected/1000) + (stream('skill.output').chancePermille(expected mod 1000) ? 1 : 0)`.
- `dominantSkill`: highest value; tie -> lexicographically smallest skillId; all zero -> null.
- Traits: `performanceModifier` kinds `multiplier|speedMultiplier|outputBonus|marginAdd`; combine multiplicatively except `marginAdd`/`outputBonus` additive. `ALL` wildcard = `skillId:"*"`. `startingValueBonus` unit = levels (int).
- needModifier: `decayRateMultiplier`(permille on decay), `satisfactionBonusMultiplier`, applied by the needs system.
- Procedural trait draw: 1-3 traits, count by `content.traits` stream (weights 50/35/15 permille), without duplicates and without trait pairs declared `conflictsWith`.

### D-21 Pathfinding & maps (spec 012/004)
- Pure function `findPath(world, from, to, opts): PathResult`, `PathResult = {kind:Found, cells:int[] (excludes start), cost:int} | {kind:AlreadyThere} | {kind:NoPath}`. Tie-break `(f, h, cellIndex)` asc. No PRNG anywhere. Voronoi heuristic = floor(centroid distance in integer units * minStepCost / unit). Cross-map: flattened over Transition entities with cost 10; closed doors passable (open cost 0 extra); a start cell that is blocked may path out. Out-of-range target -> `NoPath`. Node limit: `maxExpansions`=200000, exceeded -> `NoPath`.
- Cache invalidation: `map.cell.obstruction.changed` and `map.terrain.changed` events invalidate cached paths crossing the cell (generation counter per map).
- Map delete with entities is rejected. Travel (004 async op) is a task `map.travel` atomic in one step.
- Obstruction: wall/door/blocking furniture (`blocksMovement:true` prototype flag) make a cell non-traversable (furniture sets the flag; doors by state: locked==blocked, closed passable).
- Reason strings -> enum `BlockReason {Wall, Water, Locked, ImpassableCliff, Furniture}`.

### D-22 Lint/style carve-outs (conflict-free, AD11) — implemented by 0.1
`unknown` permitted only with `// eslint-disable-next-line ... -- <reason>` at JSON/Zod/catch boundaries; `.json` import extension allowed; 023 FR-007 (id-length) is `error` with exceptions `id,x,y,i,j,k,dx,dy,tx,ty`; FR-005 enum rule enforced by a custom `no-restricted-syntax` on literal-union type aliases; `src/game` bans `Date`, `Math.random`, `setTimeout/setInterval/setImmediate/queueMicrotask/requestAnimationFrame`, `performance.now`, `async` functions, `Promise`, DOM globals, imports from `src/renderers`. `AutoRunner` (task 1.1) is the only file with a documented `eslint-disable` for timers.

### D-23 GameSession facade & clock (conflict 12; spec 024)
- `src/game/api/GameSession.ts` is the only entry point for renderers/tests: `dispatch(cmd) -> CommandResult`, `step(n)`, `runUntil(pred, maxTicks)`, `query.*` (views), `events` (typed subscription), `save()/load()`, `commandLog`, `replay(log)`.
- `dispatch` = **validate now, apply at slot 1**: pure validation (same code as apply) returns `{ok:true, commandId}` or `{ok:false, error}` immediately; the command is queued FIFO with the current tick and applied at slot 1 of the next tick; an apply-time failure emits `command.rejected`. `Immediate` commands (NewGame, LoadGame, SaveGame, SetTickInterval, Step) bypass the queue and are legal only between ticks. Paused game: queued commands apply at the next `step`; `Pause/Resume/SetSpeed` apply immediately-between-ticks too (they are flagged `applyOnDispatch`).
- Commands never carry timestamps; `commandLog = {tick, command}[]` where `tick` = tickCount at dispatch.
- Clock: `EngineHost` (renderer) owns the timer and calls `AutoRunner`; `GameSession.step(n)` is the only thing that advances time. React runs engine on the main thread.
- Time controls: `Pause, Resume, SetSpeed{speed}, SetTickInterval{ms}` (paused `tick()` is a no-op: slot 0 returns before any system; `tickCount` unchanged).

### D-24 Descopes (owner): see section 7.

### D-25 Needs/mood/relationships storage (spec 013; defers formulas to 2.4)
- `Needs {values:{needId,valueMilli}[] sorted by needId}`, `Mood {valueMilli, influences:{source:string,deltaMilli:int,untilTick:int}[] (cap 8)}`, `Relationships {entries:{otherId,affinityMilli,lastTick,history:{kind:string,deltaMilli,tick}[] (cap 8)}[] (cap 16, oldest-lastTick evicted)}`, `Health {valueMilli}`, `AiState {treeId, currentNode:int[], lastActionTick}` — all < 1 KB (013 SC-009).
- Needs decay linear per tick: `value -= decayRateMilli * needDecayMultiplier combine`; critical when `<= criticalThresholdPct*1000`. Starvation: hunger 0 => health -`starvationHealthPerTick` (content) until 0 => `entity.died {cause:Starvation}` then delete.
- Utility scoring (2.4 decides numerics under these constraints): integer scores, `score = base + sum(factor)`; ties -> lowest action index; BT picks child order, utility only chooses among root behaviour candidates; roles derive from prototype+traits (no occupation component); `govern.steward_audience` outranks job-board work, never critical needs (013 FR-003).
- Success rolls use stream `ai.risk` with `chancePermille(mood map)`.
- Wealth: `coinsHeld` in own inventory (silver_penny count); thresholds in content constants (`wealthyCoins`=500, `poorCoins`=50). Season/harvest: none (D-15).

### D-26 Storage routing details (spec 018)
- Distance metric everywhere = path cost (012) on the same map; unreachable sources excluded. Tier 2 vs 3: furniture with an own/default filter matching the material is tier 2 even inside a Stockpile zone. Zone `skillAffinity` is a field on ZoneType `{skillId}`; hauler affinity tier applies when hauler's skill level in `skillId` >= `affinityMinLevel`(20). Filters: absent = accept all; `categories:[]` and `materialIds:[]` empty-array == absent. Player filter replaces (not merges) the prototype default. Treasury coffers use category `valuable` (silver_penny declares `valuable`); Throne Room containers are exempt from tier-4 routing for currency: currency only routes to tier-0..3 targets (documented in StockpileSystem).
- Haul postings: StockpileSystem auto-posts `haul.deliver` for loose piles and production outputs flagged `outputDestination:Stockpile`; hauler holds undeliverable stock and retries every 24 ticks emitting `storage.no-compatible-destination` once.

### D-27 Construction details (spec 016)
- BuildSite entity (`build_site`) occupies the target cell; walls become non-traversable only at completion; mobile entities never block a build (004). Duplicate pending job at same cell -> `LocationAlreadyOccupied`. Decon duration = `max(1, floorDiv(constructionDuration,2))`. "Recently completed" retention = 288 ticks. Staging = on-site BuildSite inventory (not "adjacent"). Cancel returns staged materials to nearest storage (StorageQuery) else `loose_pile`. Builder deleted mid-job -> job back to pending (materials stay). Deconstruct non-removable flag: prototype `removable:boolean` (default true).
- Duration used = D-20 effective duration with skill `construction`, fixed at construction-phase start.

### D-28 Housing details (spec 029)
- Supplied-good accumulators keyed by **materialIds-group signature** (`materialIds.join('|')`) not index; demanded set = union of groups of current and next level; if both levels demand the same group, the **higher** `perResidentPerDay` applies; on level change accumulators with unchanged signature are kept, others dropped. "Clear invalid homes" (step 1) = dead/deleted, not in player faction, dwelling deleted/inactive-removed, non-adult. Capacity re-check each evaluation (step 4) regardless of level change. Settlers: `homeAssignedTick` = spawn tick. `maxPathCells` -> renamed `maxPathCost` (cost units, 012). Adult predicate: has `TaskQueue` and `Citizen` and prototype `isAdult` (default true; no ageing in v1). Arrival cell recomputed per evaluation.
- Food variety recording hook: `need.item.consumed` with food-category material and entity's `homeDwellingId != null`.

### D-29 Standing-order / production boundary (014 FR-016 vs 026)
014 FR-016 "keep N in stock" lives only in 026. 014 orders = fixed-count execution.

### D-30 Game design numbers deferred to content/tasks
Utility numerics (2.4), name/title strings (4.6), flavour templates (renderer prefs), balance constants: all in `content-constants.json` with Zod range checks (022 FR-023 table extended by D-13/14/15/19 constants).

---

## 2. Canonical tick pipeline (AD4)

`GameEngine.tick()` runs these slots in order, once per tick. A system registers `{id, slot, order}`; the pipeline test (1.1) pins this table. "tick" below = `time.tickCount` **after** the slot-2 increment; `tickOfDay = tick mod ticksPerDay`. Day systems fire when `tickOfDay` equals their constant. Entities flagged `pendingDelete` are skipped by slots 4-8 and removed at slot 17.

| Slot | Name | Owner spec | Work |
|---|---|---|---|
| 0 | Begin | 001, 010 | if `paused` -> return (no state change). else emit `tick.begin` (tick+1) and flush the bus so the queue is empty |
| 1 | Commands | 024/D-23 | apply queued commands FIFO (`command.applied` / `command.rejected`) |
| 2 | Time | 001 | `tickCount += 1` |
| 3 | Decay | 005, 018, 027 | perishable decay + expiry (`inventory.item.expired`); pantry/difficulty multipliers |
| 4 | Needs & mood | 013 | need decay (difficulty multiplier), mood, relationship decay, starvation health |
| 5 | AI decision | 013, 020 | per entity (ascending id) with empty/preemptable TaskQueue: utility + BT step -> enqueue tasks |
| 6 | Task execution | 003, 012, 014, 016 | per entity (ascending id): one step of the highest-priority task: movement, gather, haul, craft, build, trade.approach, steward audience |
| 7 | Job boards | 017, 026 | claims by idle entities at boards, recurring re-posts, crier arrival/application of pending updates, notice-post delivery |
| 8 | Production & construction bookkeeping | 014, 016 | orders -> postings, site completion/spawn, suspension/resume, cancellations |
| 9 | Zones | 015 | dirty-flag room/requirement evaluation, splits, merge offers, `zone.*` events |
| 10 | Stockpile / trade / treasury | 018, 019 | haul-posting generation, offer processing (ascending offerId), trader ledger, wages |
| 11 | Diplomacy | 021 | envoy delivery results, standing application, NPC AI, leader succession, trader visits |
| 12 | World | 004, 015 | field crop growth, map-level upkeep |
| 13 | Housing (day) | 029 | at `tickOfDay==housingEvaluationTickOfDay`: 7-step evaluation |
| 14 | Steward (day) / bells | 026 | at `tickOfDay==stewardReviewTickOfDay` (or extra review flag): review; at `bellRingTicksOfDay`: ring |
| 15 | Tier (day) | 027 | at `tickOfDay==0 && tick>0`: tier evaluation, unlock |
| 16 | Identity maintenance | 028 | finest-holder rescans, title recompute batches |
| 17 | Removal | 003, 005 | apply deferred entity deletions (`entity.died`, `entity.deleted`), clear references (002 FR-006a), release reservations |
| 18 | Status | 025 | evaluate all status subjects (pure), settle, emit `status.*` |
| 19 | Ledger rollover | 025 | day bucket roll/prune |
| 20 | Drain | 010 | `processQueue()`; event-driven systems (identity, chronicle, milestones, ledger, skill growth, journals, task wake-ups) run inside handlers |

Notes: (a) all event handlers run in slot 20 and may emit nested events (depth cap 16); state they mutate is part of the same tick. (b) `Pause` applied between ticks affects the next tick's slot 0. (c) Housing precedes steward at tick-of-day 72; the tier check at tickOfDay 0 follows the previous day's housing. (d) Entity deletion requested by any system is deferred to slot 17 so iteration order stays stable.

---

## 3. Command catalogue

`type Command = { kind: CommandKind } & Payload`. `enum CommandKind` (member = PascalCase of kind). Classes: **Q** queued, applied at slot 1; **I** immediate (between ticks, bypass queue); **A** apply-on-dispatch (time controls, also logged); **D** debug (rejected unless `GameSession` created with `allowDebug:true`; Checkpoint D scenarios use none). Result: `CommandResult = {ok:true, commandId:int, data?:JsonValue} | {ok:false, error:{code:ErrorCode, message:string, details?:JsonValue}}`. All commands not marked otherwise are class Q.

### 3.1 Session / time (001, 006, 007, 024)
| CommandKind | Class | Payload | Errors |
|---|---|---|---|
| NewGame | I | `{options?: GameInitOptions}` (`difficulty?, startingTier?, mapSize?, seed?`) | InvalidOptions |
| LoadGame | I | `{save: string}` | InvalidSaveFormat, UnsupportedSaveVersion |
| SaveGame | I | `{timestamp?: string}` -> `data: string` | - |
| Step | I | `{ticks: int>=1}` | - |
| Pause / Resume | A | `{}` | - |
| SetSpeed | A | `{speed: SpeedSetting}` | InvalidSpeed |
| SetTickInterval | I | `{tickIntervalMs: int>=1}` | InvalidTickInterval |

### 3.2 Debug (D) (003, 005, 011)
`DebugSpawnEntity {prototypeId, mapId?, cellIndex?, overrides?: JsonValue}` · `DebugGrantItems {entityId, materialId, quantity}` · `DebugSetSeed {seed}` (011 `setSeed`) · `DebugSetComponent {entityId, component, value: JsonValue}` · `DebugSetTier {tier}`.

### 3.3 Construction (016, 004, 027)
| CommandKind | Payload | Errors |
|---|---|---|
| QueueConstruction | `{prototypeId, mapId, cellIndex, priority?:int, urgent?:boolean}` | UnknownPrototype, ContentLocked, LocationBlocked, LocationAlreadyOccupied, OutOfBounds |
| QueueWalls | `{prototypeId: 'wall'\|'door', mapId, cells: int[]}` (renderer expands rectangles to cells; one job per cell; all-or-nothing validation) | as above |
| QueueDeconstruction | `{targetEntityId, priority?}` | UnknownEntity, NotRemovable |
| CancelConstructionJob | `{jobId}` | UnknownJob |
| SetConstructionJobPaused | `{jobId, paused:boolean}` | UnknownJob |
| SetConstructionPriority | `{jobId, priority:int, urgent?:boolean}` | UnknownJob |
| MoveConstructionJobToFront | `{jobId}` | UnknownJob |

### 3.4 Zones & storage (015, 018)
| CommandKind | Payload | Errors |
|---|---|---|
| DesignateZone | `{zoneTypeId, mapId, cells:int[], reassign?:boolean}` | UnknownZoneType, ContentLocked, TileAlreadyZoned, OutOfBounds |
| AddZoneTiles | `{zoneId, cells:int[], reassign?}` | UnknownZone, TileAlreadyZoned |
| RemoveZoneTiles | `{zoneId, cells:int[]}` | UnknownZone |
| DeleteZone | `{zoneId}` | UnknownZone |
| ConfirmZoneMerge | `{offerId, accept:boolean}` | UnknownOffer |
| SetZoneMaterialFilter | `{zoneId, filter: MaterialFilter\|null}` | UnknownZone, UnknownCategory |
| SetStorageMaterialFilter | `{entityId, filter: MaterialFilter\|null}` | UnknownEntity, UnknownCategory |

`MaterialFilter = {categories?:string[], materialIds?:string[]}`.

### 3.5 Production (014)
| CommandKind | Payload | Errors |
|---|---|---|
| CreateProductionOrder | `{workstationId, recipeId, quantity:int>=1, priority?:int}` | UnknownEntity, UnknownRecipe, ContentLocked, RecipeNotCompatible |
| CancelProductionOrder | `{orderId}` | UnknownOrder |
| SetProductionOrderPaused | `{orderId, paused}` | UnknownOrder |
| SetProductionOrderPriority | `{orderId, priority}` | UnknownOrder |
| CancelCraft | `{workstationId}` | UnknownEntity |

### 3.6 Job boards (017, 019)
| CommandKind | Payload | Errors |
|---|---|---|
| SetJobBoardPaused | `{boardId, paused}` | UnknownBoard |
| PostJob | `{boardId, jobTypeId, params?:JsonValue, concurrency?:int, recurrence?:Recurrence, priority?:int, wage?:int}` | UnknownBoard, UnknownJobType, ContentLocked, BoardNotUserManaged, NoSeatOfGovernment |
| RemovePosting | `{boardId, postingId}` | UnknownPosting, BoardNotUserManaged |
| ModifyPosting | `{boardId, postingId, priority?, concurrency?, wage?}` | same |
| CancelPendingBoardUpdate | `{updateId}` | UnknownUpdate |
| AppointTownCrier / DismissTownCrier | `{entityId}` | IneligibleCrier |

PostJob/RemovePosting/ModifyPosting on a user-managed board enqueue a `PendingBoardUpdate` (applied on crier arrival); on a system-managed board they are rejected (017 FR-009).

### 3.7 Trade (019)
`SetSellsItems {entityId, value:boolean}` · `SetPriceMultiplier {entityId, multiplierMilli:int}` · `ProposeTrade {buyerId, sellerId, requested: Item[], offeredItems: Item[], offeredCoins:int}` (debug/scenario use; AI proposes via BT action) · `WithdrawTradeOffer {offerId}`. `Item = {materialId, quantity}`. **No trade-policy command (descoped).**

### 3.8 Diplomacy & factions (021)
| CommandKind | Payload | Errors |
|---|---|---|
| IssueDiplomaticAct | `{actType: DiplomaticActType, targetFactionId, gift?: Item[]\|{coins:int}, declaration?: 'war'\|'peace'\|'neutrality', terms?: JsonValue}` | UnknownFaction, InsufficientFunds, TargetLeaderless, HostileGate |
| RespondToProposal | `{proposalId, response: 'accept'\|'counter'\|'reject', counter?: JsonValue}` | UnknownProposal |
| SetFactionLeader | `{factionId, entityId: EntityId\|null}` | UnknownFaction, NotMember |

### 3.9 Standing orders & Steward (026)
| CommandKind | Payload | Errors |
|---|---|---|
| CreateStandingOrder | `{materialId?, recipeId?, targetQuantity:int, restockThreshold?:int, scope: 'settlement'\|{zoneId}, priority?:int, postingBoardId?:EntityId}` | NoProducingRecipe, AmbiguousRecipe (details.candidates), InvalidQuantity, DuplicateOrder, UnknownZone, BoardNotUserManaged, TooManyOrders, ContentLocked |
| UpdateStandingOrder | `{orderId, targetQuantity?, restockThreshold?, priority?, postingBoardId?: EntityId\|null}` | InvalidQuantity, UnknownOrder |
| PauseStandingOrder / ResumeStandingOrder / DeleteStandingOrder | `{orderId}` | UnknownOrder |
| AppointSteward | `{entityId}` | IneligibleSteward |
| DismissSteward | `{}` | - |
| SetStewardBoard | `{boardId: EntityId\|null}` | BoardNotUserManaged |
| RequestStewardReview | `{}` | - |

### 3.10 Identity (028)
`RenameCitizen {entityId, givenName:string, byname:string|null}` · errors InvalidName, UnknownEntity.

### 3.11 Placement validation (query, not a command)
`validatePlacement(prototypeId, mapId, cellIndex) -> {ok:boolean, reasons: PlacementReason[]}`; hard reasons (`OutOfBounds, TerrainNotBuildable, Occupied, ContentLocked`) block queueing; soft (`NoMatchingZone`) do not.

---

## 4. Event catalogue

Topic grammar D-02. Ids are ints. Payloads are JSON objects with exactly these fields. Implementation: `enum EventTopic` (string values) + `type EventPayloadMap` in `src/game/engine/EventTopics.ts` (grown per task). `Item = {materialId:string, quantity:int}`. `Ref = StatusSubjectRef` (025).

### 4.1 Engine / session (001, 007, 006, 010, 024)
| Topic | Payload | Emitter |
|---|---|---|
| `game.started` | `{seed:int, difficulty:string, startingTier:string}` | 007 |
| `game.loaded` | `{tick:int}` | 007 |
| `game.paused` / `game.resumed` | `{tick:int}` | 001 |
| `game.speed.changed` | `{speed:int}` | 001 |
| `game.saved` | `{tick:int}` | 006 (delivered after the snapshot; not part of it) |
| `tick.begin` | `{tick:int}` | 001 |
| `command.applied` | `{commandId:int, commandKind:string}` | 024 |
| `command.rejected` | `{commandId:int, commandKind:string, code:string}` | 024 |

### 4.2 Entities, tasks, map, factions (003, 004, 012, 021)
| Topic | Payload | Emitter |
|---|---|---|
| `entity.spawned` | `{entityId, prototypeId:string, mapId:int\|null, cellIndex:int\|null}` | 003 |
| `entity.died` | `{entityId, cause:string}` (Starvation, Other) | 013 |
| `entity.deleted` | `{entityId, prototypeId, name:string\|null}` | 003 (slot 17) |
| `entity.component.added` / `.removed` | `{entityId, component:string}` | 003 |
| `entity.movement.started` | `{entityId, mapId, fromCell, toCell}` | 013 |
| `entity.movement.completed` | `{entityId, mapId, cellIndex}` | 013 |
| `entity.map.changed` | `{entityId, fromMapId, toMapId, cellIndex}` | 004 |
| `task.finished` | `{entityId, taskId, taskType:string, outcome:'Completed'\|'Cancelled'\|'Failed', reason:string\|null}` | 003 |
| `map.created` | `{mapId, gridType:string}` | 004 |
| `map.terrain.changed` | `{mapId, cellIndex, from:string, to:string}` | 004 |
| `map.cell.obstruction.changed` | `{mapId, cellIndex, traversable:boolean}` | 004 |
| `door.state.changed` | `{entityId, isOpen:boolean}` | 004 |
| `faction.membership.changed` | `{entityId, factionId, joined:boolean}` | 021 helper |
| `faction.leader.changed` | `{factionId, oldLeaderId:int\|null, newLeaderId:int\|null}` | 021 |

### 4.3 Inventory, needs, skills (005, 013, 020)
| Topic | Payload |
|---|---|
| `inventory.item.stored` / `.retrieved` | `{entityId, materialId, quantity}` |
| `inventory.item.transferred` | `{sourceId, destinationId, materialId, quantity}` |
| `inventory.item.expired` | `{entityId, materialId, quantity}` |
| `inventory.item.equipped` / `.unequipped` | `{entityId, materialId, slotName}` |
| `inventory.item.stack.merged` | `{entityId, materialId, quantity}` |
| `need.item.consumed` (013) | `{entityId, needId, materialId, quantity}` |
| `skill.work.completed` (020; emitters D-08) | `{entityId, skillId}` |
| `skill.increased` | `{entityId, skillId, oldValue:int, newValue:int}` (levels, floor) |

### 4.4 Jobs, production, construction, zones, storage (014-018)
| Topic | Payload |
|---|---|
| `jobboard.job.posted` | `{boardId, postingId, jobTypeId}` |
| `jobboard.job.claimed` | `{boardId, postingId, claimId, entityId}` |
| `jobboard.job.completed` | `{boardId, postingId, claimId, jobTypeId, workerId, wage:int, outputs:Item[]}` |
| `jobboard.job.abandoned` | `{boardId, postingId, claimId, entityId, reason:string}` |
| `jobboard.update.queued` | `{updateId, boardId, origin:string}` |
| `jobboard.update.applied` | `{updateId, boardId, via:'TownCrier'\|'NoticePost'\|'BellTower'}` |
| `jobboard.update.abandoned` | `{updateId, boardId, reason:string}` |
| `jobboard.paused` / `.resumed` | `{boardId, source:'Player'\|'System'}` |
| `towncrier.dispatched` | `{crierId, boardIds:int[]}` |
| `production.crafting.started` | `{workstationId, crafterId, recipeId}` |
| `production.crafting.completed` | `{workstationId, crafterId, recipeId, inputs:Item[], outputs:Item[]}` |
| `production.crafting.failed` / `.interrupted` | `{workstationId, crafterId, recipeId, reason:string}` |
| `production.output.blocked` | `{workstationId, crafterId, materialId}` |
| `production.order.created` / `.completed` / `.cancelled` | `{orderId, workstationId, recipeId}` |
| `construction.job.queued` | `{jobId, kind:'Construction'\|'Deconstruction', prototypeId:string\|null, targetEntityId:int\|null, mapId, cellIndex}` |
| `construction.job.claimed` / `.started` | `{jobId, builderId}` |
| `construction.job.suspended` | `{jobId, reason:BlockedReason}` |
| `construction.job.resumed` | `{jobId}` |
| `construction.job.completed` | `{jobId, kind, prototypeId, mapId, cellIndex, consumed:Item[], yield:Item[]}` |
| `construction.job.cancelled` | `{jobId, reason:string}` |
| `zone.created` / `.deleted` | `{zoneId, zoneTypeId, mapId}` |
| `zone.split` | `{zoneId, newZoneIds:int[]}` |
| `zone.merge.offered` | `{offerId, zoneAId, zoneBId}` |
| `zone.merged` | `{survivorId, absorbedId}` |
| `zone.room.changed` | `{zoneId, isRoom:boolean}` |
| `zone.requirements.met` | `{zoneId, zoneTypeId}` |
| `zone.requirements.lost` | `{zoneId, zoneTypeId, gaps:ZoneRequirementGap[]}` |
| `storage.no-compatible-destination` | `{entityId, materialId, quantity}` |

### 4.5 Trade, diplomacy (019, 021)
| Topic | Payload |
|---|---|
| `trade.offer.proposed` | `{offerId, negotiationId, round, buyerId, sellerId, requested:Item[], offered:Item[], coins:int}` |
| `trade.offer.accepted` / `.rejected` / `.cancelled` / `.expired` | `{offerId, buyerId, sellerId, reason:string\|null}` |
| `trade.offer.countered` | `{offerId, buyerId, sellerId, counterCoins:int, round}` |
| `trade.completed` | `{offerId, buyerId, sellerId, items:Item[] (to buyer), payment:Item[] (to seller, incl. silver_penny), tick}` |
| `trade.execution.failed` | `{offerId, reason:string}` |
| `trade.credit.changed` | `{traderPrototypeId, settlementFactionId, refinedMaterialId, creditMilli:int}` |
| `treasury.payment.deferred` / `.completed` | `{paymentId, workerId, amount:int}` |
| `treasury.unavailable` | `{}` |
| `diplomacy.act.initiated` | `{senderFactionId, targetFactionId, actType:string}` |
| `diplomacy.dispatch.started` | `{envoyId, senderFactionId, targetFactionId, actType}` |
| `diplomacy.message.delivered` | `{envoyId, senderFactionId, targetFactionId, actType}` |
| `diplomacy.dispatch.failed` | `{envoyId, senderFactionId, targetFactionId, reason:'leader-unavailable'\|'unreachable'\|'envoy-destroyed'}` |
| `diplomacy.standing.changed` | `{factionId, otherFactionId, oldValue, newValue}` |
| `diplomacy.agreement.formed` / `.cancelled` | `{factionAId, factionBId}` |
| `diplomacy.proposal.received` | `{proposalId, fromFactionId, actType, payload:JsonValue}` |
| `trader.arrived` / `trader.left` | `{entityId, traderPrototypeId, factionId}` |

### 4.6 Status, orders, settlement, identity, housing (025-029)
| Topic | Payload |
|---|---|
| `status.blocked` | `{subject:Ref, state:string, reason:BlockedReason, previousReason:BlockedReason\|null, sinceTick:int}` |
| `status.unblocked` | `{subject:Ref, previousReason:BlockedReason, stalledTicks:int, removed:boolean}` |
| `standing-order.created` / `.updated` / `.paused` / `.resumed` / `.deleted` | `{orderId}` |
| `standing-order.restock.started` | `{orderId, stock:int, target:int}` |
| `standing-order.satisfied` | `{orderId, stock:int}` |
| `steward.appointed` | `{entityId}` |
| `steward.dismissed` | `{entityId, reason:'Dismissed'\|'Replaced'\|'Died'\|'LeftFaction'}` |
| `steward.review.completed` | `{tick, ordersEvaluated, postingsQueued, withdrawalsQueued}` |
| `steward.review.skipped` | `{tick, reason:'NoSteward'\|'NoSeatOfGovernment'}` |
| `bell-tower.rang` | `{zoneId, tickOfDay}` |
| `settlement.tier.reached` | `{tier, previousTier, tick}` |
| `settlement.milestone.reached` | `{milestone:string (kebab), tick, subjectIds:int[]}` |
| `identity.named` | `{entityId, givenName, byname:string\|null, nameOrdinal:int}` |
| `identity.title.changed` | `{entityId, oldTitle:Title\|null, newTitle:Title\|null}` |
| `chronicle.moment.recorded` | `{momentId, tick, kind, prominence:'Minor'\|'Major', entityId:int\|null, nameSnapshot:string\|null, params:JsonValue}` |
| `housing.dwelling.upgraded` / `.downgraded` | `{dwellingId, fromLevel, toLevel}` |
| `housing.dwelling.at-risk` | `{dwellingId, level, unmetRequirements:string[]}` |
| `housing.resident.assigned` | `{dwellingId, entityId}` |
| `housing.resident.evicted` | `{dwellingId, entityId, reason:'CapacityReduced'\|'DwellingChanged'\|'DwellingRemoved'}` |
| `housing.rent.collected` | `{dwellingId, amount}` |
| `housing.rent.unpaid` | `{dwellingId, shortfall, reason:'InsufficientFunds'\|'TreasuryUnavailable'}` |
| `housing.goods.consumed` | `{dwellingId, materialId, quantity}` |
| `housing.immigrant.arrived` | `{entityId, prototypeId, dwellingId}` |
| `housing.immigration.blocked` | `{reason:'NoSeatOfGovernment'\|'NoArrivalCell'}` |

Wildcard subscribers in use: `status.*`, `settlement.**`, `inventory.item.*`, `housing.**`, `chronicle.**`.

---

## 5. Query facade (summary; full types in task 1.9 `Views.ts`)
`getTime, getEntity, getEntities(filter), getMap, getCell(mapId,cell), getZoneAt, getZones, getJobBoards, getPostings, getTownCriers, getConstructionQueue, getProductionOrders, getStandingOrders, getSteward, getSettlementProgress, isUnlocked, getUnlockedAt, getStatus, getStatuses, explain, getLedger, getFlowSummary, getIdentity, getJournal, getChronicle, getDwelling, getDwellingRequirementStatus, countDwellingsAtOrAbove, getTreasuryBalance, getTraderLedgers, getContent(registry), validatePlacement, findPath`. All return plain readonly JSON.

---

## 6. Spec errata (apply when implementing; `[edited]` = spec text already amended)

| # | Spec | Erratum |
|---|---|---|
| E-01 | 001 | US3 AC3 "10 ticks/sec" illustrative only; default 6250 ms/tick. Speed enum and calendar D-04; command/query names D-23. |
| E-02 | 002 | `getRelatedEntity` with several targets returns the lowest-id one (no throw). Relationship registry `RelationshipDef {name, component, field, direction, many}` registered per system. `Citizen.currentJob` (string) renamed `Citizen.currentJobTypeId`; entity link is `currentJobPostingId`. Traversal depth <= 5 with a visited set. `{contains}` operator for list fields. |
| E-03 | 003 | [edited] D-01. Task statuses extended; prototype serialization removed. |
| E-04 | 004 | D-05/D-21: map IDs int; pure pathing tie-break; locked door blocks, closed passes; geometry regenerated. |
| E-05 | 005 | [edited] D-07; canStore example numbers; weight tenths -> milli. |
| E-06 | 006 | [edited] D-05 root keys, counters, systems. |
| E-07 | 007 | [edited] D-06. |
| E-08 | 009 | [edited] "Room" -> "Site" (D-11); `objectCount` removed. |
| E-09 | 010 | [edited] D-02. |
| E-10 | 011 | [edited] D-03. |
| E-11 | 012 | [edited] pure tie-break (the spec cited "spec 004" for the PRNG; wrong). `PathResult` explicit. |
| E-12 | 013 | Mood/need scale milli-percent (D-04, D-25); mood->risk integer map; `ai.risk` stream; Mood is not a need. |
| E-13 | 014 | [edited] D-10: cancel semantics, no auto prerequisite chains, no variants. |
| E-14 | 015 | D-11: timing, reassign/reject, merge offers, furniture grammar. |
| E-15 | 016 | D-08/D-27: `started`/`claimed` events; board routing; BuildSite excluded from queries. |
| E-16 | 017 | [edited] D-08: posting fields, claim order, no PRNG tie, crier role. |
| E-17 | 018 | D-26: tie-breaks, filters, tier 2/3, locked chest. |
| E-18 | 019 | [edited] D-12/D-13; currency whole coins; milli valuation. |
| E-19 | 020 | D-20 formulas; `skill.work.completed` emitters (D-08); dominantSkill tie; growth example calibration. |
| E-20 | 021 | D-14; trade-agreement threshold = standing >= 20 for proposal and acceptance. |
| E-21 | 022 | D-15/D-16: engine prototypes, `run_tree`, wage + skillDomain on job types, `clearsTo`, category list, Hamlet ore source, trader prototypes with `refines`. |
| E-22 | 023 | D-22 carve-outs (unknown boundary, `.json` imports, bans in `src/game`). FR-007 severity error with exceptions. |
| E-23 | 024 | D-23: facade, clock, descopes; FR-010 "trade priorities" removed; procedural primitives; main-thread engine. |
| E-24 | 025 | D-18: pull model; settling rule; trade attribution; loose-pile prototype. |
| E-25 | 026 | D-19 defaults and ordering. |
| E-26 | 027 | D-16: dwelling tiers; Hamlet iron via trade; `ticksPerDay`. |
| E-27 | 028 | D-17: Arrived Minor; seenSkills; journalCapacity 16; SC-006 1 MB; beforeDelete name. |
| E-28 | 029 | D-28; `maxPathCells` -> `maxPathCost`. |

---

## 7. Descopes (owner decisions)
1. **Envoy combat** — envoys fail only by timeout (`unreachable`); no hostiles or raids. 021 envoy attack/destruction rules reduced to entity deletion.
2. **Touch support** — 024 FR-001 touch gestures removed; mouse and trackpad only.
3. **Trade-policy screen/command** — 024 FR-010 "trade priorities" and the matching US2 scenarios removed; no `SetTradePolicy`.
4. **External 3D models** — GUI uses generated primitive geometry only.
5. Everything in `docs/ROADMAP.md` is out of scope.

---

## 8. Implementation decisions (made while building; no owner review needed)

### D-31 Time, pipeline and counters (tasks 1.1; `src/game/time`, `src/game/engine`)
- `GameTime` (`time/GameTime.ts`) is a clock object, not commands: `pause/resume/setSpeed/setTickIntervalMs` methods (applied by the session, D-23), `advance()` (+1 tick, called only by the pipeline at slot 2), `restore(json)` (strict Zod, throws `GameTimeError`, no fallbacks), `serialize()`. It emits `game.paused/resumed/speed.changed` only when the value actually changes. `tickIntervalMs` is an integer `1..3_600_000`. Calendar helpers are pure functions of the tick (`toDay/toWeek/toMonth/toYear/tickOfDay/hourOfDay/toGameHours`; hours are whole hours).
- `TickPipeline` (`engine/TickPipeline.ts`): `enum TickSlot` (0..20) pinned to section 2 by a test that parses this file. Systems register `{id, slot, order, run(ctx)}`; execution order is `(slot, order, registration sequence)`. `ctx.tick` = `tickCount + 1` for the whole tick (so slots 0-1 see the tick being processed), `ctx.tickOfDay = tick mod ticksPerDay`. Built-ins: `tick.begin {tick}` emitted and flushed before any slot-0 system, `time.advance()` at the start of slot 2 (slot-2 systems see the new count), `bus.processQueue()` after the slot-20 systems. Paused => `tick()` returns false and does nothing. Registering during a tick takes effect next tick. A throwing system propagates.
- `AutoRunner` (`engine/AutoRunner.ts`): one chained timer through an injected `Scheduler {schedule, cancel}` (default `createTimerScheduler()` over `setTimeout`); re-reads `time.realDelayMs()` before every tick; no catch-up; keeps polling while paused (ticks are no-ops); if `tick()` throws the runner stops and rethrows.
- `IdCounters` (`engine/IdCounters.ts`): `enum CounterName` values = the D-05 root `counters` keys (`ProductionOrderId` = `nextOrderId`); **ids start at 1**; `allocate/peek/serialize/restore`; restore requires every key and rejects unknown keys. `EntityStore.restore` requires saved ids `< nextEntityId`, so restore counters first.
- Integer division inside `GameTime` uses a private exact `divideFloor`; the shared `FixedPoint.ts` of section 0 is not part of this task.

### D-32 ECS conventions (task 1.2; `src/game/ecs`)
- Component names are PascalCase (`/^[A-Z][A-Za-z0-9]*$/`), prototype ids lowercase snake_case. The 023 naming rule is relaxed to allow PascalCase **object-literal property names** (`{ Position: {...} }`) in `eslint.config.js`, because component names are map keys.
- `ComponentDefinition<Name, Data> = {name, schema: z.ZodType<Data>, defaults()}` made by `defineComponent`; definitions are plain values registered in a per-engine `ComponentRegistry`. `hasComponent(entity, def)` narrows to `WithComponent<typeof def>`.
- Entity JSON is `{id, prototype, components}`; `EntityStore` state is `{entities: Entity[]}` ascending by id (root key `entities`). Prototypes = `{id, components: {Name: partialOverrides}}`; merge order defaults < prototype < spawn overrides; spawn overrides may only name components the prototype has.
- Deletion is two-phase (`requestDelete`, `flushDeletions` at slot 17); pending entities are hidden from `entities()` and queries unless `includePendingDelete`; `serialize()` throws while any are pending. `entity.deleted.name` comes from `addBeforeDeleteHook` hooks (first non-null). `entity.spawned` reads `mapId/cellIndex` from a `Position` component when present, else null.
- Queries: path `Component.field[.sub]`; matcher = JSON value (deep equality), `{min?,max?}` (inclusive, numbers only) or `{contains}` (list fields); an object literal with only those keys is read as the operator. Missing component/field never matches. Everything is a full scan in ascending id order (no indexes, no caches).
- Relationships (E-02 detail): `RelationshipDefinition {name, component, field, direction: Forward|Inverse, many}`; the field holds an id, an id list or null. Forward reads the holder's field; Inverse scans for holders. `registerPair` registers both. `getRelatedEntities` throws `DanglingReference` for deleted forward targets; `getRelatedEntity` returns the lowest id or null; `traverseRelated` is breadth first, depth 1..5, visited set. `clearReferencesTo(store, registry, deletedId)` clears forward references and is meant to be called per removed entity at slot 17 by the engine.

### D-33 Task runtime and behavior-tree core (task 1.3; `src/game/task`, `src/game/behavior`)
- **Scheduling** (refines D-01): per entity (ascending id) at slot 6: finish pending cancellations -> wake `UntilTick`/`Predicate` waits -> run exactly one step of the `Running` task, else `start` the best `Pending` one (priority desc, id asc). A woken task is `Pending` with `wake != null` and resumes through `step`, not `start`. Cancellation is *requested* by setting `token` (arrival of a strictly higher priority, `cancel`, `interrupt`, parent finished) and carried out at the start of the entity's next slot-6 turn; the arrival starts in that same turn (SC-005). Entity deletion cancels synchronously and ungracefully from a `beforeDelete` hook. A task that never started is removed without calling `handler.cancel`. Raising a *pending* task above the running one counts as an arrival; changing the running task's priority never interrupts. A child never interrupts its own ancestor.
- **Record additions to D-01**: `TaskRecord.wake: {kind, data}|null` (why the task was woken; cleared after its next step) and `TaskHistoryEntry.reason: string|null`. `CancelReason.ParentFinished` (`parent_finished`) added: children still alive when their parent completes or fails are cancelled gracefully. `TaskQueue` validation: ids ascending, at most one `Running`, `waitFor` set exactly while `Waiting`.
- **Waits**: serialized `WaitCondition` kinds `event`, `child-task` (same entity only, usually from `ctx.spawnChild`), `until-tick`, and the added `predicate {predicateId, params}` evaluated once per tick for the waiting entity from a per-engine `WaitPredicateRegistry`. Event waits use one `**` bus subscription created in the `TaskSystem` constructor plus an in-memory index of entities with event waiters (`rebuildWaitIndex()` after `EntityStore.restore`); subscription order therefore never depends on a save. Wake data: event payload / `{taskId, outcome, reason}` / `{tick}` / null. A wait on a task that is no longer queued wakes immediately with its history outcome (or null). The minimum wait is one tick.
- A handler may declare `requires: string[]` of component names; if one is missing when the task is due, the task fails with `component_removed` without calling `cancel`. Exceptions thrown by handlers propagate out of the tick (as for pipeline systems).
- **Behavior trees**: DSL = D-15 (`run_tree` action with `params.treeId`, reserved id). Node ids and tree ids are lowercase snake_case; params values are string or integer. **Depth 5 is checked per tree** (root = depth 1, `run_tree` counts as a leaf), not through references; reference cycles are rejected at load and reference chains are capped at `maxSubTreeNesting = 8`. Trees load atomically via `BehaviorTreeRegistry.registerAll`. Conditions and actions are separate registries, both `(ctx) => success|failure|running`.
- **Interpreter** has memory: `AiState` (`{treeId, currentNode, running, lastActionTick}`, D-25 plus `running`) stores the child-index path to the running leaf (through `run_tree` via index 0). A running leaf is resumed directly; selectors/sequences do not re-evaluate earlier children while a descendant runs. A finished tree restarts at the root next tick. Saved paths are validated against the tree on use (`InvalidState`, no fallbacks). The slot-5 orchestration (utility choice, when to call `tick`) belongs to task 2.4; `utilityScoring.ts` only fixes the hook shape (`UtilityFactor`, `pickBestCandidate`: `base + sum`, ties lowest index).
- File layout note: `tsconfig.tools.json` now references `src/game` so `tests/` can import game code (integration test `tests/integration/taskBehaviorSaveLoad.test.ts`).

### D-34 Maps and terrain (task 1.4; `src/game/map`)
- **Map JSON** = D-05 plus `parentId: int|null` and `links: [{cell, targetMapId, targetCell}]` (ascending source cell, one link per cell). Square maps carry `width/height` and no `cellCount`/`relaxPasses`; Voronoi maps carry `params.cellCount` and no `width/height`; `relaxPasses` defaults to 2 and is saved explicitly. Seed is an integer `0..2^32-1`. Root key `maps` is an array ascending by id; `MapRegistry.restore` needs counters restored first and requires ids `< nextMapId`, parents with a smaller id, link targets that exist.
- **Voronoi build** (`voronoiGeometry.ts`): `Prng.create({seed}).stream("map.voronoi.sites")` draws distinct sites; Lloyd moves each site to the exact integer centroid (BigInt shoelace, halves up) of its Voronoi cell clipped to `0..65535`; final cell order = `floor(sqrt(cellCount))` horizontal bands by y, then x, then y; adjacency = Delaunay edges (Bowyer-Watson with a far super triangle; in-circle uses a double filter with a conservative error bound and falls back to BigInt, so the sign is always exact). Golden: 64x64 cells, seed 42, 2 passes, `hashGeometry` = `44ccef4c50a00a3e`.
- **Units**: square coordinates are milli-tiles (tile pitch 1000, centre at +500); Voronoi coordinates are the 0..65535 site units. `MapGeometry.stepUnit` is an upper bound of the centroid distance between adjacent cells (rounded up), to be used as `unit` of the D-21 A* heuristic.
- **Terrain registry**: `TerrainDefinition {id, moveCost: MoveCostClass, passable, blockReason}`; impassable terrain must have `water` or `impassable_cliff`, passable none. `blockReason(cell)` = impassable terrain reason, else the entity obstruction (`wall, locked, furniture`), else null. Obstructions are runtime-only, set by owner systems via `GameMap.setObstruction` (event `map.cell.obstruction.changed {traversable}` = effective traversability). A terrain change that flips passability emits only `map.terrain.changed` (D-21 invalidates on either event).
- `fill(terrain)` is silent (generation time, before `map.created` is consumed); `setTerrain` emits `map.terrain.changed` only when the value changes. `map.created` is emitted by `createMap`.
- **Occupants**: `OccupantIndex` (ascending ids, derived, rebuilt from `Position`); `Position` schema `{mapId>=1, cellIndex>=0}` strict. Placement or moves into a non-traversable cell throw `MapError(NotTraversable)`. The registry updates the index; the caller writes `Position`.
- **Links/travel**: links are map-level one-way records, `linkMaps({bidirectional})` creates both directions; `travel(entityId)` follows the link of the entity's cell atomically and emits `entity.map.changed {entityId, fromMapId, toMapId, cellIndex}`. Door/portal Transition entities (3.5) may call `transferEntity` instead. `deleteMap` is rejected while entities stand on the map, it has sub-maps, or another map links into it (D-21).
- **MapSize** (`mapDimensionsFor`): Voronoi 600/1200/2400 cells (D-06); square 30x20, 40x30, 60x40 (same counts).

### D-35 Inventory details (task 1.5; `src/game/inventory`)
- **API shape**: free functions, `ctx: InventoryContext = { materials, actor, bus?, resolver? }` first (D-07 `actor`), then the live `Entity`, then `materialId`, `quantity`. Queries take `materials` or only the entity. The reservation primitive (D-09) is task 3.2 and is not built here; the data shape needs nothing more than `queryable` and `getTotal`/`canRetrieve`.
- **Permission targets**: `{kind: entity|faction|role|anyone}`; `anyone` was added so "deny everybody except ..." is expressible. Faction and role membership come from an optional `ActorResolver` in the context (no resolver: faction/role rules never match). A `Transfer` rule matches `Store` and `Retrieve`; `Equip` covers `equip` and `unequip`. Order of checks: quantity, material, inventory present, permission, availability, capacity.
- **Errors**: `InventoryFullError` when slots are the shortage, `WeightLimitExceededError` when only weight is; transfers use `DestinationFullError` for the slot case. `InsufficientItemsError` takes precedence over destination errors in `transfer`.
- **Retrieve order**: soonest-to-expire stack first, then smallest, then lowest slot (reduces fragmentation; deterministic). `transfer` moves portions with their freshness and merges them at the destination with the FR-020a weighted floor.
- **Events**: `transfer` emits only `inventory.item.transferred` (no stored/retrieved pair); `credit`/`debit` emit `stored`/`retrieved` for the currency; `inventory.item.stack.merged {entityId, materialId, quantity}` is emitted only when a perishable store merges into an existing stack, quantity = items merged in. A swap emits `unequipped` then `equipped`.
- **Money**: `credit` is all-or-nothing (`InventoryFullError`/`WeightLimitExceededError`, balance unchanged); this resolves D-07's "storeUpTo semantic + InventoryFullError" without breaking SC-003. Balance counts general storage only. Currency id lives on `MaterialRegistry` (default `silver_penny`).
- **Weight and equipment**: equipped items count toward weight; equip/unequip are weight neutral and only check slot room. Equipped items drop their perishable timer and restart fresh on unequip. `getTotal`/`getAllItems` include equipment; `retrieve`/`canRetrieve` do not.
- **Component shape**: `{slotCount, weightLimitMilli|null, ownerId|null, queryable, slots, equipment, rules}`; slot `{materialId, quantity, remainingMilli|null, decayRateMilli|null}` (nulls instead of omitted fields, both set for perishables). Reduced `slotCount` below contents is legal (free slots clamp to 0). `ownerId` is informational.
- **Decay**: `decayInventory(entity, bus, {zoneModifierMilli, difficultyDecayMilli})` subtracts `combine(combine(combine(1000, zone), difficulty), stackRate)` milli-ticks per call (`combine` = 027 FR-014, in `inventoryMath.ts`); a stack at or below zero expires whole. The slot-3 system itself is registered by the engine bootstrap (1.8).


### D-36 Save format implementation (task 1.6; `src/game/save`)
- **API**: `saveGame(parts, {timestamp?}) -> string` (canonical `stableStringify`: sorted keys, integers only, no `-0`), `serializeGame` (root object), `parseSave(input, {sections, migrations?}) -> ParsedSave` (parse + newer-version reject + migrate + strict validation, touches no state), `loadGame(input, parts, {migrations?}) -> LoadResult`. `GameSnapshotParts = {time, prng: {prng}, bus, counters, store, maps, tasks, initOptions: {options}, sections}`; the engine (1.8) builds one per game. `prng` and `initOptions` are holders because load replaces the `Prng` object and the options value.
- **Restore order** (dependencies): counters, time, prng, event queue, entities, maps, `maps.rebuildOccupants(entities)`, `tasks.rebuildWaitIndex()`, init options, then registered sections ascending by `order` then registration. Subscriptions are never saved; systems create theirs at construction.
- **Atomic load**: `parseSave` validates everything cheap before any mutation (SC-004). If applying still throws, the previous state (captured with `saveGame` + `parseSave` first) is re-applied and the failure is rethrown as `InvalidSaveFormatError` (cause kept). Call `loadGame` between ticks with no entity pending deletion (`EntityStore.serialize` requires it).
- **Extension mechanism**: `SaveSectionRegistry.register({key, location: Root|Systems, schema, serialize, restore, order?, defaultForOlderSaves?})`. `Root` sections own a root key (`statuses`, `productionLedger`, `stewardship`); `Systems` sections own a `systems.<key>` entry. Root is strict: unregistered root keys or `systems` entries are rejected; registered sections are required in current-version saves. `defaultForOlderSaves` supplies the value only for saves that were migrated (a section introduced after that save's version), so a new section needs no empty-handed migration step. Schemas must be `z.ZodType<JsonValue>` (integers only).
- **Migrations**: `migrations/MigrationRegistry` holds one step per `fromVersion` (`n -> n+1`) over raw JSON; `createDefaultMigrations()` is the built-in chain, `currentSaveVersion` (saveTypes.ts) must be raised together with a new step (a test checks coverage). `migrateV0ToV1` renames `initOptions.difficulty` normal/hard to steady/harsh, adds `counters` derived from the highest entity, map and task ids (so no id is reused) and an empty `systems`.
- **Validation split**: root and core shapes are Zod here; `time`, `counters`, `entities`, `maps` are validated deeply by their own `restore` (strict, typed errors) and wrapped. `initOptions` is `{seed, difficulty: Difficulty, startingTier: string|null, mapSize: MapSize|null}` and ignores unknown fields (007). `Difficulty` enum lives in `save/initOptions.ts` until 027 moves it.
- **Hash helper**: `hashText`, `hashSaveText` (timestamp neutralised) and `hashGameState(parts)`: 64-bit two-lane FNV-style hash, 16 hex characters, for determinism tests (not for security).
- **Fixed point**: `engine/fixedPoint.ts` (lowercase file name, since the 023 file-name rule needs an export named after a PascalCase file): `FixedUnit {Int, Milli, Permille}`, `decimalToFixed` (exact via decimal text, rejects values needing rounding), `fixedPointSchema(unit)` for the content loader (1.7), and `floorDiv/ceilDiv/truncDiv`. This is the helper module D-0 called `FixedPoint.ts`.
