# Feature Specification: Settlement Tiers, Milestones & Difficulty

**Created**: 2026-10-05
**Input**: User description: "Settlement tiers that unlock the catalog gradually: Hamlet, Village, Market Town, Chartered Town, each unlocking a slice of the content, with milestones like founding the first guild or building a Throne Room, plus Peaceful, Steady and Harsh difficulty modes that scale decay, need pressure and faction hostility so a cosy mode widens the audience."

## User Scenarios & Testing

### User Story 1 - The Settlement Grows Through Tiers (Priority: P1)

Every game starts as a **Hamlet**. The settlement climbs one tier at a time — Hamlet → Village → Market Town → Chartered Town — when it meets the next tier's requirements: enough inhabitants, enough dwellings at a given level (spec 029), particular active zones (a Throne Room, a Chapel or Church, a Market, a Tavern) and founded guilds. The engine checks the requirements once per game day. A tier, once reached, is never lost: if the settlement later shrinks or a building is pulled down, it keeps its tier. The current tier and the progress towards the next one can be queried headless at any time.

**Why this priority**: Tiers give the player a visible ladder to climb and pace how fast the 022 catalog opens up. Unlocks (US2) and the progress display (US5) depend on tiers existing.

**Independent Test**: Start a headless game, check that the tier is Hamlet. Build a scenario that meets every Village requirement, advance to the next daily evaluation tick and check that the tier is Village and that `settlement.tier.reached` was emitted once. Then delete the Throne Room and run another day: the tier stays Village.

**Acceptance Scenarios**:

1. **Given** a new game with default options, **When** the settlement tier is queried, **Then** it is `SettlementTier.Hamlet`.
2. **Given** a Hamlet that meets every Village requirement, **When** the next daily evaluation tick runs, **Then** the tier becomes Village, the tick is recorded, and `settlement.tier.reached` is emitted with `{ tier: "village", previousTier: "hamlet", tick }`.
3. **Given** a Hamlet that meets every requirement of Village _and_ of Market Town, **When** one daily evaluation runs, **Then** the tier advances only to Village; Market Town is evaluated on the next daily tick (one step per evaluation).
4. **Given** a Village whose population later falls below the Village population requirement, **When** further evaluations run, **Then** the tier stays Village and no event is emitted (no tier loss).
5. **Given** a Village meeting all but one Market Town requirement, **When** progress is queried, **Then** each requirement is listed with its current integer value, its target value and whether it is met.
6. **Given** a game saved at Market Town and loaded again, **When** the tier and its reach ticks are queried, **Then** they match the saved values exactly.

---

### User Story 2 - Content Unlocks by Tier (Priority: P1)

Each furniture prototype, zone type, recipe and job type in the 022 catalog may declare an `unlockTier`. Content whose `unlockTier` is above the settlement's tier stays loaded — it can be browsed, traded, held in an inventory and referenced by other content — but it cannot be built, designated, crafted or posted. A Hamlet can build a Carpentry and a Farm Field but not yet a Smithy; reaching Village lets the player start Smithy construction at once. Content without `unlockTier` is available from Hamlet.

**Why this priority**: This is what "unlocking the catalog gradually" means in practice. Without gating, tiers would be only a label.

**Independent Test**: Load content in which `smithy` has `unlockTier: "village"`. At Hamlet, try to designate a Smithy zone and to queue a Forge construction: both are rejected with `ContentLockedError` naming the required tier. Raise the tier to Village and repeat: both succeed.

**Acceptance Scenarios**:

1. **Given** a Hamlet and a furniture prototype with `unlockTier: "village"`, **When** the player queues its construction, **Then** the command is rejected with `ContentLockedError { contentKind: "furniture", contentId, requiredTier: "village" }` and no ConstructionJob is created (spec 016).
2. **Given** a Hamlet and a zone type with `unlockTier: "market_town"`, **When** the player designates tiles with that zone type, **Then** the designation is rejected with `ContentLockedError`; no zone is created (spec 015).
3. **Given** a Village and a recipe with `unlockTier: "chartered_town"`, **When** a production order for it is issued (spec 014 FR-016), **Then** the order is rejected with `ContentLockedError`.
4. **Given** a Hamlet and a job type with `unlockTier: "village"`, **When** any system or the player tries to post it to a job board (spec 017), **Then** the posting is rejected with `ContentLockedError`.
5. **Given** a Hamlet, **When** a trader sells the settlement a Glass Pane whose producing recipe is locked, **Then** the trade succeeds; locked content may be owned, stored and traded, only not produced or built.
6. **Given** the tier rises from Hamlet to Village, **When** the same commands from scenarios 1–4 are issued in the same tick after the evaluation, **Then** they succeed, and the set of newly available content IDs can be queried.

---

### User Story 3 - Difficulty Modes Scale Decay, Need Pressure and Hostility (Priority: P1)

When starting a game the player picks a difficulty: **Peaceful**, **Steady** (the default) or **Harsh**. Each mode maps to three fixed-point multipliers from game configuration data: how fast perishable goods decay, how fast citizens' needs drain, and how sharply NPC factions turn against the player. Peaceful is the cosy mode: food keeps longer, citizens are content longer and neighbours seldom turn hostile. Harsh tightens all three. The difficulty is stored in `initOptions` and does not change the map, the starting population or any PRNG draw, so the same seed gives the same world on every difficulty.

**Why this priority**: A cosy mode is the cheapest way to widen the audience, and the multipliers must exist before balancing any other system.

**Independent Test**: Run the same seed and scenario headless on Peaceful, Steady and Harsh for one game day. Check that the maps are byte-identical at tick 0, that a stack of bread has more remaining time on Peaceful than on Steady and less on Harsh, and that need values follow the same order.

**Acceptance Scenarios**:

1. **Given** `newGame({ difficulty: Difficulty.Peaceful, seed: 42 })` and `newGame({ difficulty: Difficulty.Harsh, seed: 42 })`, **When** both games are saved at tick 0, **Then** their `maps` and `entities` are identical; only `initOptions.difficulty` differs.
2. **Given** Steady with `decayMultiplier` 1000 and Peaceful with 500, **When** an unprotected stack of bread (perishability 48 game hours) is stored, **Then** it expires after 48 game hours on Steady and after 96 game hours on Peaceful.
3. **Given** a Pantry (spec 018, decay modifier 500) on Peaceful (decay multiplier 500), **When** bread is stored in it, **Then** the effective decay rate is 250 (both multipliers apply, FR-015).
4. **Given** Harsh with `needDecayMultiplier` 1300, **When** a citizen's hunger decays one tick at base rate 150 (0.15 ×1000), **Then** hunger drops by 195.
5. **Given** Peaceful with `factionHostilityMultiplier` 250, **When** the player rejects an NPC Envoy and the base rejection penalty is −8 standing (spec 021 FR-013), **Then** the NPC faction's standing towards the player changes by −2.
6. **Given** a game started without a difficulty option, **When** `initOptions` is queried, **Then** `difficulty` is `steady`.
7. **Given** `newGame({ difficulty: "normal" })` from untyped input, **When** validation runs, **Then** it rejects with "Invalid difficulty: 'normal'. Valid values: peaceful, steady, harsh."

---

### User Story 4 - Milestones Mark Notable Firsts (Priority: P2)

The settlement records notable firsts: its Throne Room established, its first worship space, its first market, its first guild founded, its first Master craftsman, its first trade agreement and its first dwelling upgrade. Each milestone is reached at most once per game, is recorded with the tick it happened and the entities involved, and emits `settlement.milestone.reached`. Tier requirements may name a milestone, and the chronicle (spec 028) and the renderer (spec 024) turn milestone events into notifications.

**Why this priority**: Milestones give the early game small, frequent rewards and give the chronicle its headline moments. P2 because tiers and unlocks work without them.

**Independent Test**: In a headless scenario, bring a Throne Room zone to active, then deactivate and reactivate it. Check that exactly one `settlement.milestone.reached` event with `milestone: "throne-room-established"` is emitted, recorded at the first activation tick.

**Acceptance Scenarios**:

1. **Given** no Throne Room has ever been active, **When** a Throne Room zone emits `zone.requirements.met` (spec 015 FR-008), **Then** milestone `ThroneRoomEstablished` is recorded with that tick and the zone ID, and `settlement.milestone.reached` is emitted.
2. **Given** `ThroneRoomEstablished` is already recorded, **When** a second Throne Room becomes active, **Then** nothing new is recorded or emitted.
3. **Given** a guild faction reaches its founding condition (FR-018) for the first time, **When** the next tick boundary is processed, **Then** `FirstGuildFounded` is recorded with the guild's faction ID and its leader's entity ID.
4. **Given** the player faction and an NPC faction form a trade agreement (`diplomacy.agreement.formed`, spec 021), **When** this is the first such agreement, **Then** `FirstTradeAgreement` is recorded.
5. **Given** a save with three recorded milestones, **When** it is loaded, **Then** the same three milestones with the same ticks and subjects are present and none is emitted again.

---

### User Story 5 - Player Sees Tier Progress and Locked Content (Priority: P2)

The React app (spec 024) shows the current tier and a progress panel listing every requirement of the next tier with current and target values. In the build menu, zone picker and production order dialogs, locked entries are shown greyed out with a badge such as "Unlocks at Village" instead of being hidden, so the player can see what is coming. Reaching a tier or a milestone shows a notification in the 024 flavour-text style.

**Why this priority**: Visibility turns the tier ladder into a goal. P2 because the engine side (US1–US4) is fully testable headless without it.

**Independent Test**: Load a Hamlet save in the app. Open the build menu and check that a Village-tier furniture item is shown greyed with the "Unlocks at Village" badge and cannot enter placement mode. Open the tier panel and check the requirement rows match `getSettlementProgress()`.

Renderer requirements: tier and progress panel spec 024 FR-034, locked-content badge FR-035, tier and milestone notifications FR-036, difficulty choice FR-037.

**Acceptance Scenarios**:

1. **Given** a Hamlet, **When** the build menu opens, **Then** locked furniture is listed, greyed, with its required tier, and selecting it does not enter placement mode.
2. **Given** the tier panel is open, **When** the population rises during play, **Then** the population row updates live without re-opening the panel.
3. **Given** the settlement reaches Village, **When** the event arrives, **Then** a notification appears and the newly unlocked items lose their badge.

---

### User Story 6 - Scenarios Can Start at Any Tier (Priority: P3)

For scenario tests (constitution IV) and sandbox play, `newGame()` accepts an optional `startingTier`. A game started at Market Town treats Hamlet and Village as reached at tick 0. Milestones are not granted by a starting tier; they still happen in play.

**Why this priority**: Scenario snapshots for mid- and late-game need late content without replaying the early game. P3 because normal play always starts at Hamlet.

**Independent Test**: `newGame({ startingTier: SettlementTier.CharteredTown })`, then queue construction of a Chartered-Town-only furniture item at tick 0: it succeeds, and no `settlement.tier.reached` or milestone event was emitted.

**Acceptance Scenarios**:

1. **Given** `newGame({ startingTier: SettlementTier.MarketTown })`, **When** the tier is queried, **Then** it is Market Town and the reach ticks of Hamlet, Village and Market Town are all 0.
2. **Given** that game, **When** the first ticks run, **Then** no `settlement.tier.reached` event was emitted for the starting tiers.

---

### Edge Cases

- What if a save or scenario contains a built entity, zone or production order whose content is above the current tier? → It keeps working. Gating applies only to new build, designate, craft-order and posting commands (FR-008); existing things are never removed or switched off by tier.
- What if a recurring job of a locked job type exists on a board (e.g. from a scenario)? → It keeps re-posting under 017 FR-005; re-posting an existing recurring job is not a new posting.
- What if the Throne Room is deconstructed after Village is reached? → The tier stays (FR-005). Town Crier dispatch and the treasury still need a Throne Room (017 FR-011, 019 FR-003); that is their concern, not this spec's.
- What if a tier requirement references a zone type that is itself locked at that tier or above? → Load error (FR-010): a requirement for tier T may only reference content unlocked below T (for alternatives, at least one listed zone type), otherwise the tier could never be reached.
- What if a recipe is unlocked earlier than every workstation it requires? → Load error (FR-011).
- What if all members of the only founded guild leave? → The `FoundedGuilds` count drops, but any tier already reached stays and `FirstGuildFounded` stays recorded. A later tier that needs founded guilds is not reached until the count recovers.
- What if the population is counted while an immigrant (spec 029) is still walking in? → Population counts entities that are members of the player government faction (FR-017) at the evaluation tick, wherever they stand.
- What if the multipliers produce a fractional decay or need delta? → Integer truncation with a minimum magnitude of 1 for non-zero inputs (FR-014), so Peaceful slows decay but never stops it unless a multiplier is configured as 0.
- What if a difficulty multiplier is configured as 0? → Valid: decay or need drain stops, or NPC factions never lower standing towards the player. Designers may use it for a sandbox mode; the shipped values are non-zero.
- What if an old save has `difficulty: "normal"` or `"hard"`? → Save migration (spec 006) maps `normal` → `steady` and `hard` → `harsh`.

## Requirements

### Functional Requirements

#### Tiers

- **FR-001**: System MUST define a `SettlementTier` enum with the members, in ascending order, `Hamlet` (`"hamlet"`), `Village` (`"village"`), `MarketTown` (`"market_town"`) and `CharteredTown` (`"chartered_town"`). The order is fixed in code (spec 023 FR-005); comparisons use the enum's ordinal. Each tier entry in `settlement-tiers.json` (FR-003) MUST declare a lowercase `settlementNoun` display noun: `hamlet`, `village`, `market town`, `town`. It fills the `{settlementNoun}` placeholder of spec 028 FR-016 and is the only tier text in content; the engine itself produces no text.
- **FR-002**: Every game MUST have exactly one settlement, owned by the player government faction (spec 021 FR-002). Its progress MUST be stored in a `SettlementProgress` component on the player government faction entity: `{ tier, tierReachedAtTick: { [tier]: tick }, milestones: MilestoneRecord[] }`. All values are integers or enum strings; the component serializes with the entity (spec 006).
- **FR-003**: Tier requirements MUST be authored as game configuration data (`settlement-tiers.json`, validated by Zod at bootstrap, read-only afterwards). Each tier above Hamlet declares a list of requirements. Each requirement has a `kind` from the `TierRequirementKind` enum and integer parameters:
  - `Population { min }` — number of settlement members (FR-017).
  - `DwellingsAtLevel { level, min }` — number of active dwellings at `level` or above, read with the spec 029 FR-019 query `countDwellingsAtOrAbove(level)` (`level` is a spec 029 `DwellingLevel` value).
  - `ActiveZone { zoneTypeIds, min }` — number of active zones (spec 015 FR-008) whose type is one of `zoneTypeIds` (e.g. `["chapel", "church"]`).
  - `FoundedGuilds { min }` — number of guild factions currently meeting the founding condition (FR-018).
  - `MilestoneReached { milestone }` — the milestone is recorded (FR-020).
- **FR-004**: The engine MUST evaluate the next tier's requirements once per game day, on ticks where `tickCount % 288 == 0` (spec 001: 288 ticks per game day), after the systems that change population, zones and factions have run in that tick. If every requirement holds, the tier advances by exactly one step, `tierReachedAtTick` is set and `settlement.tier.reached` is emitted with `{ tier, previousTier, tick }`. At most one step per evaluation.
- **FR-005**: The tier MUST never decrease. No requirement is re-checked once its tier is reached.
- **FR-006**: The engine MUST expose a headless query `getSettlementProgress()` returning the current tier, its `settlementNoun`, the reach tick of every reached tier, and for the next tier (if any) each requirement with `{ kind, params, current, target, met }`. `current` is computed at query time, so it may differ from the last daily evaluation.

#### Unlocks

- **FR-007**: Furniture prototypes, zone types, recipes, job types and dwelling levels (spec 029 FR-003) in the 022 content MAY declare an optional `unlockTier` (spec 022 FR-022; a `SettlementTier` value; absent means `hamlet`). The field is validated with `z.nativeEnum(SettlementTier)`.
- **FR-008**: While `unlockTier` is above the current tier, the content is locked. Locked content MUST stay in its registry and MUST remain browsable, referenceable, storable and tradeable. The following commands MUST reject locked content with a typed `ContentLockedError { contentKind, contentId, requiredTier }` and leave state unchanged:
  - queuing a ConstructionJob for a locked furniture prototype (checked with spec 016 FR-016/FR-017 at queue time);
  - designating tiles with a locked zone type (spec 015 FR-003);
  - issuing a production order or starting a craft of a locked recipe (spec 014 FR-005 step 1, FR-016);
  - creating a new job posting of a locked job type on any board (spec 017 FR-003), whether system- or user-managed. Re-posting an existing recurring posting (017 FR-005) is not a new posting.

  `contentKind` is a `LockedContentKind` enum (`Furniture`, `ZoneType`, `Recipe`, `JobType`, `DwellingLevel`). A locked dwelling level is not a command target; it stops dwellings from upgrading to it (spec 029 FR-007 `TierUnlocked`).

- **FR-009**: The engine MUST expose `isUnlocked(contentKind, contentId)` and `getUnlockedAt(tier)` (the content IDs whose `unlockTier` equals that tier). Both are pure queries over the immutable registries and the current tier.
- **FR-010**: Content validation (spec 022 FR-015) MUST reject, as a load error, any tier requirement that references a zone type whose `unlockTier` is the same as or above the tier being required. For a requirement listing alternatives (e.g. `["chapel", "church"]`), at least one listed zone type must be unlocked below T, where T is the tier being required. Every tier must be reachable using content unlocked before it.
- **FR-011**: Content validation MUST reject, as a load error, a recipe whose `unlockTier` is below the lowest `unlockTier` among the furniture prototypes that carry its required workstation tag, or below the `unlockTier` of its required room zone type (spec 014 FR-003).
- **FR-012**: Unlocking MUST take effect at the tick boundary where `settlement.tier.reached` is emitted. Commands processed after that boundary see the new tier. Nothing is built, posted or crafted automatically on unlock.

#### Difficulty

- **FR-013**: The `Difficulty` enum (spec 007 FR-007) MUST have the members `Peaceful` (`"peaceful"`), `Steady` (`"steady"`) and `Harsh` (`"harsh"`); the default is `Steady`. The value is stored in `initOptions.difficulty` and is fixed for the whole game. Each mode maps, through game configuration data (`difficulty-modes.json`), to three fixed-point (×1000) multipliers: `decayMultiplier`, `needDecayMultiplier` and `factionHostilityMultiplier`. Multipliers are non-negative integers; content files may author decimals (spec 006 FR-014).
- **FR-014**: Combining multipliers: wherever this spec multiplies a fixed-point value `base` by a multiplier `m`, the result is `sign(base) × trunc(|base| × m / 1000)`, with the magnitude raised to 1 when `base` and `m` are both non-zero and the truncated result is 0. Multiple multipliers apply in sequence in the order listed in each FR, so results are bit-identical on every platform.
- **FR-015**: Difficulty multipliers MUST apply as follows:
  - `decayMultiplier` scales the per-tick decay rate of every perishable stack (spec 005 FR-020), after any zone modifier such as the Pantry (spec 018 FR-007): `effectiveRate = combine(combine(1000, zoneModifier), decayMultiplier)`.
  - `needDecayMultiplier` scales the per-tick decay of every need of every entity with needs (spec 013 FR-002; base rates from the 022 need registry). Critical thresholds and restoration amounts are not scaled.
  - `factionHostilityMultiplier` scales (a) every negative standing delta an NPC faction applies to its standing towards the player faction (spec 021 FR-006, FR-013), and (b) the selection weight that NPC faction AI (spec 021 FR-012) gives to hostile acts (Declaration of war) targeting the player faction. Positive deltas, standing values set directly by a Declaration, and standings between two NPC factions are not scaled.
- **FR-016**: Difficulty MUST NOT influence map generation, starting entities, content loading or any PRNG draw made at bootstrap. Two games with the same seed and options except `difficulty` MUST produce identical `maps` and `entities` at tick 0.

#### Settlement membership & guild founding

- **FR-017**: A settlement member is a living humanoid entity whose `Citizen.factions` contains the player government faction ID (spec 021 FR-002). Population is the count of settlement members, obtained with the 021 FR-015 membership query.
- **FR-018**: A guild faction (`factionType: "occupational"`, spec 022 US12) counts as founded while it has a non-null `leaderId` and at least `minFoundingMembers` members who are also settlement members. `minFoundingMembers` is a content constant (spec 022 FR-023, default 3). The founding condition is evaluated whenever guild membership or leadership changes, at the tick boundary.

#### Milestones

- **FR-019**: System MUST define a `MilestoneKind` enum with at least: `ThroneRoomEstablished` (first Throne Room zone becomes active), `FirstWorshipSpace` (first Chapel or Church becomes active), `FirstMarket` (first Market zone becomes active), `FirstGuildFounded` (FR-018), `FirstMasterCraftsman` (first settlement member whose skill reaches a guild's `masterSkillThreshold`, the spec 022 FR-012 guild field, default 60, shared with spec 028; detected from `identity.title.changed` with new rank `Master`, spec 028 FR-010), `FirstTradeAgreement` (first `diplomacy.agreement.formed` involving the player faction, spec 021 FR-011) and `FirstDwellingUpgrade` (first `housing.dwelling.upgraded` event, spec 029 FR-020; `subjectIds` holds the dwelling ID). The `milestone` value in payloads uses the kebab-case form of the member: `throne-room-established`, `first-worship-space`, `first-market`, `first-guild-founded`, `first-master-craftsman`, `first-trade-agreement`, `first-dwelling-upgrade`.
- **FR-020**: Each milestone MUST be recorded at most once per game as a `MilestoneRecord { milestone, tick, subjectIds }`, where `subjectIds` lists the integer entity IDs involved (zone, faction, citizen). Recording emits `settlement.milestone.reached` with the same payload. Milestones are detected from events (spec 010) at the tick boundary they occur in, not on the daily evaluation tick.
- **FR-021**: A `startingTier` (FR-022) MUST NOT record any milestone.

#### Bootstrap, save and events

- **FR-022**: `newGame()` options (spec 007 FR-007) MUST accept an optional `startingTier` (`SettlementTier`, default `Hamlet`). The settlement starts at that tier with `tierReachedAtTick` 0 for it and every lower tier; no `settlement.tier.reached` event is emitted for them. `startingTier` is stored in `initOptions`.
- **FR-023**: All settlement progress state (FR-002) MUST serialize to GameState (spec 006) and resume identically on load. Requirement status is derived and MUST NOT be stored.
- **FR-024**: Save migration (spec 006) MUST map the legacy difficulty values `normal` → `steady` and `hard` → `harsh` when loading saves from earlier format versions.
- **FR-025**: System MUST emit `settlement.tier.reached { tier, previousTier, tick }` (FR-004) and `settlement.milestone.reached { milestone, tick, subjectIds }` (FR-020) (spec 010 naming). Subscribers such as the chronicle (spec 028) can listen to `settlement.**` (a single `*` matches only one segment, spec 010).

### Key Entities

- **SettlementTier**: Fixed enum Hamlet < Village < MarketTown < CharteredTown, each with a content `settlementNoun` (hamlet, village, market town, town). The settlement's current tier only ever rises.
- **SettlementProgress**: Component on the player government faction entity holding the current tier, the reach tick per tier, and the recorded milestones.
- **TierRequirement**: Configuration record `{ kind: TierRequirementKind, ...integer params }` belonging to one tier; evaluated daily, reported by `getSettlementProgress()`.
- **unlockTier**: Optional field on furniture, zone type, recipe and job type content entries; the lowest tier at which the entry can be built, designated, crafted or posted.
- **ContentLockedError**: Typed error returned when a command targets locked content; carries content kind, ID and required tier.
- **MilestoneRecord**: `{ milestone: MilestoneKind, tick, subjectIds }`; recorded once per milestone per game.
- **Difficulty**: Fixed enum Peaceful / Steady / Harsh stored in `initOptions`; maps to three fixed-point multipliers in configuration data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In a headless scenario test, a settlement started at Hamlet reaches every tier in order, each reached on the first daily evaluation where its requirements hold; `settlement.tier.reached` fires exactly 3 times and never for a lower tier.
- **SC-002**: 100% of build, designate, craft-order and posting commands targeting locked content are rejected with `ContentLockedError` and leave the saved game state byte-identical to before the command.
- **SC-003**: Every need in the 022 need registry can be satisfied by at least one method that uses only Hamlet-unlocked content, verified by a scenario test running a Hamlet for 3 game days on Steady with no citizen reaching a critical need for lack of an available method.
- **SC-004**: With the same seed, Peaceful, Steady and Harsh produce identical `maps` and `entities` at tick 0 in 100% of tested seeds (at least 20).
- **SC-005**: On the shipped configuration, unprotected bread lasts at least 1.5× longer on Peaceful than on Steady, and Harsh lasts at most 0.8× as long as Steady.
- **SC-006**: Over a 30-game-day headless run with identical seeds, the count of hostile diplomatic acts by NPC factions towards the player on Peaceful is at most half of that on Steady.
- **SC-007**: Each milestone is recorded at most once across a 100-game-day scenario run that repeatedly creates and destroys the triggering zones, and survives save/load with identical ticks.
- **SC-008**: `getSettlementProgress()` returns in under 5 ms with 200 settlement members and 100 zones.
- **SC-009**: Content loading with a tier requirement that references a same-tier or higher-tier zone type fails with a validation error naming the tier, the requirement and the zone type.

## Assumptions

- **Proposed tier requirements (configuration data, tunable)**:

  | Tier           | Requirements                                                                                                                              |
  | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
  | Hamlet         | Start tier                                                                                                                                |
  | Village        | Population ≥ 8; 4 dwellings at Hovel or above; active Throne Room; active Chapel or Church                                                |
  | Market Town    | Population ≥ 20; 8 dwellings at Cottage or above; active Market; active Tavern; 1 founded guild                                           |
  | Chartered Town | Population ≥ 40; 12 dwellings at Timber-Framed House or above; 3 at Burgher House; active Church; 3 founded guilds; `FirstTradeAgreement` |

- **Proposed unlock slices of the 022 zone catalog** (furniture, recipes and job types follow the zones that use them; final assignment is content work):

  | Unlock tier    | Zone types                                                                                                                                                                  |
  | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Hamlet         | Stockpile, Farm Field, Pasture, Herb Garden, Quarry, Fishing Dock, Charcoal Yard, Kitchen, Carpentry, Mason's Workshop, Bedroom, Dormitory, Chapel, Guard Post, Throne Room |
  | Village        | Bakery, Smithy, Tannery, Pottery, Brewery, Smokehouse, Pantry, Warehouse, Orchard, Apiary Yard, Tavern, Market, Cemetery                                                    |
  | Market Town    | Weaving Hall, Wine Cellar, Vineyard, Great Hall, Church, Barracks, Armory                                                                                                   |
  | Chartered Town | Scriptorium, Cloister                                                                                                                                                       |

  Throne Room is a Hamlet unlock because Town Criers (017 FR-011), the treasury (019 FR-003) and the Steward office (spec 026) need it from the start; building it is a milestone and a Village requirement. Mason's Workshop (and with it the Mason's Bench) is a Hamlet unlock so that Stone Block, needed for the Throne and the Altar, can be produced before Village. Notice Posts and the Bell Tower carry `unlockTier: "village"` and `"market_town"` (spec 026 FR-021, FR-022). Standing orders themselves are available from Hamlet (spec 026).
  **Open question:** the Hamlet slice is not yet self-sufficient for metal. The Mason's Bench (needs Iron Chisels) and the Throne (needs Iron Ingots) depend on iron, but the Smelter/Forge sit in the Village-tier Smithy, so Village is unreachable from Hamlet content alone (violates FR-010's reachability rule). Options: a starting-stock kit for new games (e.g. iron ingots and chisels, spec 007), moving a basic Smelter/Forge to Hamlet, or removing iron from the Mason's Bench and Throne costs (spec 022).

- **Proposed difficulty multipliers (×1000, configuration data)**:

  | Mode     | decayMultiplier | needDecayMultiplier | factionHostilityMultiplier |
  | -------- | --------------- | ------------------- | -------------------------- |
  | Peaceful | 500             | 700                 | 250                        |
  | Steady   | 1000            | 1000                | 1000                       |
  | Harsh    | 1500            | 1300                | 1500                       |

- **One settlement per game**: A game has exactly one player settlement. Multiple player settlements are out of scope.
- **No raids or combat**: "Faction hostility" covers only standing and diplomatic acts as defined in spec 021. No spec defines raids or warfare yet.
- **Tier is not government**: Reaching Chartered Town does not change government type, taxation or policy; those remain ROADMAP items. Rent from dwellings (spec 029) is unaffected by tier.
- **Requirements re-use existing queries**: Population, active zones, dwelling levels (`countDwellingsAtOrAbove`, spec 029 FR-019) and guild membership are read through the queries of specs 015, 021 and 029; this spec adds no new world state beyond `SettlementProgress`.
- **Open question:** Should the player be allowed to change difficulty mid-game (e.g. lowering to Peaceful)? This spec fixes it at `newGame()`; allowing changes would need a command, an event and a rule for the chronicle.
- **Open question:** Should reaching a tier need an in-world act (e.g. a charter delivered by Envoy from an overlord faction for Chartered Town) instead of happening automatically? This spec keeps it automatic.

## Design Decisions (proposed — pending user review)

- Q: Can the settlement lose a tier? → A: No. Tier-up is permanent; requirements are only checked for the next tier (FR-005).
- Q: How often are tier requirements evaluated? → A: Once per game day at `tickCount % 288 == 0`, one step per evaluation (FR-004). Milestones are event-driven and immediate (FR-020).
- Q: Does locked content disappear from the game? → A: No. It stays loaded, browsable, ownable and tradeable; only build, designate, craft-order and new-posting commands are rejected (FR-008).
- Q: What does "founding a guild" mean, given guilds are faction prototypes in 022? → A: A guild faction is founded while it has a leader and at least `minFoundingMembers` (default 3) members who belong to the settlement (FR-018).
- Q: What happens to the old `Normal`/`Hard` difficulty values of spec 007? → A: Replaced by `Steady`/`Harsh`; old saves are migrated (FR-024).
