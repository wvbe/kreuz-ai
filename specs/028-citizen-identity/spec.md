# Feature Specification: Citizen Identity & Chronicle

**Created**: 2026-10-05
**Input**: User description: "Make citizens into characters: automatic titles like 'Ansel the Baker' that become 'Master Baker' once the skill clears the guild bar, small notifications like 'Mathilde has become the village's finest smith', and a short life journal per citizen, so players bond with named people."

## User Scenarios & Testing

### User Story 1 — Every citizen has a name (Priority: P1)

When a citizen is created, at a new game, by immigration (spec 029 FR-015, named at spawn) or by any other spawn, the engine gives it a period-appropriate name: a given name and, usually, a byname (e.g. "Ansel atte Brook", "Mathilde Fairhair", "Odo of the Mill"). Names are drawn from name-list content (spec 022) on a dedicated derived PRNG stream (spec 011), so the same seed always produces the same villagers with the same names. No two living settlement citizens share the same full name. Authored characters (scenario or prototype data) may carry a fixed name instead.

**Why this priority**: A name is the minimum needed to make a citizen a person rather than "Peasant #42". Titles, notifications and journals all refer to it.

**Independent Test**: Headless: bootstrap two games with seed 777 and spawn 50 citizens in each; verify both games produce identical names in identical order, every name is built from the loaded name list, and no two living citizens share a full name.

**Acceptance Scenarios**:

1. **Given** a game with seed 777, **When** 50 citizens are spawned in the same order in two separate runs, **Then** each citizen in run A has exactly the same given name and byname as its counterpart in run B.
2. **Given** a citizen whose randomly drawn full name equals that of a living settlement citizen, **When** naming runs, **Then** the engine redraws (FR-004) and, if it still collides, assigns the next free name ordinal, so the two full names differ.
3. **Given** an authored prototype or scenario entry that sets `givenName: "Aldric"` and `byname: "de la Haye"`, **When** the entity is created, **Then** it carries exactly that name and draws nothing from the names stream.
4. **Given** a citizen with a name, **When** the game is saved and loaded, **Then** the name is identical, and the names stream continues from where it was (the next spawned citizen gets the same name it would have got without the save/load).
5. **Given** a name-list file in which a byname equals a skill's title noun (e.g. "Baker"), **When** content loads, **Then** validation fails with an error naming that entry (bynames must never be confused with derived titles).

---

### User Story 2 — Titles derived from skills (Priority: P1)

A citizen's title is derived from its skills (spec 020), never stored as a profession (spec 020 has no profession component). Once a citizen's best skill reaches the title threshold, they are styled after it: "Ansel the Baker". Once that skill reaches the master threshold of the guild whose membership criterion uses that skill (spec 022 guild catalog), they become a master: "Ansel, Master Baker". A citizen who leads a faction (spec 021 `leaderId`) also carries that office: "Ansel, Master Baker of the Baker's Guild". Titles update as skills grow, with a small hysteresis so a title does not flicker between two near-equal skills.

**Why this priority**: The title is the most visible proof of the soft-profession design. Players see who the bakers and smiths are without opening a skills table.

**Independent Test**: Headless: create a citizen with `baking: 10`; verify it has no title. Raise baking to 20 and verify the title is `{ skillId: "baking", rank: Practitioner }`. Raise it to the Baker's Guild master threshold and verify `rank: Master` and that `identity.title.changed` fired both times with old and new title.

**Acceptance Scenarios**:

1. **Given** a citizen whose highest skill is below `titleThreshold`, **When** its identity is queried, **Then** `title.rank` is `None` and the styled name is the plain full name ("Ansel atte Brook").
2. **Given** a citizen with `baking: 25` as its highest skill and `titleThreshold` 20, **When** queried, **Then** `title` is `{ skillId: "baking", rank: Practitioner, noun: "Baker" }` and the styled name is "Ansel the Baker".
3. **Given** the Baker's Guild with `masterSkillThreshold` 60 and a citizen whose baking rises from 59 to 60, **When** the `skill.increased` event is processed, **Then** the title rank becomes `Master`, the styled name becomes "Ansel, Master Baker", and `identity.title.changed` is emitted with the old and new title.
4. **Given** a Master Baker (baking 62) whose farming rises to 70, **When** the title is recomputed, **Then** the title stays Master Baker (a Master rank outranks a higher Practitioner-rank skill, FR-008).
5. **Given** a citizen titled "the Baker" (baking 40) whose cooking rises to 42, **When** the title is recomputed with `titleSwitchMargin` 5, **Then** the title stays "the Baker"; **When** cooking reaches 45, **Then** the title becomes "the Cook".
6. **Given** a citizen with `hauling: 50` as its best skill and no guild using hauling, **When** queried, **Then** the title is "the Porter" and never reaches `Master`, however high hauling grows.
7. **Given** a citizen who is the `leaderId` of the Baker's Guild, **When** queried, **Then** `offices` contains `{ factionId, leaderTitle: "Master Baker" }` and the styled name is "Ansel, Master Baker of the Baker's Guild".

---

### User Story 3 — Notable moments and small notifications (Priority: P1)

When something worth telling happens to a settlement citizen (earning a title, becoming a master, overtaking everyone else to become the settlement's finest in a skill, joining a guild, taking an office, arriving, dying), the engine records a **notable moment** and emits it as an event. The renderer (spec 024) shows major moments as small notifications ("Mathilde hath become the village's finest smith") and lists all of them in the chronicle. The engine only records structured data; the wording comes from content templates.

**Why this priority**: Notifications are where players notice individuals. Without them, title changes happen silently in panels nobody has open.

**Independent Test**: Headless: two settlement smiths at smithing 40 and 35; raise the second to 41; verify one `chronicle.moment.recorded` event with kind `BecameFinest`, `skillId: "smithing"`, the new holder's entity ID and a name snapshot, and that the moment appears in the settlement chronicle and both smiths' journals (as gained and lost).

**Acceptance Scenarios**:

1. **Given** Mathilde (smithing 41) overtakes the current finest smith (smithing 40), and `finestMinimumLevel` is 30, **When** the `skill.increased` event is processed, **Then** a `BecameFinest` moment with prominence `Major` is recorded and `chronicle.moment.recorded` is emitted.
2. **Given** two smiths both at smithing 41, **When** the non-holder reaches 41, **Then** the holder does not change (the holder changes only when strictly exceeded).
3. **Given** a holder overtaken within `finestCooldownDays` of the last `BecameFinest` moment for that skill, **When** the holder changes, **Then** the holder record is updated but no new moment is recorded (no notification spam from two citizens leapfrogging).
4. **Given** a citizen spawned with prototype starting skills (e.g. the Baker prototype, baking 30), **When** it is created, **Then** only an `Arrived` moment is recorded; titles it holds from the start do not produce `TitleEarned` moments.
5. **Given** a visiting merchant who is not a member of the player's government faction, **When** its skills change, **Then** its title still updates, but it records no settlement moments and never becomes the settlement's finest.
6. **Given** a moment template with the placeholder `{settlementNoun}`, **When** the settlement is at the Village tier (spec 027), **Then** the rendered text reads "the village's finest smith".

---

### User Story 4 — A short life journal per citizen (Priority: P2)

Each citizen keeps a short, bounded journal of its own notable moments and a few small "firsts": arrived in the settlement, first completed work in a skill, first trade, joined a guild, earned a title, became a master, became the finest, lost that standing, took or lost an office, moved to a better home (spec 029). The inspection panel (spec 024) shows it as a few lines of flavour text in pseudo-old English. Old entries drop off when the journal is full, but the arrival entry is always kept.

**Why this priority**: The journal turns a stat sheet into a biography. It is P2 because names, titles and notifications already create attachment; the journal deepens it.

**Independent Test**: Headless: create a citizen, have it complete its first baking recipe, join the Baker's Guild and reach the title threshold; verify the journal contains, in tick order, `Arrived`, `FirstWork{skillId: baking}`, `JoinedGuild`, `TitleEarned`, each with the tick it happened.

**Acceptance Scenarios**:

1. **Given** a citizen that completes its first `skill.work.completed` for `baking`, **When** the event is processed, **Then** a `FirstWork` entry with `skillId: "baking"` is appended; later baking completions add no further `FirstWork` entries for baking.
2. **Given** a journal at `journalCapacity` entries, **When** a new entry is appended, **Then** the oldest entry other than `Arrived` is dropped and the journal length stays at `journalCapacity`.
3. **Given** a citizen with journal entries, **When** saved and loaded, **Then** the journal is identical, entry for entry.
4. **Given** a journal entry, **When** the shared formatting helper renders it with the shipped templates, **Then** the text names the citizen by the name snapshot stored in the entry, in the flavour style, e.g. "In the 12th day, Ansel first set hand to the baking of bread."

---

### User Story 5 — The settlement chronicle (Priority: P2)

The settlement keeps a chronicle: a bounded, tick-ordered list of the major moments of all its citizens plus settlement milestones (spec 027). Entries keep name snapshots, so the chronicle still reads correctly after the people in it have died or left. The player can open it from the UI (spec 024) and filter by citizen or kind.

**Why this priority**: The chronicle is the settlement's story in one place, and the record that outlives individual citizens. P2 because it is a view over moments that US3 already produces.

**Independent Test**: Headless: record 5 major moments for three citizens, delete one citizen, query the chronicle; verify all 5 entries remain in tick order with their name snapshots, and that a filter by the deleted citizen's entity ID still returns its entries.

**Acceptance Scenarios**:

1. **Given** major moments for several citizens, **When** the chronicle is queried, **Then** the entries are returned in ascending tick order (ties in recording order).
2. **Given** a citizen who dies (its entity is deleted), **When** deletion is processed, **Then** a `Died` moment is recorded with the citizen's last styled name, and its earlier chronicle entries stay.
3. **Given** a chronicle at `chronicleCapacity`, **When** a new entry is added, **Then** the oldest entry is dropped.
4. **Given** spec 027 emits `settlement.milestone.reached` (e.g. `first-guild-founded`), **When** it is processed, **Then** a `SettlementMilestone` entry with the milestone ID is added to the chronicle.
5. **Given** spec 027 emits `settlement.tier.reached { tier: "village" }`, **When** it is processed, **Then** a `TierReached` entry with `tier: "village"` is added to the chronicle.
6. **Given** a Cottage with two residents, **When** spec 029 emits `housing.dwelling.upgraded { dwellingId, fromLevel: Cottage, toLevel: TimberFramedHouse }`, **Then** each resident gets a `HomeImproved` journal entry with `dwellingLevel: "timber_framed_house"`.

---

### User Story 6 — The player renames a citizen (Priority: P3)

The player may rename any settlement citizen, for example after a friend. The new name replaces the given name and byname everywhere (panel, titles, future moments); past journal and chronicle entries keep the name the citizen had at the time, and a `Renamed` journal entry records the change.

**Why this priority**: Naming your own people is a strong bonding tool in colony games, but generated names already deliver the core value.

**Independent Test**: Headless: issue a rename command for a citizen to "Gisela" / "Underhill"; verify the identity changes, a `Renamed` journal entry stores old and new names, earlier entries are unchanged, and an empty given name is rejected.

**Acceptance Scenarios**:

1. **Given** a citizen "Ansel atte Brook", **When** the player renames it to "Gisela Underhill", **Then** the identity shows the new name and the journal gains a `Renamed` entry with both names.
2. **Given** a rename with an empty given name or a name longer than 40 characters, **When** submitted, **Then** the command is rejected with a validation error and nothing changes.
3. **Given** a rename to a full name already held by another living settlement citizen, **When** submitted, **Then** the command is accepted and the next free name ordinal is applied (FR-004).

---

### Edge Cases

- What if the name list cannot produce a unique full name (small list, large population)? → After the redraws of FR-004, the engine assigns the lowest free name ordinal (shown as "Ansel atte Brook II"). Naming never fails and never loops.
- What if two skills tie exactly for the best skill? → The current title skill is kept (hysteresis). With no current title, the tie is broken by skill ID in ascending order, never by PRNG, so the title does not depend on random draw order.
- What if a skill is used by more than one guild's membership criterion (e.g. masonry for the Mason's and Potter's Guild)? → The master threshold is the lowest `masterSkillThreshold` among those guilds, and the title noun stays the skill's own noun ("Mason"). See the Open question on Potter titles under Assumptions.
- What if the finest holder dies or leaves the settlement? → The holder is recomputed by scanning settlement citizens. The new holder (if any meets `finestMinimumLevel`) is set without a moment, so a death is not followed by a cheerful "has become the finest" notification.
- What if a citizen leaves the player's government faction? → It keeps its name, title and journal; it no longer counts for "finest" and records no new settlement moments. Its earlier chronicle entries stay.
- What if a chronicle or journal entry refers to an entity that no longer exists? → Entries store a name snapshot and are never resolved for game logic. The renderer shows the snapshot without a link.
- What if a citizen reaches the master threshold and the title threshold in the same tick (e.g. a large skill jump)? → One `identity.title.changed` event from the old title to the final title, and one moment of the highest kind reached (`MasteryAchieved`), not two.
- What if a save contains a name-list ID that no longer exists? → Names are stored as strings on the entity, so the citizen keeps its name. Only a prototype's `nameListId` that does not resolve is a load error (spec 022 FR-015).
- What if a citizen performs work with no skill (no `skill.work.completed`)? → No `FirstWork` entry. Journals only record what the event bus reports.

## Requirements

### Functional Requirements

#### Names

- **FR-001**: The content registries (spec 022 FR-018) MUST include a **name-list** registry (spec 022 FR-021). Each entry declares `id` (snake_case), `givenNames` (non-empty list of strings) and `bynames` (list of strings, may be empty), with optional integer `weight` per name (default 1). The shipped default list `common_13c` MUST contain at least 60 given names and 40 bynames in a blended 13th-century Western European style (spec 022 FR-017), e.g. given names Ansel, Mathilde, Aldric, Agnes, Odo, Beatrix, Godfrey, Hedwig, Piers, Juliana; bynames atte Brook, of the Mill, Fairhair, the Red, Underhill, de la Haye, Hughson. Duplicate strings within one list and bynames equal to any skill's `titleNoun` (FR-006) MUST be load errors.
- **FR-002**: Humanoid prototypes (spec 022) MAY declare `nameListId`; when absent, `common_13c` is used. Prototype or scenario data MAY declare a fixed `givenName` and optional `byname`, in which case no name is drawn.
- **FR-003**: Every entity with a `Citizen` component MUST carry an `Identity` component: `{ givenName: string, byname: string | null, nameOrdinal: integer (0 = none), nameListId: string }`, plus the title snapshot of FR-010 and the journal of FR-017. Names are stored as strings, not indices, so a save stays readable when name-list content changes.
- **FR-004**: Names MUST be drawn when the Citizen is created, from the derived PRNG stream `identity.names` (spec 011 `derive`), using weighted selection over the entity's name list: one given name, then one byname with probability `bynameChance` (game configuration, default 0.85, stored ×1000). If the full name (`givenName` + `byname`) equals that of a living citizen who is a member of the same government faction, the engine MUST redraw up to `nameRedrawLimit` times (default 8); if it still collides, it MUST keep the last draw and set `nameOrdinal` to the lowest integer ≥ 2 not used by a living citizen with that full name. The number of draws MUST depend only on game state, so naming is deterministic.
- **FR-005**: The engine MUST emit `identity.named` with `{ entityId, givenName, byname, nameOrdinal }` when a citizen is named or renamed.

#### Titles

- **FR-006**: Skill entries in the skill registry (spec 022 FR-006) MUST declare `titleNoun` (string, e.g. baking → "Baker", smithing → "Smith", farming → "Farmer", hauling → "Porter", preaching → "Preacher", combat → "Man-at-Arms"). Guild faction entries carry `masterSkillThreshold`, the field spec 022 FR-012 defines (integer 0–100, greater than the guild's membership threshold, default 60) and spec 027 also uses for `FirstMasterCraftsman`.
- **FR-007**: A citizen's title MUST be derived from its skill profile (spec 020 FR-002 integer levels), the guild catalog and faction leadership (spec 021), never stored as an authoritative profession. The title is `{ skillId, rank, noun, guildId | null }` where `rank` is the `TitleRank` enum `None | Practitioner | Master`:
  - `Practitioner` when the title skill's level ≥ `titleThreshold` (game configuration, default 20);
  - `Master` when, in addition, a guild's membership criterion uses that skill and the level ≥ that guild's `masterSkillThreshold` (lowest across guilds using the skill); `guildId` is that guild;
  - `None` otherwise. Guild membership (`Citizen.factions`) is not required for a rank; titles describe skill, membership is a separate, voluntary choice (spec 022 Assumptions).
- **FR-008**: The title skill MUST be chosen by ordering candidate skills by rank (Master first), then level (highest first). The current title skill MUST be kept unless a candidate has a higher rank, or the same rank and a level at least `titleSwitchMargin` (game configuration, default 5) above the current title skill's level. With no current title skill, ties are broken by `skillId` ascending. The title skill may therefore differ from spec 020's `dominantSkill`.
- **FR-009**: A citizen who is the `leaderId` of any faction (spec 021 FR-003) MUST expose `offices: [{ factionId, leaderTitle }]`, using the faction's leader title (spec 022 catalogs), ordered by faction entity ID. The citizen who holds the Steward office (spec 026 FR-013, `stewardEntityId`) MUST also expose `{ factionId: <player government faction ID>, leaderTitle }`, listed after faction leaderships. The name-format templates (FR-011) are the single source of the Steward office title; the shipped template value is "Steward".
- **FR-010**: The `Identity` component MUST store the last computed title (`titleSnapshot`) only for change detection. The engine MUST recompute the title when it processes `skill.increased` (spec 020 FR-013) for the citizen, or when the citizen's faction membership or leadership changes, and MUST emit `identity.title.changed` with `{ entityId, oldTitle, newTitle }` when the result differs from the snapshot. At most one such event is emitted per citizen per event being processed.
- **FR-011**: The engine MUST provide a pure, headless query `getIdentity(entityId)` returning given name, byname, name ordinal, full name, current title, offices and a styled name, and a pure formatting helper that builds the styled name from name-format templates in content: plain ("{given} {byname}"), Practitioner ("{given} the {noun}"), Master ("{given}, Master {noun}"), and office suffix (" of the {factionName}" when the office's leader title equals the Master title, otherwise ", {leaderTitle} of the {factionName}").

#### Notable moments

- **FR-012**: The engine MUST define the `NotableMomentKind` enum: `Arrived`, `TitleEarned`, `MasteryAchieved`, `BecameFinest`, `LostFinest`, `JoinedGuild`, `LeftGuild`, `TookOffice`, `LostOffice`, `FirstWork`, `FirstTrade`, `HomeImproved`, `Renamed`, `Died`, `SettlementMilestone`, `TierReached`. Each kind has a fixed `MomentProminence` (enum `Minor | Major`): Major for `Arrived`, `MasteryAchieved`, `BecameFinest`, `TookOffice`, `Died`, `SettlementMilestone`, `TierReached`; Minor for all others.
- **FR-013**: A moment MUST be recorded from these sources only: citizen creation as a settlement member, or joining the player's government faction later (`Arrived`); `identity.title.changed` (`TitleEarned` when the new rank is Practitioner and the skill or rank changed upward, `MasteryAchieved` when the new rank is Master); finest tracking (FR-015); a change in `Citizen.factions` involving an occupational faction (`JoinedGuild`, `LeftGuild`); a change of a faction's `leaderId`, or `steward.appointed` / `steward.dismissed` (spec 026 FR-024) (`TookOffice`, `LostOffice`); the first `skill.work.completed` (spec 020 FR-005) per skill per citizen (`FirstWork`); the citizen's first `trade.completed` (spec 019 FR-010) as buyer or seller (`FirstTrade`); `housing.dwelling.upgraded` (spec 029 FR-020) for the citizen's home, one `HomeImproved` per resident with `dwellingLevel` = `toLevel`; the rename command (`Renamed`); `entity.deleted` of a citizen (`Died`); `settlement.milestone.reached` (spec 027 FR-020, `SettlementMilestone` with `milestoneId`); and `settlement.tier.reached` (spec 027 FR-004, `TierReached` with `tier`). Title changes caused by a citizen's creation-time skills MUST NOT record moments.
- **FR-014**: Each moment MUST be a JSON-serializable record `{ momentId: integer (monotonic), tick, kind, entityId | null, nameSnapshot: string | null, params }`, where `params` holds only strings and integers (e.g. `skillId`, `guildId`, `factionId`, `milestoneId`, `dwellingLevel`, `previousName`). Recording a moment MUST emit `chronicle.moment.recorded` with the full record and its prominence. Moments are recorded only for citizens who are members of the player's government faction (spec 021 FR-002), except `SettlementMilestone` and `TierReached`, which have `entityId: null`.
- **FR-015**: The engine MUST track, per skill, the settlement's finest holder `{ entityId, level, sinceTick, lastAnnouncedTick }` over living settlement citizens. When a citizen's level in that skill strictly exceeds the holder's level and is ≥ `finestMinimumLevel` (default 30), the citizen becomes holder. A `BecameFinest` moment for the new holder and a `LostFinest` moment for the previous holder are recorded only if at least `finestCooldownDays` game days (default 3; one game day is 288 ticks, spec 001) have passed since `lastAnnouncedTick`; otherwise the holder changes silently. If the holder dies or leaves the settlement, the holder is recomputed by scan (highest level, ties by entity ID ascending) without recording moments.
- **FR-016**: Moment text MUST NOT be stored in game state. Content MUST provide, in a fixed-key moment and name-format template table (spec 022 FR-018; separate from the name-list registry), one text template per `NotableMomentKind` (and per journal entry form, FR-017) with named placeholders (`{name}`, `{noun}`, `{nounLower}`, `{skillName}`, `{guildName}`, `{settlementNoun}`, `{day}`, …). The shipped templates use the flavour register of spec 024 (pseudo-old English that stays readable), e.g. `BecameFinest`: "{name} hath become the {settlementNoun}'s finest {nounLower}". `{settlementNoun}` is the current tier's `settlementNoun` (spec 027 FR-001: hamlet, village, market town, town). The formatting helper MUST be pure and usable headless (e.g. by a terminal renderer).

#### Journal and chronicle

- **FR-017**: Each citizen's `Identity` component MUST hold a `journal`: an ordered list of moment records concerning that citizen (Minor and Major, including moments recorded for it while it was a settlement member), with at most `journalCapacity` entries (default 24). When full, the oldest entry that is not the citizen's `Arrived` entry MUST be dropped. A citizen that is not a settlement member keeps an empty journal; when it joins the player's government faction, its `Arrived` moment is recorded then.
- **FR-018**: The player's government faction entity (spec 021) MUST carry a `SettlementChronicle` component: the list of all Major moments (including `SettlementMilestone` and `TierReached` entries), in recording order, with at most `chronicleCapacity` entries (default 200; oldest dropped first), plus the finest-holder table of FR-015 and the next `momentId`.
- **FR-019**: The engine MUST provide headless queries `getJournal(entityId)` and `getChronicle({ entityId?, kinds?, sinceTick? })`. Filtering by `entityId` MUST also work for entities that no longer exist.
- **FR-020**: The engine MUST accept a `renameCitizen { entityId, givenName, byname | null }` command. Given name MUST be 1–40 characters, byname 0–40 characters, both trimmed, printable, without control characters; otherwise the command is rejected with a validation error. A valid rename applies FR-004's ordinal rule (without redraws), records a `Renamed` moment with `previousName`, and emits `identity.named`.
- **FR-021**: All identity state (Identity components, journals, SettlementChronicle, finest holders, the `identity.names` PRNG stream) MUST serialize with GameState (spec 006) as integers and strings, and a save/load MUST reproduce identical names, titles, moments and journals for the rest of the run.

#### Renderer (spec 024)

- **FR-022**: The renderer (spec 024 FR-038, FR-039) MUST show the styled name wherever a citizen is named (map label on hover, inspection panel header, job and trade records), the title rank and offices in the inspection panel, and a "Journal" tab rendering the citizen's journal with the shared formatting helper.
- **FR-023**: The renderer (spec 024 FR-040) MUST show each Major `chronicle.moment.recorded` as a small, non-blocking notification that links to the citizen (or to the chronicle for `SettlementMilestone` and `TierReached`). When more than `toastBurstLimit` (renderer setting, default 3) notifications arrive within one game hour, the rest are folded into a single "N more tidings" notification linking to the chronicle. Minor moments are not notified.
- **FR-024**: The renderer (spec 024 FR-041) MUST provide a chronicle view listing chronicle entries newest first, filterable by citizen and by kind, with links to citizens that still exist.

### Key Entities

- **NameList** (content, spec 022): a named pool of given names and bynames with optional weights.
- **Identity** (component on every Citizen): given name, byname, name ordinal, name list ID, title snapshot, and the bounded journal.
- **Title** (derived, not authoritative state): `{ skillId, rank: TitleRank, noun, guildId | null }` computed from skills, guild master thresholds and leadership.
- **NotableMoment**: a structured, JSON-serializable record of something worth telling, with kind, tick, subject, name snapshot and string/integer params. Never contains rendered text.
- **SettlementChronicle** (component on the player's government faction entity): bounded list of Major moments and milestones, the per-skill finest-holder table, and the moment ID counter.
- **Moment templates** (content, fixed-key config table per spec 022 FR-018, not part of the name-list registry): per-kind text templates and name-format templates in the flavour register, rendered by a pure helper.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Two games bootstrapped with the same seed and the same spawn sequence produce byte-identical Identity components and chronicles after 10 game days.
- **SC-002**: In a settlement of 100 citizens using the default name list, no two living settlement citizens share a styled name, and fewer than 5% carry a name ordinal.
- **SC-003**: For 100% of citizens in a scenario test, the title returned by `getIdentity` equals an independent recomputation from the skill profile and guild content under FR-007 and FR-008.
- **SC-004**: In a 30-game-day scenario with 50 citizens, no citizen's title changes more than once within any single game day (hysteresis works), and every title change has exactly one `identity.title.changed` event.
- **SC-005**: In the same scenario, the number of Major moments is at most 2 per game day on average, so notifications stay "small" without renderer folding.
- **SC-006**: With 200 citizens at full journals and a full chronicle, identity state adds no more than 300 KB to the save.
- **SC-007**: A player shown the inspection panel of a random citizen can state its name, what it is known for and one thing that happened to it, using only the panel (verified in playtest with at least 5 participants, 4 of 5 succeeding).

## Assumptions

- **Citizens are humanoids with a `Citizen` component**: animals, furniture and factions get no Identity. Visitors from other factions get a name and title but are not part of the settlement's moments or "finest" table.
- **"The settlement" is the player's government faction's members**: there is one player settlement per game. A multi-settlement game would need a settlement entity; that is out of scope.
- **No sex or gender attribute exists in any spec**: given names come from a single pool, and the shipped templates refer to citizens by name, never by gendered pronoun or noun. **Open question:** if a future spec adds sex or gender (e.g. for families or births), name lists and templates must split given names and pronoun forms accordingly; nouns like "Man-at-Arms" should then get a neutral or per-form variant.
- **No families, births or ageing**: patronymic bynames ("Hughson") are flavour strings from the list, not links to real parents. Ageing and generations remain on docs/ROADMAP.md.
- **Skills never decrease (spec 020)**: so a Master rank in a skill is never lost; only the title skill can switch, by FR-008.
- **Thresholds are content constants (spec 022 FR-016, FR-023)**: `titleThreshold`, `titleSwitchMargin`, `finestMinimumLevel`, `finestCooldownDays`, `bynameChance`, `nameRedrawLimit`, `journalCapacity`, `chronicleCapacity` are tunable without code changes.
- **Starting prototypes start titled**: the Baker prototype (baking 30) starts as "the Baker" with no moment; with `masterSkillThreshold` 60, no prototype in the spec 022 catalog starts as a Master.
- **Potter titles**: the Potter's Guild uses masonry as its criterion, so a potter is titled "the Mason" today. **Open question:** a `pottery` skill (or a guild-supplied noun override) would let potters be called "Potter"; this spec does not add a skill.
- **Journals are not a full history**: they are bounded biographies. A complete event log and replay stay on docs/ROADMAP.md (History & Narrative), and this spec does not record ordinary daily actions.

## Design Decisions (proposed — pending user review)

- Q: Does "Master Baker" require guild membership or only skill? → A: Only skill. The rank is descriptive (spec 020 has no professions), and guild membership stays a separate, voluntary choice (spec 022). Leading the guild adds the office.
- Q: The guild catalog's only threshold (≥ 15) is below every craft prototype's starting skill (30). Which threshold makes a Master? → A: A new per-guild `masterSkillThreshold` (suggested 60). Using the membership threshold would make every starting craftsman a Master.
- Q: Are titles stored? → A: Derived. Only a snapshot is stored, for change detection and events, consistent with state transparency and no profession component.
- Q: Does the engine produce text? → A: Only structured moments. Text comes from content templates through a pure helper shared by all renderers, in the spec 024 flavour register.
- Q: Where does the settlement chronicle live? → A: On the player's government faction entity as a component, so no new GameState root field is needed.
