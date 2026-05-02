# Feature Specification: Entity AI Behavior Architecture

**Feature Branch**: `013-entity-ai-behavior`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "I want the entities like persons and animals to have interesting behaviour, influenced by lots of things such as their needs, mood, relationship to other entities, work occupation, wealth/poverty. Help me specify what a good AI architecture is to drive this."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Entity Needs Drive Behavior (Priority: P1)

Entities experience needs (hunger, rest, safety) that influence their actions and priorities. When needs reach critical levels, entities prioritize satisfying them based on their occupation personality. Guards prioritize safety over hunger; Merchants prioritize relationships (social trust) over rest; Farmers prioritize hunger over safety. This creates realistic, role-appropriate behavior.

**Why this priority**: Needs are the foundation of believable entity behavior. Personality-based prioritization creates occupational differentiation without hard-coding all behavior variants.

**Independent Test**: Can be tested by: (1) create Guard entity with critical safety need and critical hunger need, (2) verify Guard prioritizes finding safety over finding food, (3) create Merchant with same needs, (4) verify Merchant prioritizes social trust, then hunger.

**Acceptance Scenarios**:

1. **Given** Guard entity with hunger at 0% and safety at 0% (both critical), **When** entity chooses action, **Then** entity prioritizes finding safety/guards over finding food
2. **Given** Merchant entity with same critical needs, **When** entity chooses action, **Then** entity prioritizes improving relationship/social standing over eating (risk-taking for social gain)
3. **Given** Farmer entity with same critical needs, **When** entity chooses action, **Then** entity prioritizes finding food (harvest first)
4. **Given** entity with non-critical needs (all > 30%), **When** observing entity behavior, **Then** entity operates at full capability without redirecting to need-satisfaction
5. **Given** entity's primary need (by occupation) reaches critical level, **When** choosing action, **Then** entity immediately redirects to satisfying that need

---

### User Story 2 - Mood Affects Decision-Making (Priority: P2)

Entity mood fluctuates based on need satisfaction, successful/failed actions, and relationships. Mood directly influences risk tolerance for actions. At mood 10% (very sad), risky actions have 20% success probability. At mood 90% (very happy), the same actions have 80% success probability. This creates consistent, measurable behavioral variation.

**Why this priority**: Mood creates personality variation and emotional realism. Quantified effect ensures consistent, testable behavior. Makes entities feel alive and reactive to circumstances. Essential for emergent storytelling.

**Independent Test**: Can be tested by: (1) entity at mood 10% refuses risky trade (low success probability feels unsafe), (2) same entity at mood 90% accepts same trade (high success probability feels acceptable), (3) verify success rates are consistent with mood level.

**Acceptance Scenarios**:

1. **Given** entity at mood 90% offered risky trade (80% success probability), **When** entity evaluates action, **Then** entity accepts trade as safe enough
2. **Given** same entity at mood 10%, **When** same trade offered (becomes 20% success probability), **Then** entity refuses trade as too risky
3. **Given** entity successfully completes goal, **When** mood updates, **Then** mood increases toward 90%, shifting risk tolerance upward
4. **Given** entity fails repeated attempts, **When** mood decreases toward 10%, **Then** entity becomes risk-averse and seeks lower-risk activities only
5. **Given** entity at mood 50%, **When** evaluating risky action, **Then** success probability is 50% (linear interpolation 10→80 range)

---

### User Story 3 - Relationships Influence Behavior (Priority: P2)

Entities maintain relationships with other entities, tracking affinity (trust), specific interactions (conflicts, gifts), time decay (recent interactions weighted higher), and family/faction alignment. Strong relationships cause entities to cooperate and help in emergencies. Poor relationships cause avoidance or exploitation. Recent negative events (contract breaking, theft) create lasting damage; recent positive events (gifts) build trust. Distant history decays in weight over time.

**Why this priority**: Relationships create emergent social dynamics and complex interactions. Specific event tracking enables realistic memory and grudges. Time decay prevents permanent grudges and allows for forgiveness/reconciliation. Essential for creating believable social simulation.

**Independent Test**: Can be tested by: (1) entity A steals from entity B (tracked as conflict), (2) entities encounter again, (3) entity B avoids or demands compensation, (4) verify conflict event persists but gradually loses influence over 50+ ticks, (5) later positive interaction (gift) can rebuild trust.

**Acceptance Scenarios**:

1. **Given** entities with high affinity (80%+) and recent positive interaction history, **When** one entity needs help, **Then** other entity prioritizes assisting
2. **Given** entity A broke contract with entity B (recent negative event, still high weight), **When** entities encounter again, **Then** entity B avoids or demands compensation
3. **Given** same negative history 100+ ticks later (time-decayed), **When** entity A offers gift, **Then** entity B reconsiders relationship; gift can offset old damage
4. **Given** entity A and B have same family/faction membership, **When** one is in danger, **Then** other prioritizes rescue even at personal risk (faction bond)
5. **Given** entity with very poor relationships to many entities (outcast, conflict history), **When** entity approaches group, **Then** group rejects or avoids interaction

---

### User Story 4 - Occupation Shapes Behavior (Priority: P2)

Entities have occupations (Farmer, Merchant, Guard, Crafter) that determine what activities they pursue, what areas they frequent, and what goals they pursue. Occupation affects skill levels and success rates.

**Why this priority**: Occupations create role diversity and specialization. Without this, all entities behave identically. Enables economic simulation and specialization.

**Independent Test**: Can be tested by: (1) Farmer entity prioritizes farming/harvest areas, (2) Merchant entity prioritizes trade hubs, (3) Guard entity prioritizes patrol/protection.

**Acceptance Scenarios**:

1. **Given** entity is Farmer, **When** season is harvest, **Then** entity prioritizes harvesting crops in agricultural area
2. **Given** entity is Merchant, **When** entity has goods, **Then** entity seeks trading locations and other merchants
3. **Given** entity is Guard, **When** crime/danger occurs, **Then** entity investigates and responds (vs ignoring like other occupations)
4. **Given** entity is Crafter, **When** entity has materials, **Then** entity produces items in workshop area
5. **Given** entity with occupation skill level, **When** occupation-relevant task is attempted, **Then** success rate reflects skill level

---

### User Story 5 - Wealth/Poverty Affects Access & Behavior (Priority: P2)

Entities with wealth have more choices and opportunities. Poor entities are constrained to low-cost activities and survival. Extreme poverty can cause crime/begging; excess wealth causes luxury-seeking or philanthropy.

**Why this priority**: Economic inequality creates emergent social tension and interesting policy interactions. Without this, economic simulation is flat. Critical for government impact.

**Independent Test**: Can be tested by: (1) wealthy entity buys expensive items, (2) poor entity cannot afford same items, (3) observe behavioral differences (wealthy takes risks, poor survives).

**Acceptance Scenarios**:

1. **Given** entity is wealthy (treasure > 500 coins), **When** offered luxury item, **Then** entity considers purchase feasible
2. **Given** entity is poor (treasure < 50 coins), **When** faced with survival choice vs principle, **Then** entity chooses survival
3. **Given** entity extremely poor and starving, **When** no legal income available, **Then** entity may steal, beg, or accept risky jobs
4. **Given** entity wealthy with surplus, **When** poor entity needs help, **Then** wealthy entity may donate or hire (based on affinity)
5. **Given** wealth changes rapidly (got rich or got robbed), **When** behavior is updated, **Then** entity adjusts expectations and goals accordingly

---

### User Story 6 - AI Architecture is Modular & Extensible (Priority: P1)

The AI system uses a **Hybrid Architecture**: Behavior Trees provide structure and sequence control, while Utility AI provides decision weighting and priority scoring. New behaviors can be added via simple script DSL (Domain-Specific Language) or plugin modules without touching core code.

**Why this priority**: System must be maintainable and game designers should be able to add content easily. Hybrid approach balances structure (trees) with flexibility (utility scoring). DSL + plugins enable rapid iteration.

**Independent Test**: Can be tested by: (1) write new behavior in DSL file, (2) load as plugin, (3) verify entity executes new behavior immediately without restarting.

**Acceptance Scenarios**:

1. **Given** behavior definition in DSL file with sequence: [Check Hunger] → [Find Food] → [Eat], **When** plugin loads, **Then** entity can execute this behavior tree immediately
2. **Given** multiple occupied behaviors (Farmer doing "Plant Crop" + "Tend Farm"), **When** conflict occurs, **Then** utility scoring determines which takes priority
3. **Given** designer writes new conditional node `<If starving Then Beg Else Work>`, **When** behavior tree loads, **Then** entity uses conditional correctly
4. **Given** new utility factor added (e.g., "danger level"), **When** existing behaviors re-evaluated, **Then** danger level influences all threat-related decisions
5. **Given** behavior plugin defining new behavior tree "Flee from Predator", **When** loaded, **Then** all entities can immediately use this behavior

---

### Edge Cases

- What happens when entity has conflicting needs (hungry + unsafe + tired)?
- How does entity behave when all options are bad (survival scenario)?
- What happens when entity mood is extreme (100% or 0%)?
- How does AI respond to sudden relationship loss (friend dies)?
- What happens when entity wealth changes dramatically?
- How do entities handle impossible goals (requested to steal from guard)?
- What happens when occupation skill is zero?
- What happens when behavior tree is malformed or references non-existent actions?
- How does system handle circular dependencies (Behavior A requires Behavior B, which requires A)?
- What happens when multiple behavior plugins define the same behavior name?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST implement need system with at least 4 needs (hunger, rest, safety, social)
- **FR-002**: Needs MUST decay over time and be satisfied by specific in-world actions: Hunger by consuming "Food" items, Rest by sleeping in "Bed" locations, Safety by proximity to Guards/safe zones, Social by conversation actions with other entities
- **FR-003**: Entities MUST prioritize critical needs based on occupation personality: Guards prioritize Safety > Rest > Social > Hunger; Merchants prioritize Social/Trust > Hunger > Rest > Safety; Farmers prioritize Hunger > Rest > Safety > Social. Critical = below 20%.
- **FR-004**: System MUST implement mood as 0-100 value influenced by need satisfaction, successes, relationships
- **FR-005**: Mood MUST affect decision-making: at mood 10%, risky actions have 20% success probability; at mood 90%, same actions have 80% success probability (60% difference range)
- **FR-006**: System MUST track relationships between entities with: affinity (trust), history (conflicts, gifts, time since interaction), and faction/family alignment
- **FR-007**: Relationship changes MUST persist and affect future entity behavior; relationship history MUST track: contract-breaking events, gift-giving, family membership, and time decay (recent interactions weighted higher)
- **FR-008**: Entities MUST have occupation that determines available goals and skill bonuses
- **FR-009**: Entity wealth MUST constrain access to activities (can't afford expensive items)
- **FR-010**: Wealth MUST influence entity decision-making (poor entities prioritize survival, rich entities prioritize luxury)
- **FR-011**: System MUST implement decision-making architecture that combines needs, mood, relationships, occupation, wealth into unified action selection
- **FR-012**: Decision architecture MUST use Hybrid Model: Behavior Trees provide sequential/conditional structure, Utility AI provides priority scoring
- **FR-013**: Behavior Trees MUST support basic node types: Sequence (A→B→C), Selector (If X then A else B), and Action (leaf nodes that execute behavior)
- **FR-014**: Utility AI MUST weight competing behaviors and select highest-scoring action when multiple goals exist simultaneously
- **FR-015**: System MUST support simple DSL for defining behavior trees (code-based, readable by non-programmers)
- **FR-016**: System MUST support loading behavior trees as plugin modules (new behaviors loadable at runtime). Plugin names and behavior names MUST be globally unique; duplicate names cause system error and load failure.
- **FR-017**: New behaviors/factors can be added via DSL or plugins without modifying core engine code
- **FR-018**: Entities MUST maintain minimal AI state (current behavior, active needs, recent mood, recent interactions) in memory
- **FR-019**: System MUST evaluate all pending behaviors and select next action in < 5ms per entity
- **FR-020**: Multiple entities (50+) MUST be able to execute complex AI simultaneously without performance degradation
- **FR-021**: Entities MUST be able to change behavior trees or "strategies" at runtime
- **FR-022**: Behavior selection MUST be deterministic: same state always produces same action (for testing/replay)

### Key Entities

- **NeedState**: Tracks individual needs (hunger, rest, safety, social) for each entity
- **MoodState**: Tracks entity mood (0-100) and recent mood influences
- **Relationship**: Represents connection between two entities (affinity, trust, history, faction)
- **OccupationData**: Defines occupation type, available goals, skill bonuses, preferred locations
- **DecisionContext**: Aggregates current entity state (needs, mood, relationships, wealth) for decision-making
- **BehaviorTree**: Hybrid tree structure with node types: Sequence (A→B→C), Selector (If/Else), Action (leaf behavior execution)
- **BehaviorNode**: Individual node in tree; returns success/failure/running status
- **UtilityScore**: Weights competing behaviors by need urgency, mood fit, relationship alignment, occupation alignment
- **BehaviorDSL**: Simple text format for designers to define behavior trees without code
- **BehaviorPlugin**: Loadable module containing one or more behavior tree definitions
- **DecisionFactor**: Plugin interface for weighting decisions (needs, traits, conditions, social pressures)

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Entities with similar needs but different moods make measurably different decisions (testable via scenario replay)
- **SC-002**: Entity behavior changes perceptibly when relationships change (affinity drops by 30% or more)
- **SC-003**: Wealthy entities pursue different goals than poor entities in 80%+ of scenarios
- **SC-004**: Entities with occupation actively pursue occupation-relevant activities at least 60% of available time
- **SC-005**: Entities in critical need states (any need < 20%) redirect to need-satisfaction activity within 1-3 game ticks
- **SC-006**: Relationship changes persist across game saves and remain consistent after load
- **SC-007**: System can simulate 50+ entities with complex AI without performance degradation (all AI evaluations < 50ms per tick total)
- **SC-008**: New behavior can be added via DSL/plugin and executed by entities in < 5 minutes (including testing)
- **SC-009**: Each entity AI state consumes < 1KB memory footprint
- **SC-010**: Behavior tree evaluation (selecting next action) completes in < 5ms per entity
- **SC-011**: New custom utility factor can be added without modifying behavior tree logic
- **SC-012**: Behavior trees of depth 5+ load successfully; trees deeper than 8 levels trigger warning
- **SC-013**: Same entity state produces identical action selection across multiple runs (determinism verified)

## Assumptions

- **Hybrid Architecture**: System combines Behavior Trees (for sequential/conditional structure) with Utility AI (for priority scoring). Trees are not deeply nested; depth limit is 4-5 levels to remain manageable
- **Simple Composition**: Behaviors are composed via simple sequences and conditionals; not complex parallel graphs or dynamic rerouting during execution
- **DSL-Based Extension**: Designers write behaviors in a simple DSL (readable, minimal syntax); DSL is transpiled to internal representation
- **Plugin Loading**: Behavior plugins are loaded at startup or runtime; plugins contain tree definitions and custom action implementations
- **Deterministic Decisions**: Given same entity state, AI always produces same decision; enables replay and testing
- **Entity State Minimization**: Entities track only essential AI state (current behavior, active needs, mood, recent interactions); no full world state
- **Need Decay**: All needs decay linearly over time; no complex decay curves
- **Occupation Persistence**: Entities keep occupation for extended period unless explicitly changed
- **Relationship Asymmetry**: If entity A changes affinity with B, that change is specific to A's view of B (not automatically symmetrical)
- **Mood Recovery**: Mood naturally recovers toward neutral over time if not influenced by events
- **Limited Planning**: Entities plan 3-5 steps ahead via behavior tree evaluation; not full world optimization
- **Action Commitment**: Actions take discrete game ticks; entity commits to action once started
- **Plugin Performance**: Plugins must not add > 2ms evaluation overhead per entity per tick
- **Memory Efficiency**: Each entity AI state should consume < 1KB of memory (needs, mood, relationships, active behaviors)

## Clarifications

### Session 2026-05-02

- **Q: When entity has multiple critical needs, what priority order?** → A: Personality-based (occupation determines priority). Guard prioritizes Safety > Rest > Social > Hunger. Merchant prioritizes Social/Trust > Hunger > Rest > Safety. Farmer prioritizes Hunger > Rest > Safety > Social.
- **Q: How much should mood affect risk tolerance?** → A: Moderate swing (60% difference). At mood 10%, risky action has 20% success rate. At mood 90%, same action has 80% success rate.
- **Q: What events should relationship history track?** → A: Conflicts (breaking contracts, stealing), Gifts/charity, Time since last interaction (decay factor), Family/faction membership.
- **Q: How specific should need satisfaction be?** → A: Very specific. Hunger only satisfied by "Food" items in eating areas. Rest only satisfied in "Bed" locations. Safety satisfied by proximity to Guards/safe areas. Social satisfied through "conversation" or "socializing" actions with other entities.
- **Q: When plugins define same behavior name, what happens?** → A: Error and refuse to load. System requires unique behavior names across all loaded plugins; duplicate names are a deployment error.
