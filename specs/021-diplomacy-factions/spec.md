# Feature Specification: Diplomacy & Factions

**Feature Branch**: `022-diplomacy-factions`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "the diplomacy & factions feature. Each faction has a leader, and diplomatic dispatches must be brought to that leader and not just into territory." Prior clarifications: Factions are ECS entities with multi-membership; player government is a faction; faction standing is a baseline bias on individual affinity; diplomatic actions = trade agreements, gifts, declarations, overtures; consequences = trade access + affinity baseline + labour access; dispatch via dedicated Diplomatic Envoy entity.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Factions as ECS Entities (Priority: P1)

A **Faction** is a standard ECS entity in the game world. It has components that declare its name, type (political, occupational, religious — open set), current standing with other factions, a reference to its **leader entity**, and a list of member entities. Entities may belong to multiple factions simultaneously. The player's government is itself a faction. Factions are created in world data or at runtime; they use the same entity prototype and component machinery as any other entity (feature 003).

**Why this priority**: Factions are the foundation of everything else in this spec. Without them, standing, diplomacy, and membership have no data structure to anchor to.

**Independent Test**: Can be fully tested headlessly by: registering two Faction entities (Baker's Guild, Stoneworkers' Union), assigning a Citizen to both, querying the Citizen's faction list, and verifying both appear.

**Acceptance Scenarios**:

1. **Given** a Faction entity "Baker's Guild" with type `occupational`, **When** queried, **Then** it has a name, type, leader reference, member list, and faction-standing map.
2. **Given** a Citizen entity, **When** assigned to both "Baker's Guild" and "Stoneworkers' Union", **Then** querying the Citizen's `factions` component returns both faction IDs.
3. **Given** an entity's `factions` component, **When** queried via the entity access system (feature 002) for `getEntitiesByProperty('Citizen.factions', { contains: factionId })`, **Then** only entities that are members of that faction are returned.
4. **Given** the player's government Faction entity, **When** queried, **Then** it is indistinguishable in structure from any other faction entity (same component schema).
5. **Given** a Faction entity is serialized and deserialized, **Then** all components (standing map, leader reference, member list) are fully preserved.

---

### User Story 2 - Faction Leaders (Priority: P1)

Every Faction entity has a designated **leader**: a reference to a specific entity within the game world (e.g., the Guild Master, the High Priest, the Head of Government). The leader is not just a metadata label — they are the physical destination for all diplomatic interactions. A Diplomatic Envoy carrying a message to a faction must physically travel to wherever the leader currently is and deliver the message directly to them. If the leader is absent, incapacitated, or dead, the faction is without a leader and cannot receive diplomatic dispatches until a new leader is designated.

**Why this priority**: The leader-as-destination requirement shapes the entire dispatch system. It grounds diplomacy in world space and means leadership succession has real consequences.

**Independent Test**: Can be fully tested headlessly by: creating a Faction with a designated leader entity, dispatching a Diplomatic Envoy, verifying the Envoy pathfinds to the leader's current position (not a fixed territory), and verifying delivery completes when the Envoy reaches the leader.

**Acceptance Scenarios**:

1. **Given** a Faction with leader entity "Guild Master Aldric" currently in the Bakery zone, **When** a Diplomatic Envoy is dispatched to that faction, **Then** the Envoy pathfinds to Aldric's current tile, not to a fixed faction headquarters tile.
2. **Given** the leader moves between rooms during transit, **When** the Envoy arrives at the leader's last known position, **Then** the Envoy re-queries the leader's current position and continues traveling.
3. **Given** a Faction whose leader entity has been destroyed, **When** a Diplomatic Envoy attempts delivery, **Then** delivery fails; `diplomacy.dispatch.failed` is emitted with reason `leader-unavailable`; the Envoy returns to the sender.
4. **Given** a new leader is assigned to the Faction, **When** a pending Envoy is still in transit, **Then** the Envoy updates its destination to the new leader's position and continues.
5. **Given** the player's faction, **When** queried for its leader, **Then** a specific entity (the player's representative/ruler) is returned as the leader reference.

---

### User Story 3 - Faction Standing (Priority: P1)

Each Faction maintains a **standing** score with every other faction it has had diplomatic contact with. Standing is an integer in the range [-100, 100]: -100 = absolute hostility, 0 = neutral/unknown, 100 = full alliance. Standing shifts based on diplomatic acts (Q3 clarification: trade agreements, gifts, declarations, overtures) and passive events (completed trades, broken agreements, attacks). Standing is stored on the Faction entity as a component: a map of `{ factionId → standingValue }`. Factions with no recorded standing default to 0 (neutral).

**Why this priority**: Standing is the measurable output of all diplomacy. Trade gating, affinity biases, and labour access all read from it. Without standing, consequences have nothing to read.

**Independent Test**: Can be fully tested headlessly by: creating two factions, sending a gift from one to the other, verifying the recipient faction's standing with the sender increased by the configured gift value.

**Acceptance Scenarios**:

1. **Given** two factions with no prior contact, **When** either faction queries standing with the other, **Then** the result is 0 (neutral default).
2. **Given** Faction A sends a gift of 100 currency to Faction B, **When** the gift is delivered, **Then** Faction B's standing with Faction A increases by a configured amount (e.g., +10), clamped to [-100, 100].
3. **Given** Faction A declares war on Faction B, **When** the declaration is delivered, **Then** Faction B's standing with Faction A drops to a configured hostile threshold (e.g., -50) or lower, whichever is worse.
4. **Given** a standing value of 100, **When** a positive event attempts to increase it, **Then** it stays at 100 (hard cap).
5. **Given** two factions' standing with each other is not necessarily symmetric, **When** queried independently, **Then** Faction A's standing with B may differ from B's standing with A (each faction tracks its own view).

---

### User Story 4 - Diplomatic Envoy Dispatch (Priority: P1)

When the player (or an NPC faction AI) initiates a diplomatic act, a **Diplomatic Envoy** entity is spawned and dispatched from the sender's seat of government. The Envoy carries a **DiplomaticMessage** payload and travels via pathfinding to the target faction's current leader. On reaching the leader, the Envoy delivers the message, triggering the appropriate standing change and response. The Envoy then returns to base. Diplomatic Envoys are distinct from Town Criers (spec 017) and use their own entity prototype.

**Why this priority**: Envoy dispatch is the physical implementation of all diplomacy. It connects the abstract standing system to the real game world — delivery takes time, can fail, and requires the leader to be reachable.

**Independent Test**: Can be fully tested headlessly by: issuing a gift diplomatic act, verifying an Envoy entity is spawned at the government seat, pathfinds toward the target leader, delivers on arrival, and returns.

**Acceptance Scenarios**:

1. **Given** the player issues a gift act to Faction B, **When** committed, **Then** a DiplomaticEnvoy entity is spawned at the player's government seat (the Throne Room zone, spec 019) and begins traveling toward Faction B's leader.
2. **Given** an Envoy in transit, **When** queried, **Then** the Envoy's payload (act type, sender faction, target faction, contents), destination entity, and status (traveling/delivered/returning) are inspectable.
3. **Given** an Envoy reaches the target leader, **When** delivery occurs, **Then** the DiplomaticMessage is processed: standing updates are applied and a `diplomacy.message.delivered` event is emitted.
4. **Given** multiple diplomatic acts issued to the same faction before the first Envoy returns, **When** evaluated, **Then** each act generates its own Envoy (one payload per Envoy); Envoys do not batch like Town Criers.
5. **Given** an Envoy cannot reach the target leader (pathfinding blocked), **When** the Envoy is stuck for a configurable timeout, **Then** `diplomacy.dispatch.failed` is emitted with reason `unreachable`; the Envoy returns and the act is not applied.

---

### User Story 5 - Diplomatic Acts (Priority: P1)

The player can initiate four types of diplomatic acts, each carried by a Diplomatic Envoy:

1. **Gift** — transfer currency or goods from the treasury (spec 019) to the target faction leader's inventory. Improves standing.
2. **Trade Agreement** — propose a standing trade relationship. If accepted by the faction AI, both factions gain a `tradeAgreement` flag enabling preferential trade terms and allowing their members to trade freely (spec 019).
3. **Declaration** — declare war, peace, or neutrality. Applied unilaterally; the target faction's standing shifts accordingly on delivery.
4. **Overture** — a general diplomatic overture (friendly gesture, request for meeting). The faction AI evaluates it based on current standing and may respond with a counter-overture or ignore it.

**Why this priority**: These are the player-facing diplomatic verbs. Without them there is nothing to do with the faction and standing systems.

**Independent Test**: Can be fully tested headlessly by: issuing one of each act type, verifying the correct standing change and event for each.

**Acceptance Scenarios**:

1. **Given** the player issues a Gift of 500 currency to Faction B, **When** delivered, **Then** 500 currency is removed from the Throne Room treasury, placed in the faction leader's inventory, and Faction B's standing with the player's faction increases.
2. **Given** the player proposes a Trade Agreement to Faction B (standing ≥ 20), **When** Faction B's AI evaluates it, **Then** if current standing is above the acceptance threshold, both factions gain `tradeAgreement: true` in their standing map entry; members can now trade freely.
3. **Given** the player declares War on Faction B, **When** the Declaration is delivered, **Then** Faction B's standing with the player drops to ≤ -50; the faction AI sets a hostile disposition toward the player's colony.
4. **Given** a Trade Agreement is active and the player later declares War, **When** the War declaration is delivered, **Then** the Trade Agreement is automatically cancelled (`tradeAgreement: false`); trade between members becomes blocked (spec 019).
5. **Given** the player sends an Overture to Faction B (current standing: 0), **When** delivered, **Then** the faction AI responds based on standing and personality — neutral factions may respond with a counter-overture; hostile factions ignore it.

---

### User Story 6 - Standing Consequences (Priority: P1)

Faction standing has three mechanical consequences, applied wherever the affected systems run (specs 019, 013, 017):

1. **Trade access** (spec 019): entities whose faction has hostile standing (< -30 by default) with the target entity's faction refuse TradeOffers. Entities from factions with a Trade Agreement get a preferential `priceMultiplier` discount.
2. **Affinity baseline** (spec 013): when two entities interact, their starting affinity includes an offset equal to the standing between their respective factions (averaged across all shared faction pairs). A stranger from a friendly faction starts at a warmer baseline.
3. **Labour access** (spec 017): entities from hostile factions will not accept jobs posted by the player's faction (and vice versa). Neutral or better standing allows cross-faction job acceptance.

**Why this priority**: Without consequences, standing is cosmetic. These three effects make diplomacy strategically meaningful.

**Independent Test**: Can be fully tested headlessly by: setting two factions to hostile (-60), verifying a trade offer between their members is rejected with `faction-hostile`, and verifying the affinity baseline between two new members starts below 0.

**Acceptance Scenarios**:

1. **Given** Faction A and Faction B have standing -60, **When** a member of A makes a TradeOffer to a member of B, **Then** the offer is rejected with `trade.offer.rejected` reason `faction-hostile`.
2. **Given** two factions have standing +50, **When** a member of each meets for the first time, **Then** their starting individual affinity is offset positively (warmer first impression than two strangers from neutral factions).
3. **Given** Faction A and the player's faction have standing -40, **When** the player posts a job, **Then** members of Faction A do not claim it; they skip it in job selection.
4. **Given** a Trade Agreement exists (standing ≥ 20 + agreement flag), **When** a member of each faction evaluates a trade, **Then** the seller's effective `priceMultiplier` is reduced by a configured discount (e.g., 0.9×) making the trade more favorable.
5. **Given** standing crosses the hostile threshold after previously being neutral, **When** an active trade is mid-negotiation between faction members, **Then** the pending TradeOffer is cancelled with reason `faction-hostile`.

---

### User Story 7 - NPC Faction Diplomacy (Priority: P2)

NPC factions (non-player factions) can also initiate diplomatic acts toward the player's faction and toward each other. The NPC faction AI evaluates its current standing, needs (e.g., resource scarcity triggers trade overtures), and disposition traits (aggressive factions declare war more readily; mercantile factions prioritise trade agreements) to decide when and what to send. Incoming Envoys from NPC factions arrive at the player's faction leader; the player can choose to accept, counter, or ignore.

**Why this priority**: Without NPC-initiated diplomacy, the faction system is one-sided. P2 because player-initiated diplomacy works as an MVP; NPC diplomacy adds the emergent reactive layer.

**Independent Test**: Can be fully tested headlessly by: creating an NPC faction with a resource deficit, running AI evaluation, and verifying a Trade Agreement overture Envoy is dispatched toward the player's leader.

**Acceptance Scenarios**:

1. **Given** an NPC faction with a configured `mercantile` disposition, **When** that faction's standing with the player is neutral and it has a resource it wants to trade, **Then** the faction AI initiates a Trade Agreement overture toward the player's leader.
2. **Given** an incoming Envoy from an NPC faction arriving at the player's leader, **When** the player's AI/player evaluates the proposal, **Then** the player can accept (apply consequences), send a counter-act, or reject (small standing penalty for the refusing faction).
3. **Given** an NPC faction with `aggressive` disposition and standing ≤ -20, **When** the faction AI evaluates, **Then** there is a configurable probability per tick of issuing a War Declaration toward the player.
4. **Given** two NPC factions have a long-standing trade agreement and one attacks the other's member, **When** the attacked faction AI evaluates, **Then** it may issue a War Declaration, cancelling the agreement.
5. **Given** an NPC faction has no leader (leader destroyed, succession not yet resolved), **When** it attempts to initiate diplomacy, **Then** no Envoy is dispatched until a new leader is designated.

---

### Edge Cases

- What happens if a faction leader entity is mid-travel when an Envoy arrives in the area? → The Envoy tracks the leader's position in real time and intercepts them; delivery does not require the leader to be stationary.
- What happens if the sender faction's leader is destroyed after dispatch but before delivery? → The Envoy continues and delivers; the sending faction's standing update still applies on delivery.
- What happens if two factions simultaneously send hostile declarations to each other? → Both are delivered independently; standing drops on both sides; no "mutual war" special case needed.
- What happens if the player's treasury cannot cover a promised Gift payment? → The diplomatic act is blocked at initiation time; no Envoy is dispatched until funds are available.
- What happens if a faction is destroyed (all members gone, entity removed)? → All standing records pointing to that faction ID become stale; they are treated as neutral (0) on next read. Pending Envoys targeting that faction are recalled.
- What happens if two entities belong to factions with conflicting standings (one faction friendly, another hostile with the same counterpart)? → The affinity baseline offset is the average across all relevant faction pair standings for those two entities. Conflicting signals average out.
- What happens if a Diplomatic Envoy is attacked or destroyed en route? → `diplomacy.dispatch.failed` is emitted with reason `envoy-destroyed`; the act is not applied; the sender may re-dispatch.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST support a Faction entity type in the entity prototype registry (feature 003). Each Faction entity MUST have components for: `name`, `factionType` (string, open set), `leaderId` (entity ID reference), `memberIds` (list of entity IDs), `standing` (map of `factionId → integer [-100, 100]`), and `disposition` (for NPC AI: `mercantile`, `aggressive`, `isolationist`, etc. — open set).
- **FR-002**: Individual entities MUST have a `factions` component: a list of faction entity IDs. An entity may belong to any number of factions. The player's government entity MUST be a faction.
- **FR-003**: Each Faction MUST have exactly one designated leader entity at any time. The leader reference is an entity ID stored in the Faction's `leaderId` field. A Faction with no living leader (`leaderId` points to a destroyed or missing entity) is considered **leaderless** and cannot receive diplomatic dispatches until a new leader is assigned.
- **FR-004**: System MUST support a **DiplomaticEnvoy** entity type (distinct from TownCrier, spec 017). A DiplomaticEnvoy entity carries a DiplomaticMessage payload and pathfinds to the target faction's current leader entity. The Envoy's destination updates dynamically if the leader moves.
- **FR-005**: A DiplomaticMessage MUST declare: sender faction ID, target faction ID, act type (`gift` / `trade-agreement` / `declaration` / `overture`), payload (items/currency for gifts, sub-type for declarations, terms for trade agreements), and creation tick.
- **FR-006**: On Envoy delivery (Envoy reaches leader entity), standing changes MUST be applied immediately to both faction standing maps (sender and receiver may update independently). `diplomacy.message.delivered` MUST be emitted.
- **FR-007**: Standing values MUST be clamped to [-100, 100] at all times. Default standing between two factions with no prior contact is 0.
- **FR-008**: Standing consequences MUST be enforced in the systems that read them:
  - Trade (spec 019): entities from factions with standing < -30 (configurable) refuse trade. Trade Agreements grant a configurable `priceMultiplier` discount.
  - Affinity baseline (spec 013): entity-to-entity first-meeting affinity offset = average standing across all shared faction pairs, mapped to a configurable affinity bias range.
  - Labour (spec 017): entities from factions with standing < -30 do not accept jobs from the hostile faction.
- **FR-009**: System MUST support four diplomatic act types: Gift (transfers items/currency from sender treasury to leader inventory), Trade Agreement (sets `tradeAgreement: true` on both factions' standing entries if accepted), Declaration (sets standing to a configured value; sub-types: war/peace/neutrality), Overture (triggers faction AI evaluation; may result in a counter-dispatch).
- **FR-010**: Gift acts MUST deduct the gifted items/currency from the sending faction's treasury (Throne Room containers for the player faction) before dispatching the Envoy. If insufficient funds, the act is blocked.
- **FR-011**: System MUST emit events: `diplomacy.act.initiated`, `diplomacy.dispatch.started`, `diplomacy.message.delivered`, `diplomacy.dispatch.failed` (with reason: `leader-unavailable`, `unreachable`, `envoy-destroyed`), `diplomacy.standing.changed`, `diplomacy.agreement.formed`, `diplomacy.agreement.cancelled`.
- **FR-012**: NPC faction AI MUST evaluate diplomatic opportunities each tick based on disposition, current standing, and resource/need state. Evaluation results in 0 or 1 diplomatic acts per tick per faction (rate-limited by a configurable cooldown).
- **FR-013**: Incoming Envoys from NPC factions arrive at the player's faction leader entity. The player (or player faction AI) may accept, counter-dispatch, or reject. Rejection applies a configurable small standing penalty.
- **FR-014**: All faction state (standing maps, leader references, member lists, pending Envoy state) MUST serialize to GameState (feature 006) and resume identically on load.
- **FR-015**: Entity queries (feature 002) MUST support multi-value membership queries: find all entities that are a member of a given faction ID via `factions` component list containment.

### Key Entities

- **Faction**: An ECS entity with components: name, factionType, leaderId, memberIds, standing map, disposition. The player's government is one. Open-ended set of types (political, occupational, religious, etc.).
- **DiplomaticEnvoy**: An entity dispatched from the sender's government seat. Carries a DiplomaticMessage payload. Pathfinds to the target faction's current leader entity. Returns to base after delivery or failure.
- **DiplomaticMessage**: A data payload on a DiplomaticEnvoy. Contains act type, sender/target faction IDs, payload data, and creation tick. Not a persistent entity — consumed on delivery.
- **FactionStanding**: A component sub-record within the Faction entity's standing map: `{ factionId → { value: integer, tradeAgreement: boolean } }`.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A gift diplomatic act flows end-to-end correctly: treasury deducted → Envoy spawned → Envoy pathfinds to current leader position → standing updated → event emitted — verifiable in a headless test.
- **SC-002**: Standing consequences are enforced in 100% of test cases: hostile factions (< -30) cannot trade, members skip each other's jobs, and individual affinity is biased accordingly.
- **SC-003**: If a faction leader moves during Envoy transit, the Envoy correctly updates its destination and delivers to the leader's new location.
- **SC-004**: A leaderless faction correctly blocks all incoming diplomatic dispatches until a leader is reassigned.
- **SC-005**: Multi-faction membership queries return all entities belonging to a specified faction, and no entities that do not, in 100% of test cases.
- **SC-006**: All diplomacy and faction state is fully preserved through save/load with no standing loss, missing leaders, or orphaned Envoy entities.
- **SC-007**: NPC faction AI initiates at least one appropriate diplomatic act (e.g., trade overture when resource-scarce and standing is neutral) in a standard simulation run without player involvement.

## Assumptions

- **Faction type is an open set**: `political`, `occupational`, `religious` are examples. Game data defines the available types; no hard-coded type enum.
- **Standing is asymmetric by design**: Each faction tracks its own view of standing with others. Two factions can have different feelings about each other.
- **Leader is an entity in the world**: The leader must be a real, living entity with a position. Abstract or off-map leaders are not supported. If the player's faction leader is never defined, the player's faction cannot receive diplomacy.
- **Envoys do not batch**: Unlike Town Criers (spec 017), each diplomatic act generates its own Envoy. This is intentional — diplomatic acts are weighty, individual gestures, not bulk updates.
- **Standing thresholds are game-balance constants**: The values -30 (hostile gate), +20 (trade agreement threshold), etc. are defined in game configuration data, not hardcoded. Designers tune them without code changes.
- **Faction AI disposition is data-driven**: Disposition types and their probability weights for act selection are authored in the entity prototype data for each faction, not computed dynamically.
- **Trade Agreement requires mutual consent**: The sending faction proposes; the receiving faction AI evaluates and must accept. A unilateral declaration of a "trade agreement" is not valid.
- **No territory ownership in this spec**: Faction territories and map control are out of scope. Diplomacy is purely about standing, dispatching Envoys to leaders, and the three mechanical consequences. Territory may be a future feature.
