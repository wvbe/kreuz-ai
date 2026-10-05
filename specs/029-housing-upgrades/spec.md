# Feature Specification: Dwellings & Household Upgrades

**Created**: 2026-10-05
**Input**: User description: "Housing upgrades as the core goal loop: meet a house's needs (food variety, a church nearby, a tavern) and it visibly upgrades from wattle hovel to timber-framed house to burgher's house; upgraded houses bring more people and more coin but demand finer goods like ale, cloth and candles, giving every production chain a clear purpose."

## User Scenarios & Testing

### User Story 1 - A Dwelling and Its Household (Priority: P1)

The player encloses a small area with walls and a door, places a bed inside, and designates it as a **Dwelling**, a zone type (spec 015) that must be a Room. Once the dwelling's base requirements are met it starts at the lowest level, **Hovel**, and offers housing slots. Homeless citizens of the player's settlement are assigned to it and form its **household**. Each resident's home is recorded on the citizen. The household's beds and storage furniture belong to the household: other entities do not sleep in them, take from them, or haul into them.

**Why this priority**: Without dwellings and households there is nothing to upgrade, no place for settlers and no rent. Every other story builds on this one.

**Independent Test**: Can be fully tested headlessly by building a 2×2 walled room with a door and one Straw Pallet, designating it as a Dwelling, placing two homeless player-faction citizens on the map, running to the next daily housing evaluation, and checking that the zone has level Hovel, one housing slot (capacity is capped by bed count) and exactly one assigned resident, and that the other citizen stays homeless.

**Acceptance Scenarios**:

1. **Given** an enclosed 4-tile room with a door and one bed, **When** it is designated as a Dwelling, **Then** a `zone.requirements.met` event is emitted (spec 015 FR-008) and the zone's `Dwelling` state is created with level `Hovel`.
2. **Given** an active Hovel with free slots and three homeless citizens with entity IDs 12, 7 and 30, **When** the daily housing evaluation runs, **Then** citizens are assigned in ascending entity ID order (7, then 12, …) until the free slots are filled, and one `housing.resident.assigned` event is emitted per assignment.
3. **Given** a resident of Dwelling A who becomes tired, **When** the resident looks for a bed (spec 013 FR-002), **Then** beds in Dwelling A rank above other beds, and beds in any other dwelling are never used.
4. **Given** a chest inside a Dwelling holding 3 Ale, **When** a crafter elsewhere queries for Ale (spec 018 FR-011), **Then** the chest is not returned as a source, because household storage is reserved for its residents.
5. **Given** a Dwelling that loses its door (no longer a Room), **When** room detection re-runs (spec 015 FR-006), **Then** the dwelling becomes inactive: it offers no free slots, collects no rent and makes no upgrade progress, and its residents stay assigned.

---

### User Story 2 - Meeting Needs Upgrades the House (Priority: P1)

Every dwelling level above Hovel has requirements: a minimum size and furniture, **food variety** (distinct foods the household has eaten recently), **services nearby** (an active Church or Chapel, or a Tavern, within a set number of path-cells), and **supplied goods** such as ale, candles and cloth, which must be stocked in the household's own storage and are used up every day. At each daily housing evaluation the engine checks the requirements of the next level. When they have held for `upgradeGraceDays` evaluations in a row, the dwelling rises one level, and the renderer shows the new building style, from wattle-and-daub hovel to burgher's house.

**Why this priority**: This is the core goal loop the feature exists for. It turns the production chains (spec 014, spec 022) into visible progress.

**Independent Test**: Can be fully tested headlessly by setting up a Hovel with two residents, a Hearth and a chest, an active Chapel 20 path-cells away, and residents who eat Bread and Pottage. Advance through `upgradeGraceDays` daily evaluations and check that the dwelling becomes a Cottage and `housing.dwelling.upgraded` is emitted. Then remove the Chapel before the streak completes and check that the streak resets to 0 and no upgrade happens.

**Acceptance Scenarios**:

1. **Given** a Hovel whose household ate Bread and Pottage within the food variety window, with an active Chapel 20 path-cells from the nearest dwelling tile and a Hearth in the dwelling, **When** the Cottage requirements hold on 3 consecutive daily evaluations (`upgradeGraceDays` = 3), **Then** on the third evaluation the level becomes `Cottage` and `housing.dwelling.upgraded { dwellingId, fromLevel: Hovel, toLevel: Cottage }` is emitted.
2. **Given** the same Hovel after two qualifying evaluations, **When** the third evaluation finds the Chapel's requirements lost (spec 015 FR-008), **Then** the upgrade streak resets to 0 and the level stays `Hovel`.
3. **Given** an active Chapel at 41 path-cells and a Cottage requirement of at most 40 path-cells, **When** the requirement is evaluated, **Then** it is unmet and the dwelling's requirement status reports the nearest distance found (41) and the limit (40).
4. **Given** a Cottage whose next level (Timber-Framed House) needs 0.5 Ale per resident per day and has 2 residents, **When** the daily evaluation runs and the household storage holds 1 Ale, **Then** 1 Ale is consumed and the supplied-good requirement is met for that day. With 0 Ale it is unmet and nothing is consumed.
5. **Given** a dwelling that meets the requirements of the next two levels at once, **When** it upgrades, **Then** it rises exactly one level. The level after that starts its own streak.
6. **Given** a dwelling whose next level has `unlockTier` set (spec 027) above the settlement's current tier, **When** its other requirements hold, **Then** no streak builds, the requirement status reports the tier lock, and the dwelling's spec 025 status carries `LockedByTier` with that `requiredTier`.

---

### User Story 3 - Households Fetch and Use Their Goods (Priority: P1)

A household keeps the goods its current and next level demand (e.g. ale and candles) in storage furniture inside its own dwelling. When stock falls below `householdStockDays` days of consumption, one resident fetches more from settlement storage as a household chore: it is chosen by utility scoring like eating (spec 013 FR-014), not posted on a job board. Every daily evaluation consumes each demanded good at the level's per-resident rate. The rates are fixed-point, so a fraction of a unit builds up in an accumulator and whole units are used when it reaches 1. Food is not fetched. The food variety requirement only counts which `food`-category materials the residents actually ate, wherever they ate them.

**Why this priority**: Without a physical supply loop, "demand finer goods" would be a number with no logistics behind it. Players must see brewers' ale walk into houses.

**Independent Test**: Can be fully tested headlessly by setting up a Cottage household that demands Ale (its next level is Timber-Framed House), an empty chest in the dwelling and 10 Ale in a warehouse. Advance time and check that a resident fetches Ale into the dwelling chest up to `householdStockDays` days of demand, and that the next daily evaluation consumes the expected whole units.

**Acceptance Scenarios**:

1. **Given** a household that demands 0.5 Ale per resident per day with 2 residents, `householdStockDays` = 2, and 0 Ale in its storage, **When** a resident is free to do a chore, **Then** it fetches 2 Ale (2 days × 1 Ale) from the nearest accessible source (spec 018 FR-011) into the dwelling's storage furniture.
2. **Given** a demand of 0.25 Candle per resident per day and 1 resident, **When** four daily evaluations run with stock available, **Then** the accumulator grows by 250 each day and exactly 1 Candle is consumed, on the fourth evaluation.
3. **Given** no accessible Ale anywhere in the settlement, **When** the household tries to fetch Ale, **Then** no fetch task starts, the household reports a `MissingInput { materialId: "ale", required, available: 0, noProducer }` blocked reason (spec 025 FR-003), and the supplied-good requirement goes unmet at the next evaluation.
4. **Given** a dwelling with no storage furniture, **When** its level demands any supplied good, **Then** the requirement is unmet, the dwelling reports the spec 025 `BlockedReason` `NoHouseholdStorage`, and no fetch is attempted.
5. **Given** residents who ate Bread, Cheese and Stew within the last `foodVarietyWindowDays` days, **When** food variety is evaluated, **Then** the household's distinct food count is 3, whatever storage the food came from.
6. **Given** a household with 0 residents, **When** the daily evaluation runs, **Then** nothing is consumed, food variety counts as 0, and both upgrade and downgrade streaks stay where they are.

---

### User Story 4 - Neglect Downgrades the House, Slowly (Priority: P2)

If a dwelling stops meeting the requirements of its **current** level, it does not fall at once. A downgrade streak counts consecutive failing evaluations. Only after `downgradeGraceDays` (longer than `upgradeGraceDays`) does the dwelling drop one level. The first failing evaluation emits a warning so the player can react. If the level's capacity drops below the number of residents, the residents who arrived last move out and become homeless.

**Why this priority**: Without hysteresis, houses would flicker between levels whenever a single ale delivery was late. That makes the loop frustrating and noisy rather than readable. P2 because upgrades alone already deliver the core loop.

**Independent Test**: Can be fully tested headlessly by setting up a Timber-Framed House with 5 residents, removing all Ale from the settlement, running daily evaluations, and checking that `housing.dwelling.at-risk` is emitted on the first failing evaluation, the level holds for `downgradeGraceDays − 1` evaluations, and on evaluation `downgradeGraceDays` the level becomes Cottage, the 2 most recently assigned residents are evicted (capacity 3), and `housing.dwelling.downgraded` is emitted.

**Acceptance Scenarios**:

1. **Given** a Timber-Framed House that fails a current-level requirement for the first time, **When** the evaluation runs, **Then** `housing.dwelling.at-risk { dwellingId, level, unmetRequirements }` is emitted and the level does not change.
2. **Given** a failing streak of 6 and `downgradeGraceDays` = 7, **When** the next evaluation finds all current-level requirements met again, **Then** the downgrade streak resets to 0 and no downgrade occurs.
3. **Given** a downgrade to a level with capacity 3 while 5 residents live there, **When** the downgrade applies, **Then** the 2 residents with the latest assignment tick (ties broken by higher entity ID) are evicted, each with a `housing.resident.evicted { reason: CapacityReduced }` event, and they are re-housed at a later evaluation if free slots exist.
4. **Given** a Hovel that fails its own requirements, **When** any number of evaluations pass, **Then** it never drops below Hovel. Losing the base zone requirements makes it inactive (User Story 1, scenario 5) instead.

---

### User Story 5 - Upgraded Houses Bring Rent and Settlers (Priority: P2)

Each level has a resident capacity and a daily rent. At each daily evaluation, every active, inhabited dwelling pays its level's rent in coin (the currency material, spec 019 FR-001) from its residents' inventories into the treasury (Throne Room containers, spec 019 FR-003). After homeless citizens are housed, any free housing slots attract **settlers**: up to `maxImmigrantsPerDay` arrive at the settlement's arrival cell and walk to the dwelling they are assigned. Their prototype is drawn from the dwelling level's weighted immigrant table using the `housing.immigration` PRNG stream. Better houses draw better-off newcomers.

**Why this priority**: Rent and population growth are what make upgrading pay off. P2 because the upgrade loop can be shown and tested before the economy feedback is in place.

**Independent Test**: Can be fully tested headlessly by setting up a Throne Room with a Coffer, a Cottage (rent 2) with 2 residents carrying 1 and 5 coin, and 1 free slot. After one daily evaluation, check that 2 coin moved into the Coffer (1 from each resident, in ascending entity ID order of payment), that one settler was spawned at the arrival cell with a prototype from the Cottage immigrant table, and that two runs with the same seed spawn the same prototype and traits.

**Acceptance Scenarios**:

1. **Given** an active Cottage with rent 2 per day and residents A (ID 4, 1 coin) and B (ID 9, 5 coin), **When** rent is collected, **Then** 1 coin is taken from A, then 1 from B, the treasury gains 2, and `housing.rent.collected { dwellingId, amount: 2 }` is emitted.
2. **Given** residents holding 1 coin in total and rent 2, **When** rent is collected, **Then** 1 coin is transferred and `housing.rent.unpaid { dwellingId, shortfall: 1, reason: InsufficientFunds }` is emitted. No debt is carried to the next day.
3. **Given** no active Throne Room, or treasury containers with no space, **When** rent is due, **Then** no coin is moved and `housing.rent.unpaid { reason: TreasuryUnavailable }` is emitted.
4. **Given** 3 free housing slots across the settlement, no homeless citizens and `maxImmigrantsPerDay` = 2, **When** the evaluation runs, **Then** exactly 2 settlers spawn, each emitting `housing.immigrant.arrived { entityId, prototypeId, dwellingId }`. The slots of the highest-level dwellings are filled first, ties broken by ascending zone entity ID.
5. **Given** an identical seed and command sequence, **When** two runs reach the same evaluation, **Then** the settlers' prototypes, traits (spec 020 FR-004) and names (spec 028) are identical.
6. **Given** a homeless citizen and 1 free slot, **When** the evaluation runs, **Then** the citizen is housed and no settler arrives for that slot.

---

### User Story 6 - Seeing Why a House Has Not Upgraded (Priority: P3)

The player clicks a dwelling and sees its level, residents, rent, and a checklist of the next level's requirements. Each item shows met or unmet with its current values ("Distinct foods 2 / 3", "Tavern 52 / 40 path-cells", "Ale: none in stock") and the streak progress ("Upgrading: day 2 of 3"). A current level at risk shows its downgrade countdown. The map draws each level with a distinct building model.

**Why this priority**: Explanations make the loop learnable, but the simulation works without them. The one-line answer to "why hasn't this house upgraded?" is the dwelling's spec 025 status (`DwellingRequirementsUnmet`, `NoHouseholdStorage`, `MissingInput`, `LockedByTier`); this checklist is its detailed view. P3 because it consumes state that the earlier stories already expose headless.

**Independent Test**: Can be fully tested headlessly by querying a dwelling's requirement status and checking that every requirement of the next level is listed with kind, met flag and current/required values. In the renderer (spec 024 FR-043), open the dwelling inspection panel and check that the same data is shown.

**Acceptance Scenarios**:

1. **Given** a Cottage missing only the Tavern requirement, **When** the requirement status is queried, **Then** exactly one entry is unmet, with kind `ServiceNearby`, the required zone types, the nearest distance (or none reachable) and the limit.
2. **Given** a dwelling that upgrades from Cottage to Timber-Framed House, **When** the renderer receives `housing.dwelling.upgraded`, **Then** the dwelling is redrawn with the Timber-Framed House model within one render frame (spec 024 FR-042). Dwellings at risk of downgrade are flagged on the map (spec 024 FR-044).

---

### Edge Cases

- What happens when a dwelling zone splits in two (spec 015 FR-015)? → Both parts keep the original level, and both streaks reset to 0. Residents stay with the zone that keeps the original zone entity ID. Residents beyond that zone's capacity, or of a zone that lost its ID, become homeless (`housing.resident.evicted { reason: DwellingChanged }`) and are re-housed at a later evaluation.
- What happens when two dwellings merge? → The merged dwelling takes the **lower** of the two levels, and its streaks reset to 0. Residents are kept in ascending assignment tick order up to capacity. The rest are evicted with `DwellingChanged`.
- What happens when a dwelling is deleted (spec 015 FR-014)? → Its `Dwelling` state is removed and all residents become homeless (`reason: DwellingRemoved`). Goods in its storage furniture stay in that furniture, which is ordinary storage again.
- What happens when a resident dies or leaves the player faction? → Its home reference is cleared, and its slot is free at the next evaluation.
- What happens if a dwelling's beds are fewer than its level capacity? → Capacity is `min(levelCapacity, bedCount)`. Building beds is part of growing a house.
- What happens if the same Church serves several dwellings? → Services are not used up. A single active Church can satisfy the `ServiceNearby` requirement of any number of dwellings within range.
- What happens if a service zone is reachable only through another household's dwelling? → Path distance uses the normal pathfinding graph (spec 012). Dwellings do not block passage, so the path counts.
- What happens if the household's storage holds goods the level no longer demands (after a downgrade)? → They stay in storage. They are not consumed and residents do not fetch more of them.
- What happens if the settlement has no traversable map-edge cell reachable from the seat of government? → No settlers arrive, and `housing.immigration.blocked { reason: NoArrivalCell }` is emitted once per evaluation while the condition persists.
- What happens when a save is loaded? → Level, streaks, accumulators, food record and resident assignments are restored from the save. Requirement satisfaction is re-derived at the next evaluation and never trusted from the save (spec 015 FR-013).

## Requirements

### Functional Requirements

- **FR-001**: Content MUST define a `dwelling` zone type in the zone type registry (spec 015 FR-001, spec 022 User Story 4) with `requiresRoom: true`, `minTiles: 4` and furniture `1× (tag bed)`. These are the base requirements of every dwelling. A dwelling whose base requirements are unmet is **inactive**.
- **FR-002**: The engine MUST define a fixed `DwellingLevel` enum (spec 023 FR-005), ordered `Hovel` (`"hovel"`) < `Cottage` (`"cottage"`) < `TimberFramedHouse` (`"timber_framed_house"`) < `BurgherHouse` (`"burgher_house"`). Display names are "Hovel", "Cottage", "Timber-Framed House" and "Burgher House".
- **FR-003**: Content MUST provide a dwelling level table (`dwelling-levels.json`) with exactly one entry per `DwellingLevel` member. A missing, duplicate or unknown level is a load error (spec 022 FR-015). Each entry declares: `level`, `capacity` (integer residents), `rentPerDay` (integer coin), `minTiles`, `furniture` (array of `{ type/tag, count }`, as in spec 015 FR-001), `foodVariety` (integer minimum distinct `food`-category materials, 0 = none), `services` (array of `{ zoneTypes: string[], maxPathCells: integer }`), `suppliedGoods` (array of `{ materialIds: string[], perResidentPerDay }`, where `materialIds` is an any-of group and `perResidentPerDay` is authored as a decimal and stored ×1000), `immigrantPrototypes` (weighted list of humanoid prototype IDs, spec 022 User Story 5), and optional `unlockTier` (spec 022 FR-022, spec 027). Every referenced zone type, furniture tag, material and prototype MUST exist (spec 022 FR-015).
- **FR-004**: Each dwelling zone entity MUST carry a `Dwelling` component holding: `level` (`DwellingLevel`), `upgradeStreak` and `downgradeStreak` (integers), `consumptionAccumulators` (map of supplied-good group index → milli-units), `foodRecord` (map of `food` materialId → last game day eaten, holding only entries inside the variety window), and `lastEvaluatedDay`. Unlike zone requirement status (spec 015 FR-013), `level` and streaks are authoritative, serialized progression state.
- **FR-005**: A citizen's home MUST be stored as `Citizen.homeDwellingId` (zone entity ID or `null`) together with `Citizen.homeAssignedTick`. This is the only source of truth. A dwelling's household is derived by query, as faction membership is in spec 021 FR-015. Only adult humanoid members of the player faction (spec 021 FR-002) are housed.
- **FR-006**: The engine MUST run a **daily housing evaluation** once per game day, on the tick where `tickCount mod ticksPerDay = housingEvaluationTickOfDay` (a content constant, default 72 = 06:00; calendar per spec 001 FR-011). Dwellings are processed in ascending zone entity ID order. The fixed order within one evaluation is: (1) clear invalid homes, (2) consume supplied goods, (3) evaluate requirements and update streaks and levels, (4) apply evictions, (5) collect rent, (6) house homeless citizens, (7) admit settlers.
- **FR-007**: A **requirement** of a level MUST be one of the `DwellingRequirementKind` enum values: `MinTiles`, `Furniture`, `FoodVariety`, `ServiceNearby`, `SuppliedGood` and `TierUnlocked`. `MinTiles` and `Furniture` are counted over the dwelling zone's tiles, as in spec 015. `FoodVariety` is met when the number of distinct materials in `foodRecord` within the last `foodVarietyWindowDays` (content constant, default 3) is at least `foodVariety`. `TierUnlocked` is met when the level has no `unlockTier` or the settlement tier (spec 027) is at least `unlockTier`.
- **FR-008**: `ServiceNearby` MUST be met when at least one **active** zone (spec 015 FR-008) of a listed zone type has a tile whose path distance from some dwelling tile is at most `maxPathCells`. Path distance is the minimum path cost (an integer, spec 012 FR-001 integer edge costs) between the dwelling tile and the zone tile on the adjacency graph. It depends only on that cost, never on which of several equal-cost paths a search would return, so no tie-breaking and no PRNG draw is involved (FR-022, spec 025 FR-008). Unreachable means unmet (spec 012 FR-004). Implementations MAY use one bounded multi-source search per service zone (spec 012 FR-010) if the result equals the per-pair definition.
- **FR-009**: `SuppliedGood` MUST be evaluated as follows. The daily demand of a group is `residentCount × perResidentPerDay` milli-units, added to that group's accumulator. Then `floor(accumulator / 1000)` whole units are needed. They are consumed from storage furniture on the dwelling's tiles, taking materials in the group's `materialIds` order and furniture in ascending entity ID order. If every needed unit is available, the units are consumed, `1000 × units` is subtracted from the accumulator and the requirement is met. If not, **nothing** is consumed, the accumulator keeps its value capped at `1000 × units` (so demand does not pile up beyond one day) and the requirement is unmet. A dwelling with no storage furniture fails every `SuppliedGood` requirement with the status `NoHouseholdStorage` (spec 025 FR-003). Consumption emits `housing.goods.consumed { dwellingId, materialId, quantity }`, which the spec 025 ProductionLedger records as `HouseholdConsumption` (spec 025 FR-012).
- **FR-010**: A household's **demanded goods** MUST be the union of the `suppliedGoods` of its current level and of the next level (if any), so a household can prove it can be supplied before it upgrades. FR-009 consumption applies to every demanded good.
- **FR-011**: The streaks MUST update at each evaluation of an active dwelling with at least one resident. If all requirements of the next level are met, `upgradeStreak` increments; otherwise it resets to 0. When `upgradeStreak` reaches `upgradeGraceDays` (content, default 3), the level rises by exactly one and both streaks reset. If any requirement of the current level is unmet, `downgradeStreak` increments; otherwise it resets to 0. When it reaches `downgradeGraceDays` (content, default 7, and MUST be greater than `upgradeGraceDays`, validated at load), the level drops by exactly one, never below `Hovel`, and both streaks reset. An inactive or uninhabited dwelling's streaks do not change.
- **FR-012**: **Capacity** MUST be `min(level.capacity, number of tag-bed furniture on the dwelling's tiles)`. When residents exceed capacity, the residents with the latest `homeAssignedTick` (ties broken by higher entity ID) are evicted until residents equal capacity.
- **FR-013**: **Rent** MUST be collected at each evaluation from every active dwelling with at least one resident. Up to `level.rentPerDay` coin is taken from residents' inventories in ascending entity ID order, one coin per resident per round, round-robin until the rent is paid or no resident has coin left. The coin is deposited into the treasury (spec 019 FR-003) using the same transfer semantics as wage payments (spec 019 FR-012), but in the opposite direction. If the treasury has no container with space, no coin moves (`TreasuryUnavailable`). A shortfall emits `housing.rent.unpaid` with a `RentShortfallReason` enum reason (`InsufficientFunds`, `TreasuryUnavailable`) and is not carried forward. Rent is not a tax policy (docs/ROADMAP.md, Government & Policy).
- **FR-014**: **Housing homeless citizens**: homeless eligible citizens (FR-005), in ascending entity ID order, MUST each be assigned to the active dwelling with free capacity that has the highest level, ties broken by ascending zone entity ID. Each assignment sets `homeDwellingId` and `homeAssignedTick` and emits `housing.resident.assigned`.
- **FR-015**: **Immigration**: after FR-014, let `freeSlots` be the total free capacity of active dwellings. The engine MUST then spawn `min(freeSlots, maxImmigrantsPerDay)` settlers (content constant, default 2). Each settler fills the next free slot in the FR-014 dwelling order. Its prototype is drawn from that dwelling level's `immigrantPrototypes` with `randomWeighted` (spec 011 FR-006) on the derived stream `housing.immigration` (spec 011 FR-010). Its traits come from spec 020 FR-004 and its name is drawn at spawn by spec 028 FR-004. It joins the player faction (spec 021 FR-002) and is placed on the **arrival cell**, then walks to its dwelling. The arrival cell is the traversable map-boundary cell of the main map with the smallest path distance (FR-008 metric) to the seat of government (Throne Room, spec 017 FR-011), ties broken by lowest cellIndex. With no seat of government or no reachable boundary cell, no settlers spawn and `housing.immigration.blocked` is emitted with an `ImmigrationBlockedReason` enum reason (`NoSeatOfGovernment`, `NoArrivalCell`).
- **FR-016**: **Household fetch chore**: when the stock of a demanded good group in a household's storage is below `householdStockDays` (content, default 2) days of that group's demand, the household MUST become eligible for a fetch. At most one resident per household fetches at a time. The resident chooses it through utility scoring (spec 013 FR-014) via the engine-registered action handler `fetch_household_goods` (spec 022 FR-014), only when it holds no claimed job (spec 017). It takes the shortfall (bounded by carry capacity) from the nearest accessible non-household source (spec 018 FR-011–FR-013) and deposits it into the dwelling's storage furniture. Fetching is a household chore, not settlement work, and is never posted on a job board. When no source exists, the household exposes `MissingInput { materialId, required, available, noProducer }` (spec 025 FR-003).
- **FR-017**: **Household reservation**: storage furniture on an active or inactive dwelling's tiles MUST be accessible only to that dwelling's residents. It is excluded from material queries by other entities (spec 018 FR-012) and from hauler routing tiers (spec 018 FR-010), and it is not settlement stock (spec 025 FR-013 `stock`, spec 026 FR-006). Beds on a dwelling's tiles MUST only be used by its residents, and residents prefer their own dwelling's beds when satisfying rest (spec 013 FR-002).
- **FR-018**: Every time a resident consumes a `food`-category material (hunger satisfaction, spec 013 FR-002 and spec 022 User Story 8), the engine MUST record `materialId → current game day` in the resident's household `foodRecord`. Entries older than `foodVarietyWindowDays` are pruned at each evaluation.
- **FR-019**: The engine MUST expose these headless queries: a dwelling's level, capacity, residents and rent. A dwelling's **requirement status** for its current and next level, with one entry per requirement: kind, met flag, required value(s) and current value(s) (for example `FoodVariety { current, required }`, `ServiceNearby { zoneTypes, nearestPathCells | null, maxPathCells }`, `SuppliedGood { materialIds, inStock, needed, status }`), plus both streaks and the grace constants. The query names are `getDwellingRequirementStatus(dwellingId)` for the requirement status and `countDwellingsAtOrAbove(level)` for the settlement-wide count of active dwellings at or above a given level (used by the spec 027 `DwellingsAtLevel` tier requirement), plus totals of housed residents, homeless citizens and free slots.
- **FR-019a**: Each dwelling MUST be a spec 025 status subject (`StatusSubjectKind.Dwelling`) and report, at each daily evaluation, `DwellingRequirementsUnmet { targetLevel, unmet }` built from `getDwellingRequirementStatus` (Idle when only next-level requirements are unmet, Blocked when a current-level requirement is unmet), `NoHouseholdStorage`, `MissingInput { materialId, required, available, noProducer }` (spec 025 FR-003) from the fetch chore (FR-016), or `LockedByTier` for a tier-locked next level. An inactive dwelling reports `ZoneInactive` (spec 025 FR-003).
- **FR-020**: The engine MUST emit these events (spec 010 FR-002; `housing.dwelling.upgraded` is the dwelling-level-increased event that spec 027 `FirstDwellingUpgrade` and spec 028 `HomeImproved` subscribe to): `housing.dwelling.upgraded { dwellingId, fromLevel, toLevel }`, `housing.dwelling.downgraded { dwellingId, fromLevel, toLevel }`, `housing.dwelling.at-risk { dwellingId, level, unmetRequirements }` (on the evaluation where `downgradeStreak` becomes 1), `housing.resident.assigned { dwellingId, entityId }`, `housing.resident.evicted { dwellingId, entityId, reason }` (`EvictionReason` enum: `CapacityReduced`, `DwellingChanged`, `DwellingRemoved`), `housing.rent.collected { dwellingId, amount }`, `housing.rent.unpaid { dwellingId, shortfall, reason }`, `housing.goods.consumed { dwellingId, materialId, quantity }`, `housing.immigrant.arrived { entityId, prototypeId, dwellingId }` and `housing.immigration.blocked { reason }`.
- **FR-021**: All housing state (the `Dwelling` component, `Citizen.homeDwellingId` / `homeAssignedTick`, the `housing.immigration` PRNG stream and in-progress fetch tasks) MUST serialize to GameState (spec 006) as integers and string IDs, and resume identically on load. Requirement status is re-derived, never loaded as authoritative.
- **FR-022**: All housing numbers (capacities, rents, grace days, windows, rates, tick-of-day, immigrant weights) MUST be content data (spec 022 FR-016): the dwelling level table is a fixed-key config table (spec 022 FR-018) and the housing constants live in the content-constants table (spec 022 FR-023). No housing behaviour may depend on wall-clock time or any randomness outside the `housing.immigration` stream.

### Key Entities

- **Dwelling**: A zone (spec 015) of type `dwelling`, enclosed as a Room, with at least one bed. Carries the `Dwelling` component: level, streaks, consumption accumulators, food record and last evaluated day. Its household is derived from `Citizen.homeDwellingId`.
- **DwellingLevel**: A fixed enum, `Hovel`, `Cottage`, `TimberFramedHouse`, `BurgherHouse`, ordered from lowest to highest.
- **DwellingLevelDefinition**: A content record per level: capacity, rent, structural requirements, food variety, services, supplied goods, immigrant table and optional `unlockTier`. Immutable after bootstrap.
- **Household**: The set of residents of one dwelling (derived, not stored). It shares the dwelling's reserved beds and storage and pays its rent.
- **DwellingRequirementStatus**: A derived, queryable record per requirement: kind (`DwellingRequirementKind`), met flag, required and current values. It feeds the spec 024 dwelling checklist and the spec 025 `DwellingRequirementsUnmet` reason.
- **Settler**: A humanoid spawned by immigration, drawn from a level's immigrant table on the `housing.immigration` stream, placed on the arrival cell and assigned a home on arrival.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In a headless scenario test starting from one Hovel, meeting each successive level's requirements raises the dwelling to Burgher House in exactly `3 × upgradeGraceDays` daily evaluations, with one `housing.dwelling.upgraded` event per step.
- **SC-002**: No dwelling changes level more than once per daily evaluation, and no dwelling downgrades in fewer than `downgradeGraceDays` consecutive failing evaluations (verified across all scenario snapshots).
- **SC-003**: Two runs with the same seed and command sequence produce byte-identical housing state (levels, streaks, assignments, settler prototypes and traits) after 30 game days.
- **SC-004**: Currency is conserved by rent: over any test run, the treasury's rent gains equal the residents' rent losses exactly. No coin is created or destroyed.
- **SC-005**: Supplied-good consumption over N days equals `floor(N × residents × perResidentPerDay / 1000)` units (± one unit of accumulator carry) whenever stock is always sufficient.
- **SC-006**: A daily housing evaluation of 200 dwellings with 20 service zones completes in under 50 ms on the reference machine.
- **SC-007**: Housing state survives save → load → save with identical JSON (excluding the spec 006 `timestamp`), and a game resumed from the save upgrades on the same day as one that was never saved.
- **SC-008**: For every dwelling that has not upgraded in a scenario, the requirement status query names at least one unmet requirement of the next level, or a tier lock. A non-upgrade is never left unexplained.

## Assumptions

- **One dwelling is one Room**: A house is a single enclosed zone. Multi-room houses (a hall plus a bedchamber counted as one household) are out of scope.
- **Levels do not rebuild walls**: An upgrade changes the dwelling's level, not its wall or roof entities. The different building styles are a renderer concern (spec 024) driven by `level`. Structural growth is expressed through `minTiles` and `furniture` requirements that the player builds normally (spec 016).
- **Representative level content** (values are designer-tunable starting points, spec 022 FR-016):

| Level               | Min Tiles | Furniture (beyond base bed)                                  | Food Variety | Services (max path-cells)          | Supplied Goods (per resident per day)              | Capacity | Rent/day |
| ------------------- | --------- | ------------------------------------------------------------ | ------------ | ---------------------------------- | -------------------------------------------------- | -------- | -------- |
| Hovel               | 4         | —                                                            | 0            | —                                  | —                                                  | 2        | 1        |
| Cottage             | 6         | 1× Hearth                                                    | 2            | Chapel or Church ≤ 40              | —                                                  | 3        | 2        |
| Timber-Framed House | 9         | 1× Hearth, 1× Table, 1× (tag storage)                        | 3            | Chapel or Church ≤ 40; Tavern ≤ 40 | Ale 0.5; Candle 0.25                               | 5        | 5        |
| Burgher House       | 12        | 1× Hearth, 1× Table, 2× Chair, 1× Tapestry, 1× (tag storage) | 4            | Church ≤ 30; Tavern ≤ 30           | Ale 0.5; Candle 0.5; Linen Cloth or Wool Cloth 0.2 | 6        | 10       |

- **Representative immigrant tables**: Hovel draws mostly `peasant`, with `lumberjack` and `shepherd`. Cottage draws `farmer`, `fisherman`, `miner` and `cook`. Timber-Framed House draws craft prototypes (`carpenter`, `mason`, `blacksmith`, `baker`, `brewer`, `weaver`). Burgher House draws `merchant` and `scholar` with some master-craft prototypes. All IDs are humanoid prototypes from spec 022 User Story 5.
- **Rent is a transfer, not minting**: Rent moves existing coin from residents to the treasury. Residents earn coin through wages (spec 019 User Story 6) and trade. Upgraded houses yield more coin because they hold more residents and charge a higher rent, not because coin is created.
- **Household goods come from settlement storage for free**: Residents fetch demanded goods from any accessible non-household storage without paying. The settlement's produce is communal. A spec 026 standing order such as "keep 20 Ale in stock" is the expected way to keep that storage supplied. Buying from the market through spec 019 trade is a possible later refinement (see open question below).
- **Fetching and transfers are not instantaneous for goods, but are for rent**: Goods are physically carried (FR-016). Rent, like wages in spec 019 FR-012, is a direct inventory transfer at the evaluation tick.
- **Daily evaluation, not continuous**: Housing is checked once per game day at a fixed tick. This keeps the loop readable and cheap, and makes grace periods count whole days.
- **No emigration**: Residents never leave the settlement because of poor housing, unpaid rent or homelessness in this spec.
- **Open question:** Should unpaid rent have consequences (mood penalty, eviction after repeated shortfalls), or should rent scale with residents' wealth (spec 013 FR-009)? This spec only reports shortfalls.
- **Open question:** Is the overall money supply balanced? With rent as a pure transfer, the treasury's net income comes only from external trade (spec 019, spec 021). If playtests show the loop does not "bring more coin", a minting source (e.g. content-defined market dues) or rent drawn from a non-currency source needs design.
- **Open question:** Should household goods be bought through spec 019 trade from settlement sellers (residents spending wages) instead of taken freely from communal storage? Buying would deepen the economy but couples the housing loop to seller AI.
- **Open question:** Should homelessness or a large housing shortfall reduce mood or immigration in some other way? Spec 013 has no shelter need. Adding one would touch the need registry (spec 022 User Story 8).

## Design Decisions (proposed — pending user review)

- Q: Is a dwelling's level a separate zone type per level, or state on one zone type? → A: One `dwelling` zone type (spec 015 allows one type per zone). `level` is persistent state on the zone's `Dwelling` component, so upgrading never re-designates the zone.
- Q: How are "finer goods" delivered to houses? → A: As a household chore performed by residents (FR-016), the way eating works. They are not job-board postings, because supplying one's own home is not settlement work. The goods sit in reserved storage furniture inside the dwelling and are consumed at the daily evaluation.
- Q: How is food variety measured? → A: By the distinct `food`-category materials residents actually ate within a trailing window (FR-018), not by what is stocked. Food stays on the existing hunger path (spec 013).
- Q: How does a house prove it can be supplied with next-level goods before it upgrades? → A: The household demands and consumes the next level's goods as well as its current ones (FR-010).
- Q: Where does rent come from? → A: From residents' own coin, transferred to the Throne Room treasury (FR-013). It is a household contribution, not taxation. Tax and policy stay on docs/ROADMAP.md.
- Q: What is the immigration rule? → A: Daily, after homeless citizens are housed: `min(freeSlots, maxImmigrantsPerDay)` settlers, prototype drawn per dwelling level on the `housing.immigration` stream, arriving at the boundary cell closest by path to the seat of government (FR-015).
