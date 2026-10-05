# Feature Specification: Standing Orders & Steward

**Created**: 2026-10-05
**Input**: User description: "Standing orders: let the player say 'keep 20 bread in stock' or 'keep tools above 5' once, and a Steward reposts jobs on the job boards automatically, without losing the charm of criers walking to boards; a bell tower or notice posts can later shorten the walking as an unlock."

## User Scenarios & Testing

### User Story 1 - Keep a Material in Stock (Priority: P1)

The player creates a **standing order** such as "keep 20 Bread in stock". From then on the settlement's **Steward** checks the stock once per game day at a fixed review tick. When the counted stock has fallen to the order's restock threshold, the Steward works out how many recipe runs are missing and posts that many `craft.produce` jobs (spec 022 job type) on a user-managed job board as ordinary spec 017 postings. Town Criers carry the postings to the board as they carry any other board update (spec 017 FR-010 to FR-012). Workers claim the runs at the board in the usual selection order (spec 017 FR-007) and bake. The player never re-issues the job.

**Why this priority**: This is the whole feature. Without it the player must re-post every production job by hand, which is the micromanagement this spec removes.

**Independent Test**: Headless. Build a settlement with a Throne Room, an appointed Steward, one Town Crier, a user-managed board, a Bakery with an Oven, flour in a chest and 5 Bread in storage. Create the order "keep 20 Bread, restock at 15" for a recipe that yields 4 Bread per run. Advance to the review tick. Verify that 4 runs are queued for the board (ceil((20 − 5) / 4) = 4), that a crier walks them to the board, that the postings appear only when the crier arrives, and that once the runs complete and the bread is stored the next review posts nothing.

**Acceptance Scenarios**:

1. **Given** an order "keep 20 Bread, restock at 15" and 5 Bread counted, **When** the daily review runs, **Then** the Steward queues ceil((20 − 5) / outputPerRun) one-run postings for its posting board and emits `steward.review.completed` with the number of postings added.
2. **Given** queued Steward postings, **When** no Town Crier has reached the board yet, **Then** the board still shows its old state and the order reports the pending postings as in flight.
3. **Given** an order whose counted stock is at or above its target, **When** the review runs, **Then** no posting is added.
4. **Given** an order defined by material only (`bread`) and exactly one recipe whose outputs contain `bread`, **When** the order is created, **Then** that recipe is resolved and stored on the order.
5. **Given** an order defined by material only and two recipes that both produce that material, **When** the order is created, **Then** creation is rejected with `StandingOrderError.AmbiguousRecipe` listing the candidate recipe IDs, and the player must name one.
6. **Given** the game is saved between the review and the crier's arrival, **When** it is loaded, **Then** the orders, their owned postings (pending, open and claimed) and the crier's payload are restored and the next review gives the same result as an uninterrupted run.

---

### User Story 2 - Never Over-Post: Hysteresis and Withdrawal (Priority: P1)

A standing order has a target and a lower restock threshold. The Steward starts restocking only when stock falls to the threshold, and keeps restocking until stock reaches the target. The gap between the two stops the Steward posting one run every day for each loaf eaten. The Steward counts the runs it already has in flight, so it never posts more runs than the deficit needs. If stock recovers by other means (a trade, a gift, a hauler emptying a cart), the Steward withdraws postings that nobody has claimed yet.

**Why this priority**: Over-posting wastes inputs and labour and floods the boards. Players will only trust automation that holds steady and does not run away. The hysteresis and the over-posting guard are the correctness core of the feature.

**Independent Test**: Headless. Put 4 Steward postings on a board for the order "keep 20 Bread, restock at 15". Before anyone claims them, add 16 Bread to storage by direct inventory store. Run the review and verify that every unclaimed posting is queued for withdrawal and that no new posting is added. Then reduce the stock to 17 and verify that the next review adds nothing, because 17 is above the threshold of 15.

**Acceptance Scenarios**:

1. **Given** an order in the `Satisfied` state with stock 17, threshold 15 and target 20, **When** the review runs, **Then** no posting is added (stock is above the threshold).
2. **Given** an order in the `Satisfied` state whose stock falls to 15, **When** the review runs, **Then** the order enters `Restocking`, emits `standing-order.restock.started`, and posts the runs it is missing.
3. **Given** an order in `Restocking` with stock 18 and 1 open run yielding 4, **When** the review runs, **Then** no posting is added, because 1 run is already enough to cover the deficit of 2.
4. **Given** an order in `Restocking` with 3 unclaimed and 1 claimed owned runs, **When** stock reaches the target, **Then** the order enters `Satisfied`, emits `standing-order.satisfied`, and queues withdrawal of the 3 unclaimed runs. The claimed run is allowed to finish.
5. **Given** a queued withdrawal, **When** a worker claims that posting before the crier arrives, **Then** the withdrawal is a no-op for that posting, the run finishes normally, and no error is raised.
6. **Given** a deficit that would need 12 runs and `maxOpenRunsPerOrder` = 5, **When** the review runs, **Then** at most 5 owned runs (pending, open and claimed together) exist after the review. The rest are posted at later reviews.

---

### User Story 3 - Appoint the Steward (Priority: P1)

The player appoints one adult humanoid of the player faction as Steward. It is an office, not a profession (spec 020). "Steward" is a title held by the citizen and shown as an office with its name (spec 028 FR-009). The office belongs to the seat of government: reviews run only while an active Throne Room exists (spec 022 zone catalog; spec 017 FR-011). Each day, starting at the review tick, the Steward sits in the Throne Room for a short audience. While the audience lasts the Steward claims no job-board work, so the office costs one worker a little time each day.

**Why this priority**: Without the Steward nothing evaluates the orders. The appointment also ties the feature to the existing governance anchor, the Throne Room, instead of making it a disembodied automation.

**Independent Test**: Headless. Create orders with no Steward appointed and verify that the review is skipped and each order reports blocked reason `NoSteward` (spec 025). Appoint a Steward and verify the next review runs. Remove the Throne from the Throne Room and verify the review is skipped with `NoSeatOfGovernment`. Kill the Steward and verify `steward.dismissed` with reason `Died`, after which reviews stop.

**Acceptance Scenarios**:

1. **Given** an adult humanoid member of the player faction (spec 021 FR-002), **When** the player appoints it Steward, **Then** the appointment is recorded, `steward.appointed` is emitted, and any previous Steward is dismissed with reason `Replaced`.
2. **Given** a child, a non-humanoid, a non-member, or an entity that is currently a Town Crier, **When** the player tries to appoint it, **Then** the command is rejected with `StandingOrderError.IneligibleSteward`.
3. **Given** no Steward, or a Steward but no active Throne Room, **When** the review tick passes, **Then** no order is evaluated, every active order reports blocked reason `NoSteward` or `NoSeatOfGovernment` (spec 025), and existing owned postings stay on their boards untouched.
4. **Given** an appointed Steward, **When** the review tick arrives, **Then** the review is computed at that tick wherever the Steward stands, and the Steward is given a `govern.steward_audience` task in the Throne Room lasting `stewardAudienceTicks`.
5. **Given** the Steward dies or leaves the player faction, **When** that happens, **Then** the office becomes vacant and `steward.dismissed` is emitted with a `StewardVacancyReason` (`Dismissed`, `Replaced`, `Died`, `LeftFaction`).

---

### User Story 4 - Criers Still Walk: Posting Board and Delivery (Priority: P2)

Every change the Steward makes, whether adding or withdrawing a posting, becomes a spec 017 PendingBoardUpdate. Town Criers from the Throne Room deliver it exactly as they deliver the player's own board changes. Each order posts to one user-managed board: its own `postingBoardId` if set, otherwise the settlement's Steward board, otherwise the user-managed board nearest the Throne Room. A board far from the Throne Room is therefore slower to restock than a near one, and the crier fleet becomes a real logistics constraint.

**Why this priority**: This keeps the physical charm of spec 017 (distance and timing matter) while the player stops micromanaging. It is P2 because a single board next to the Throne Room already satisfies US1.

**Independent Test**: Headless. Give one order a board 5 cells from the Throne Room and another order a board 50 cells away. Verify that the far board's postings appear measurably later. With no Town Crier free, verify that the Steward's changes queue and each order reports `AwaitingTownCrier` (spec 025) until a crier departs.

**Acceptance Scenarios**:

1. **Given** an order with no `postingBoardId` and no Steward board set, **When** the review posts runs, **Then** they target the user-managed board with the shortest path distance (spec 012) from the Throne Room, ties broken by lowest entity ID.
2. **Given** a `postingBoardId` that names a system-managed board, **When** the order is created or updated, **Then** the command is rejected with `StandingOrderError.BoardNotUserManaged` (spec 017 FR-009).
3. **Given** the order's posting board is destroyed, **When** the next review runs, **Then** the Steward falls back to the next board in the selection order and re-posts the runs it is missing there. Postings lost with the destroyed board are no longer counted as in flight.
4. **Given** no reachable user-managed board exists, **When** the review runs, **Then** nothing is queued and the order reports `NoReachableJobBoard` (spec 025).
5. **Given** Steward changes and player changes pending for the same board, **When** a crier departs, **Then** it carries both together in one payload (spec 017 FR-012).

---

### User Story 5 - Zone-Scoped Orders (Priority: P2)

An order can count stock in one zone instead of the whole settlement, for example "keep 10 Bread in the Pantry" or "keep 6 Iron Hammers in the Armory". Only storage furniture standing on that zone's tiles counts. Hauling for the order's runs tries that zone's storage first, so the produced goods actually arrive where the order counts them.

**Why this priority**: Zone scope lets a player stock a tavern cellar or an armory deliberately. It is P2 because a settlement-wide order covers the basic need.

**Independent Test**: Headless. Create an order scoped to a Pantry zone, with 30 Bread elsewhere in the settlement and 2 in the Pantry. Verify that the review counts 2, posts runs, and that the completed bread is hauled into the Pantry's chest even though a nearer general stockpile has space.

**Acceptance Scenarios**:

1. **Given** a zone-scoped order, **When** stock is counted, **Then** only storage furniture on that zone's tiles (spec 015 FR-016) and items being hauled to that storage are counted.
2. **Given** a run owned by a zone-scoped order completes, **When** its output is hauled, **Then** compatible storage in the scope zone is tried before the spec 018 FR-010 routing tiers. If that storage has no capacity, normal routing applies.
3. **Given** the scope zone is deleted, **When** the next review runs, **Then** the order goes to `Blocked` with reason `ScopeZoneMissing`, its unclaimed postings are queued for withdrawal, and the order is kept so the player can re-scope or delete it.
4. **Given** a settlement-scoped order and a zone-scoped order for the same material, **When** both are reviewed, **Then** each counts only its own scope and its own owned runs. They are evaluated independently, in review order (FR-011).

---

### User Story 6 - Notice Posts and the Bell Tower Shorten the Walk (Priority: P3)

As the settlement grows (spec 027 tiers), two pieces of infrastructure shorten the crier delay for every user-managed board update, the Steward's and the player's alike:

- **Notice Post** (furniture, `unlockTier: "village"`). A crier whose trip includes boards within `noticePostRadius` of a Notice Post walks to the post instead of to each board. Pinning the notice there applies the pending updates of every board the post serves.
- **Bell Tower** (zone type, `unlockTier: "market_town"`, needs a Church Bell). The bell rings at the canonical hours (`bellRingTicksOfDay`). At each ring, every pending update for a board within `bellRadius` of an active Bell Tower is applied at once. Criers carrying only those updates turn back.

**Why this priority**: These are later-game rewards that lean on spec 027. The core loop works without them.

**Independent Test**: Headless. Place three user-managed boards in a market square with a Notice Post among them, queue updates for all three, and verify that the crier visits only the post and that all three boards update when it arrives. Then make an active Bell Tower whose bell is within `bellRadius` of one board, queue an update for that board just before a ring tick, and verify that the update is applied at the ring tick with `via: BellTower` and that the crier is released.

**Acceptance Scenarios**:

1. **Given** the settlement is below the tier in a prototype's or zone type's `unlockTier` (spec 027), **When** the player tries to build a Notice Post or designate a Bell Tower, **Then** the command is rejected with `ContentLockedError` (spec 027 FR-008).
2. **Given** a board served by a Notice Post, **When** the crier arrives at the post, **Then** that board's pending updates are applied and `jobboard.update.applied` is emitted with `via: DeliveryMethod.NoticePost`.
3. **Given** a board within range of two Notice Posts, **When** a route is planned, **Then** the board is served by the nearer post (adjacency-graph hops), ties broken by lowest entity ID.
4. **Given** an active Bell Tower and a pending update for a board within `bellRadius`, **When** a ring tick arrives, **Then** the update is applied at that tick with `via: DeliveryMethod.BellTower` and `bell-tower.rang` is emitted. Any crier payload for that board is cleared, and a crier left with an empty payload returns to the Throne Room.
5. **Given** the Bell Tower zone loses its requirements (Church Bell removed), **When** a ring tick arrives, **Then** nothing is rung and updates go only by crier and Notice Post.

---

### User Story 7 - Standing Orders in the Game Application (Priority: P2)

In the spec 024 application the player opens a **Standing Orders** panel listing every order with its counted stock against its target and threshold, the runs it has in flight, its state, and the blocked reason badge from spec 025. A "Keep in stock…" action on any material record, inventory row or recipe card pre-fills a new order. The citizen panel offers "Appoint as Steward". Pending Steward postings appear in the existing pending-command list (spec 024 FR-011), together with the delivering crier, Notice Post or next bell ring.

**Why this priority**: Casual players reach the feature through the UI. It is P2 because the headless engine is complete without it.

**Independent Test**: In the app, right-click Bread in a chest's inventory, choose "Keep in stock…", enter 20, and confirm. Verify that the order appears in the panel with stock and target, and that after the review a pending posting with its crier is listed.

Renderer requirements: Standing Orders panel spec 024 FR-029, "Keep in stock…" action FR-030, appoint/dismiss Steward FR-031, Steward postings in the pending list FR-032, Notice Post and Bell Tower models FR-033.

**Acceptance Scenarios**:

1. **Given** the Standing Orders panel, **When** the simulation ticks, **Then** each row's counted stock, in-flight runs, state and blocked reason update live (spec 024 FR-009).
2. **Given** a material record, **When** the player chooses "Keep in stock…" and the material has several producing recipes, **Then** the dialog asks the player to pick one before confirming.
3. **Given** no Steward is appointed, **When** the player opens the panel, **Then** a banner states that no Steward holds office and links to the eligible citizens.

---

### Edge Cases

- **Recipe inputs are missing.** The Steward still posts the runs. The postings are blocked at claim time (spec 017 edge cases), and the order reports `MissingInput{materialId}` (spec 025). The Steward does not chain-post input production. The player adds an order for the input (for example flour) if they want one.
- **No workstation exists for the recipe.** The runs are posted, and the order reports `MissingWorkstation` (spec 025).
- **A skill `outputBonus` (spec 020 FR-007) makes a run yield more than `outputPerRun`.** Stock may overshoot the target by the bonus. That is allowed. The guard limits postings, not luck.
- **The target material is also a byproduct of another recipe (spec 014 FR-019).** Byproduct units count as stock once stored. Only the order's own recipe is posted.
- **The material is harvested, not crafted (logs, fish, stone).** Order creation is rejected with `StandingOrderError.NoProducingRecipe`. **Open question:** spec 022 FR-024 adds an optional `outputs` field to gathering job types such as `fell.trees` and `fish.catch`, but its per-job-type values are not authored yet (open question in spec 022 FR-024), so the Steward cannot yet convert a deficit into a number of harvest jobs. Harvest standing orders need those `outputs` values, and a rule for choosing the job type, before they can be allowed.
- **The order is for a category such as "tools" rather than one material.** v1 orders name one material or one recipe. **Open question:** "keep tools above 5" read as a category order (spec 014 FR-001 `categories`) needs a rule for which recipe or recipes to post against a category deficit, such as the cheapest by spec 019 material `value` or a player-ordered list.
- **The player edits an order (target, threshold, priority, board).** The change applies at the next review. "Review now" (FR-017) applies it at the next tick.
- **The order is paused.** Paused orders are skipped by the review. At the next review their unclaimed owned postings are queued for withdrawal. Claimed runs finish.
- **The order is deleted.** Unclaimed owned postings are queued for withdrawal, claimed runs finish, and the order's record of owned postings is dropped once the last run ends.
- **A crier carrying Steward postings is destroyed (spec 017 edge cases).** Those postings are lost and no longer counted as in flight. The next review re-posts the runs still missing.
- **Bread sits in the Oven's inventory because the recipe's `outputDestination` is Workstation (spec 014 FR-009).** For settlement-scoped orders, unreserved units in workstation inventories count as stock, so the Steward does not post again while bread waits to be hauled.
- **Two orders target the same material and the same scope.** Rejected with `StandingOrderError.DuplicateOrder`. At most one order exists per (material, scope).
- **The order's recipe is locked by tier.** Creating or updating an order for a recipe whose `unlockTier` is above the current tier (spec 027 FR-007) is rejected with `ContentLockedError { contentKind: Recipe, contentId, requiredTier }` (spec 027 FR-008). An order for a locked recipe loaded from a scenario or save posts nothing and reports `LockedByTier` (spec 025) until the tier is reached.
- **The settlement drops below the tier that unlocked a recipe.** This cannot happen, because spec 027 tiers are permanent. If a loaded save references a recipe that no longer exists, the dangling reference is a load error (spec 022 FR-015).
- **The review tick arrives while the game loop is paused.** No tick runs, so no review runs. The review happens when that tick is processed.

## Requirements

### Functional Requirements

#### Standing orders

- **FR-001**: The engine MUST support a **StandingOrder** record with the fields: `orderId` (integer, assigned from a monotonic counter in state), `materialId` (target material content ID), `recipeId` (the recipe whose runs are posted), `targetQuantity` (integer ≥ 1), `restockThreshold` (integer, 0 ≤ threshold < target), `scope` (`StandingOrderScope` enum: `Settlement` or `Zone`, plus `zoneId` when the scope is `Zone`), `priority` (integer, used as the posting priority of spec 017 FR-003), `postingBoardId` (entity ID or null), `paused` (boolean), and the derived `state` (`StandingOrderState` enum: `Satisfied`, `Restocking`, `Blocked`, `Paused`).
- **FR-002**: Creating an order MUST accept either a `materialId` or a `recipeId`. Given only a material, the engine resolves the recipe whose `outputs` (spec 014 FR-002) contain that material. With zero candidates the command is rejected with `StandingOrderError.NoProducingRecipe`. With more than one candidate it is rejected with `StandingOrderError.AmbiguousRecipe`, and the error lists the candidates. Given only a recipe, the target material is the recipe's first listed output. Given both, the recipe MUST output the material. `outputPerRun` is that recipe's output quantity of the target material.
- **FR-003**: If `restockThreshold` is omitted, it defaults to `floor(targetQuantity × defaultRestockFraction / 1000)`, where `defaultRestockFraction` is a fixed-point content constant (default 750). The result is clamped to `targetQuantity − 1`.
- **FR-004**: Order commands MUST be validated, and an invalid command is rejected with a typed `StandingOrderError` enum value and leaves state unchanged. The values are: `NoProducingRecipe`, `AmbiguousRecipe`, `InvalidQuantity`, `DuplicateOrder` (same material and scope), `UnknownZone`, `BoardNotUserManaged`, `IneligibleSteward`, `TooManyOrders` (more than the content constant `maxStandingOrders`). A tier-locked recipe is rejected with the spec 027 `ContentLockedError` instead (spec 027 FR-008); spec 027 FR-011 guarantees that a recipe is never unlocked before its workstation.
- **FR-005**: The engine MUST expose the commands `createStandingOrder`, `updateStandingOrder`, `pauseStandingOrder`, `resumeStandingOrder`, `deleteStandingOrder`, `appointSteward`, `dismissSteward`, `setStewardBoard` and `requestStewardReview`. It MUST also expose the query `getStandingOrders()`, which returns for each order its fields, `countedStock`, `ownedRuns` by status (pending-add, open, claimed), `state`, and the current spec 025 `BlockedReason` (or null).

#### Counting stock

- **FR-006**: An order's **counted stock** MUST be the sum, over the order's scope, of the following quantities of `materialId`: (a) the spec 025 FR-013 `stock` definition restricted to the scope: units in the inventories of storage furniture (spec 018 FR-001/FR-002), excluding household storage on dwelling tiles (spec 029 FR-017); (b) for `Settlement` scope only, unreserved units in workstation inventories (spec 014 FR-006, excluding inputs locked under spec 014 FR-013); (c) units carried by entities executing a `haul.deliver` task whose destination is storage furniture in scope. For `Settlement` scope, the scope is every map of the player's settlement (the main map and its sub-maps, spec 004). For `Zone` scope, it is the furniture on the zone's tiles (spec 015 FR-016). Units in citizens' personal inventories, at build sites, in loose piles and in household storage are not counted. For `Settlement` scope, term (a) equals `getFlowSummary(materialId).stock` (spec 025 FR-013).
- **FR-007**: Stock counting MUST be a pure read of current state, computed when the review evaluates the order. It consumes no PRNG draw (spec 011) and has no side effects.

#### Review

- **FR-008**: The Steward review MUST run once per game day at tick-of-day `stewardReviewTickOfDay` (a content constant in [0, ticksPerDay − 1]; ticksPerDay = 288 per spec 001, default 72 = the sixth hour), and additionally at the next tick after a `requestStewardReview` command (FR-017). It runs only if a Steward is appointed and an active Throne Room exists (FR-013). It never depends on wall-clock time.
- **FR-009**: Each order MUST track its **owned runs**: the Steward-created one-run postings and their status, which is `PendingAdd` (in a PendingBoardUpdate not yet delivered), `Open` (on the board, unclaimed), or `Claimed` (a spec 017 JobClaim in progress). A run stops being owned when it completes, is abandoned without reposting, is withdrawn, or is lost with its board or crier.
- **FR-010**: For each order that is not paused, the review MUST apply this hysteresis and posting rule:
  1. If the state is `Satisfied` and `countedStock ≤ restockThreshold`, the state becomes `Restocking` and `standing-order.restock.started` is emitted.
  2. If the state is `Restocking` and `countedStock ≥ targetQuantity`, the state becomes `Satisfied` and `standing-order.satisfied` is emitted.
  3. `desiredRuns` is `min(maxOpenRunsPerOrder, ceil((targetQuantity − countedStock) / outputPerRun))` when the state is `Restocking`, and 0 otherwise.
  4. If `ownedRuns < desiredRuns`, the Steward queues `desiredRuns − ownedRuns` new postings. If `ownedRuns > desiredRuns`, it queues withdrawal of unclaimed owned runs, `PendingAdd` first and then `Open`, newest first, until `ownedRuns` would equal `desiredRuns` or no unclaimed run remains. Claimed runs are never withdrawn.
- **FR-011**: The review MUST evaluate orders in a fixed order: `priority` descending, then `orderId` ascending. Given identical state, the review MUST produce identical queued changes. No randomness is used.
- **FR-012**: Each Steward posting MUST be a standard spec 017 JobPosting with job type `craft.produce` (spec 022), parameter `recipeId`, concurrency 1, recurrence one-time (spec 017 FR-006), priority = the order's `priority`, and the metadata `standingOrderId` and, for `Zone` scope, `deliverToZoneId`. Claiming, execution, gathering and workstation selection follow specs 017 and 014 unchanged.

#### Steward and seat of government

- **FR-013**: At most one Steward MUST hold office at a time. Eligibility: an adult humanoid (the spec 016 FR-001b prerequisite) that is a member of the player faction (spec 021 FR-002) and is not a Town Crier (spec 017 FR-012). The office is recorded as settlement state (`stewardEntityId`), not as a profession component (spec 020). If no active Throne Room exists (spec 015 FR-008), the office stays filled but reviews are skipped.
- **FR-014**: When the review is skipped because there is no Steward or no active Throne Room, every non-paused order MUST report the spec 025 `BlockedReason` `NoSteward` or `NoSeatOfGovernment`, and `status.blocked` is emitted per spec 025. Owned postings are left untouched.
- **FR-015**: At each review the Steward MUST receive a `govern.steward_audience` task: walk to the Throne Room and stay there for `stewardAudienceTicks` (content constant, default 12 = one game hour). The task takes precedence over job-board work but not over critical needs (spec 013 FR-003). The review's outcome does not depend on whether the audience happens.
- **FR-016**: The office MUST become vacant, with `steward.dismissed` emitted carrying a `StewardVacancyReason` enum (`Dismissed`, `Replaced`, `Died`, `LeftFaction`), when the player dismisses or replaces the Steward, when the Steward entity is destroyed, or when it leaves the player faction.
- **FR-017**: `requestStewardReview` MUST schedule one extra review for the next tick. Repeated requests before that tick collapse into one. The extra review does not move the next daily review.

#### Delivery

- **FR-018**: Every addition or withdrawal the Steward queues MUST be a spec 017 PendingBoardUpdate on the order's posting board. It is dispatched, carried and applied by Town Criers under spec 017 FR-010 to FR-013, merged with any player changes for the same board. If a withdrawal reaches a posting that has meanwhile been claimed, that withdrawal is a no-op.
- **FR-019**: The posting board for an order MUST be resolved at each review in this order: the order's `postingBoardId`, then the settlement's Steward board (`setStewardBoard`), then the reachable user-managed board with the shortest path distance (spec 012) from the Throne Room, with ties broken by lowest entity ID. Only user-managed boards are eligible (spec 017 FR-008/FR-009). If the resolved board differs from the board holding the order's unclaimed runs, those runs are withdrawn from the old board and re-posted on the new one.
- **FR-020**: Hauling of outputs from runs carrying `deliverToZoneId` MUST try compatible storage furniture in that zone before the spec 018 FR-010 tiers. If no such storage has capacity, routing falls back to spec 018 FR-010.

#### Unlocks

- **FR-021**: Content MUST define a **Notice Post** furniture prototype (`notice_post`, `unlockTier: "village"` per spec 022 FR-022 and spec 027 FR-007). A user-managed board is **served** by a Notice Post when its hop distance on the map adjacency graph (spec 004) is ≤ `noticePostRadius` (content constant). If several posts serve a board, the nearest serves it, ties broken by lowest entity ID. When planning a trip (spec 017 FR-012), a crier visits a served board's Notice Post instead of the board. On arrival it applies the pending updates of every board that post serves.
- **FR-022**: Content MUST define a **Bell Tower** zone type (`bell_tower`, not a room, requiring 1× Church Bell from spec 022, `unlockTier: "market_town"` per spec 022 FR-022 and spec 027 FR-007). At each tick-of-day listed in `bellRingTicksOfDay` (content; default the canonical hours Prime 72, Terce 108, Sext 144, None 180, Vespers 216), each active Bell Tower rings and emits `bell-tower.rang`. Every pending board update whose target board's hop distance from the tower's Church Bell is ≤ `bellRadius` is applied at that tick and removed from any crier payload or queue. A crier left with nothing to deliver returns to the Throne Room.
- **FR-023**: Notice Posts and Bell Towers MUST apply to all user-managed board updates, the player's as well as the Steward's. `jobboard.update.applied` MUST carry `via` (`DeliveryMethod` enum: `TownCrier`, `NoticePost`, `BellTower`).

#### Events, status and persistence

- **FR-024**: The engine MUST emit the following events (spec 010 naming): `standing-order.created`, `standing-order.updated`, `standing-order.paused`, `standing-order.resumed`, `standing-order.deleted`, `standing-order.restock.started`, `standing-order.satisfied`, `steward.appointed`, `steward.dismissed`, `steward.review.completed` (payload `{ tick, ordersEvaluated, postingsQueued, withdrawalsQueued }`), `steward.review.skipped` (payload `{ tick, reason }`) and `bell-tower.rang`.
- **FR-025**: Each order MUST expose a spec 025 `BlockedReason` when it cannot progress. Standing orders are a status-bearing subject (`StatusSubjectKind.StandingOrder`, spec 025 FR-001). An order uses these spec 025 FR-003 kinds: `NoSteward`, `NoSeatOfGovernment`, `LockedByTier`, `ScopeZoneMissing`, `NoReachableJobBoard`, `AwaitingTownCrier`, `MissingInput`, `MissingWorkstation`, `NoQualifiedWorker` and `Paused` (`Paused { standingOrderId }` for a paused order, or propagated from its runs or board). An order with a blocked reason other than `Paused` is in state `Blocked`.
- **FR-026**: All standing-order state MUST serialize to GameState (spec 006) under the root key `stewardship` (spec 006 FR-004a): the order list, the `nextOrderId` counter, owned runs with their status and board, `stewardEntityId`, the Steward board, the pending extra-review flag and the last review tick. All numbers MUST be integers (spec 006 FR-014). Loading MUST resume identically.
- **FR-027**: Content constants (`stewardReviewTickOfDay`, `stewardAudienceTicks`, `maxOpenRunsPerOrder`, `maxStandingOrders`, `defaultRestockFraction`, `noticePostRadius`, `bellRadius`, `bellRingTicksOfDay`) MUST be defined in the spec 022 FR-023 content-constants table and validated by Zod (spec 022 FR-016/FR-018). Out-of-range values are load errors.

### Key Entities

- **StandingOrder**: A player-defined instruction to keep a material at a target quantity within a scope. It holds the target material and the recipe to post, the target and threshold, the scope, the priority, the posting board override, the paused flag, the derived state, and its owned runs. It is not an ECS entity. Its integer `orderId` comes from a counter in state. It is serializable.
- **OwnedRun**: The link between a StandingOrder and one Steward-created one-run job posting: board entity ID, posting reference (provisional until a crier delivers it), and status (`PendingAdd`, `Open`, `Claimed`).
- **Steward office**: Settlement state naming the entity that holds the office (or null). Its existence depends on an active Throne Room. "Steward" is a descriptive title, not a component.
- **Steward review**: The deterministic daily evaluation of all orders (FR-008 to FR-012). It produces queued PendingBoardUpdates and events.
- **Notice Post**: A furniture entity, `unlockTier: "village"`, that lets criers serve every nearby user-managed board from one stop.
- **Bell Tower**: A zone type, `unlockTier: "market_town"`, whose Church Bell applies pending updates for nearby boards at fixed canonical-hour ticks.
- **Enums**: `StandingOrderScope`, `StandingOrderState`, `StandingOrderError`, `StewardVacancyReason`, `DeliveryMethod` (spec 023 FR-005).

## Success Criteria

### Measurable Outcomes

- **SC-001**: In a headless scenario with daily bread consumption, an order "keep 20 Bread" with one Steward, one crier and one baker holds bread stock between the threshold and target + `outputPerRun` for 10 consecutive game days without any player command after the order is created.
- **SC-002**: Over-posting guard: in 100% of tested reviews, the number of owned runs after the review is ≤ `max(claimedRuns, desiredRuns)`, where `desiredRuns` is defined in FR-010 and `claimedRuns` is the number of owned runs already claimed at review time. When `claimedRuns ≤ desiredRuns` and a board is available, the number equals `desiredRuns`.
- **SC-003**: Hysteresis: with stock oscillating between threshold + 1 and target − 1, a `Satisfied` order adds 0 postings in 100% of reviews.
- **SC-004**: Determinism: two runs from the same save and the same commands produce byte-identical standing-order state and an identical sequence of events across 30 game days.
- **SC-005**: Save/load in the middle of every phase (pending-add, open, claimed, withdrawal pending) restores identical owned-run records, with no lost or duplicated posting.
- **SC-006**: A board 50 cells from the Throne Room shows Steward postings measurably later than a board 5 cells away. With an active Bell Tower in range, the delay is bounded by the gap to the next ring tick.
- **SC-007**: A review of 50 orders over a settlement with 200 storage furniture entities completes in under 5 ms.
- **SC-008**: A player creates a working standing order from the spec 024 UI in at most 3 interactions from a material shown in an inventory row.

## Assumptions

- **Standing orders replace the spec 014 "maintain N in stockpile" form.** Per-workstation production orders with a fixed quantity (spec 014 FR-016) remain. The settlement-level "keep N" form moves to this spec so that two systems never both try to keep the same stock topped up.
- **Steward postings are ordinary jobs.** The worker walks to the board, claims the run, gathers inputs and picks the nearest valid workstation exactly as for a player-posted `craft.produce` job. This spec adds no new work-execution path.
- **Daily cadence is enough.** One review per day (30 real minutes at 1x, spec 001) plus crier travel is slow on purpose, which leaves room for the Bell Tower unlock. "Review now" covers impatience.
- **Stock counting deliberately goes beyond storage furniture**, adding unreserved workstation output and goods in hauling (FR-006). The main source of counted stock is still the spec 025 FR-013 `stock` (spec 018 storage furniture, household storage excluded). The additions only stop double-posting while goods are still on their way to it.
- **Standing orders feed the houses.** Households fetch their supplied goods (ale, candles, cloth) from settlement storage (spec 029 FR-016), which lowers counted stock. An order such as "keep 20 Ale in stock" is the expected way to keep dwellings supplied; no special household order type exists.
- **The Steward feature is available from the Hamlet tier.** Only the delivery shortcuts are tier-gated.
- **No wages or skill effect for the office.** The audience is the only cost. **Open question:** whether a stewardship skill (spec 020) should affect anything, such as `maxOpenRunsPerOrder` or catching more input shortages, is unresolved.

## Design Decisions (proposed — pending user review)

- Q: Does the Steward post on system-managed workstation boards (through spec 014 production orders) or on user-managed boards? → A: On user-managed boards only, through spec 017 PendingBoardUpdates carried by Town Criers. This is what keeps "criers walking to boards". System-managed boards stay owned by their zone or production orders (spec 017 FR-009).
- Q: Does the review wait for the Steward to reach the Throne Room? → A: No. The review is computed at the fixed review tick as long as the office is filled and a Throne Room is active. The daily audience is a time cost and a visible presence, not a gate, so a lost or hungry Steward never silently skips a day.
- Q: How does the Steward avoid over-posting while postings are still being walked to the board? → A: Each order tracks its owned runs (pending, open, claimed) and compares them with the runs the deficit needs (FR-010). Unclaimed surplus is withdrawn, and claimed runs are never cancelled.
- Q: What exactly do the unlocks shorten? → A: The Notice Post shortens the crier's route (one stop serves several nearby boards). The Bell Tower replaces the walk for nearby boards with a wait until the next canonical hour. Both apply to every user-managed board update.
