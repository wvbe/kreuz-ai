# Feature Specification: Skills & Traits

**Created**: 2026-05-03
**Input**: User description: "I want to specify skills as options 2 and 4 combined: skills are numeric ratings, and entities have personal traits or aptitudes too. There are no occupations aside from the fact that somebody who is baking a bread is at that time a baker. Somebody who bakes bread a lot will gain skills in and is more likely to then pick a new job that is also baking bread. In other words, there are no strict professions, but through skill growth, traits and self-selection some entities will naturally gravitate towards an occupation."

## User Scenarios & Testing

### User Story 1 - Skills as Numeric Ratings (Priority: P1)

Each entity has a set of **skills**, each rated as an integer from 0 to 100. Skills cover domains of activity: `baking`, `construction`, `smithing`, `farming`, `trading`, `hauling`, etc. The skill set is an open set — new skills are added by defining them in the skill registry. An entity begins with the starting skill values set by its prototype (spec 022; any skill the prototype does not set starts at 0), plus any trait-seeded starting value. Skills are stored on the entity, serialized with the game state, and never decrease through normal play.

**Why this priority**: Skills are the foundational data structure everything else depends on — growth, job selection weighting, and output quality all read from these values. Blocking for all other stories.

**Independent Test**: Can be fully tested headlessly by: creating an entity with `baking: 0`, setting it to 42, saving and loading the game state, and verifying the value is preserved at 42.

**Acceptance Scenarios**:

1. **Given** a newly created entity, **When** its skill profile is queried, **Then** all skills default to 0, except where the entity's prototype sets a starting value (spec 022) or a trait specifies an aptitude starting value.
2. **Given** an entity with `baking: 35`, **When** the game state is serialized and reloaded, **Then** the entity's `baking` skill is still 35.
3. **Given** a new skill `glassblowing` registered in the skill registry, **When** any entity is queried for that skill, **Then** the entity has `glassblowing: 0` without any migration step.
4. **Given** a skill value of 100, **When** a growth event attempts to increase it further, **Then** the skill stays at 100 (hard cap); no overflow occurs.
5. **Given** any skill value, **When** queried, **Then** it is always an integer in the range [0, 100].

---

### User Story 2 - Skill Growth Through Work (Priority: P1)

Whenever an entity completes a unit of work associated with a skill domain (finishes a baking recipe, completes a construction job, completes a trade), that skill increases by a small amount. Growth is faster at low skill levels and slows as the entity approaches 100 (diminishing returns). The amount of growth per completion is defined per skill in the skill registry and may be influenced by the entity's relevant trait (an aptitude trait increases growth rate for its associated skill).

**Why this priority**: Growth through use is the core mechanic. Without it, skills are static labels. This is what makes entities naturally specialise over time.

**Independent Test**: Can be fully tested headlessly by: setting an entity's `baking` skill to 10, completing 10 baking jobs, verifying the skill increased after each completion, and verifying the total growth is less than it would be starting from 0 (diminishing returns).

**Acceptance Scenarios**:

1. **Given** an entity with `baking: 10`, **When** the entity completes a baking recipe, **Then** `baking` increases by the configured growth amount for that level (e.g., 2 points at level 10).
2. **Given** an entity with `baking: 90`, **When** the entity completes the same baking recipe, **Then** `baking` increases by a smaller amount (e.g., 0.5 points, accumulated as a fixed-point value, due to diminishing returns).
3. **Given** an entity completes a construction job, **When** the job completion fires, **Then** the entity's `construction` skill increases; no other skill changes.
4. **Given** an entity with a trait that grants a `baking` aptitude, **When** the entity completes a baking recipe, **Then** the skill growth for `baking` is multiplied by the trait's aptitude multiplier.
5. **Given** an entity completing work in a skill already at 100, **When** the completion fires, **Then** no growth event is emitted; the skill remains at 100.

---

### User Story 3 - Traits as Innate Entity Modifiers (Priority: P1)

Each entity has 1–3 **traits** assigned at creation (procedurally generated or authored). Traits are data-defined entries in a trait registry (open set). A trait may: (a) provide an **aptitude** for one or more skills — increasing growth rate and/or starting value for those skills; (b) apply a **performance modifier** to actions in those skill domains — faster work, higher output quantity, better trade margins; (c) apply a **need or mood modifier** (integrates with feature 013). Traits are fixed at creation and do not change.

**Why this priority**: Traits give entities permanent individuality. Without them, all entities are functionally identical at the same skill level. They create the "character" that makes emergent storytelling possible.

**Independent Test**: Can be fully tested headlessly by: creating an entity with the "Gifted Baker" trait (`bakingAptitudeMultiplier: 1.5`), completing 5 baking jobs, and verifying the `baking` skill grew 50% more than an entity without the trait completing the same 5 jobs.

**Acceptance Scenarios**:

1. **Given** an entity with the trait `Gifted Baker` (aptitude: `baking × 1.5`), **When** the entity completes a baking recipe, **Then** `baking` skill grows 50% faster than the base growth rate.
2. **Given** an entity with the trait `Heavy-Handed` (performance modifier: `construction speed × 0.8`), **When** the entity completes a construction job, **Then** the job takes 25% longer than the base duration.
3. **Given** an entity with the trait `Greedy` (trade modifier: `minimumMarginRate + 0.05`), **When** the entity evaluates a trade offer, **Then** the effective margin threshold is 5 percentage points higher than the base.
4. **Given** a new trait `Tireless` defined in the trait registry, **When** an entity is created with it, **Then** the trait applies its declared effects without any code change.
5. **Given** an entity with traits assigned at creation, **When** the game is saved and loaded, **Then** the entity's traits are identical — traits are immutable once assigned.
6. **Given** an entity with 3 traits that all affect the same skill, **When** the skill grows, **Then** all three modifiers are applied in combination (multiplicative stacking or as defined per trait).

---

### User Story 4 - Skill-Weighted Job Selection (Priority: P1)

When an entity evaluates available jobs (feature 017), its skill levels influence which job it is more likely to claim — higher skill in the relevant domain increases the affinity score for that job type, making it rank higher in the job selection algorithm. An entity is not restricted to jobs matching its skills; it may take any eligible job. But over time, an entity that has accumulated baking skill will naturally prefer baking jobs, creating emergent specialisation without enforced professions.

**Why this priority**: This is the self-selection mechanic that makes "soft professions" emerge. Without it, skill growth is cosmetic — entities would still pick jobs randomly and the colony would feel chaotic.

**Independent Test**: Can be fully tested headlessly by: creating an entity with `baking: 80` and `construction: 10`, presenting it with one baking job and one construction job of equal stated priority, and verifying the entity selects the baking job in 90%+ of runs.

**Acceptance Scenarios**:

1. **Given** an entity with `baking: 80` and two available jobs (Bake Bread and Lay Wall), **When** the entity selects a job, **Then** the Bake Bread job scores higher and the entity picks it.
2. **Given** an entity with `baking: 5` (near-zero skill), **When** the same two jobs are available, **Then** the job selection affinity scores are nearly equal; job priority or distance may be the deciding factor.
3. **Given** all baking jobs are claimed by other entities, **When** a skilled baker evaluates the queue, **Then** the entity falls back to other available jobs rather than idling; the skill affinity does not prevent cross-domain work.
4. **Given** a job with an explicit player-set priority of "urgent", **When** an entity with mismatched skills evaluates it, **Then** the urgent priority overrides skill affinity; the entity takes the urgent job regardless of skill match (player priority ranks above familiarity in the job selection order, spec 017 FR-007).
5. **Given** an entity that has been baking for 100 in-game hours, **When** observed over the next 100 hours without player intervention, **Then** the entity self-selects baking jobs at a noticeably higher rate than construction or hauling jobs.

---

### User Story 5 - Skill Level Affects Work Outcomes (Priority: P2)

Higher skill in a domain produces better outcomes for work in that domain. The exact effect is defined per skill in the skill registry and may include: reduced work duration (faster completion), increased output quantity or quality, higher chance of bonus outputs, or reduced material consumption. At skill 0, the entity performs at baseline (recipe/job defaults). At skill 100, the entity achieves the maximum defined bonus. Bonuses scale continuously between 0 and 100.

**Why this priority**: Without outcome effects, skill growth is purely cosmetic. Outcome bonuses make specialisation strategically valuable — players have reason to cultivate experts rather than rotating generalists.

**Independent Test**: Can be fully tested headlessly by: completing the same baking recipe at skill 0 and at skill 100, verifying the skill-100 entity finishes in fewer ticks and/or produces more output, and verifying the result is within the bounds declared in the skill registry entry.

**Acceptance Scenarios**:

1. **Given** a baking recipe with base duration 24 ticks, **When** completed by an entity with `baking: 0`, **Then** the recipe takes 24 ticks.
2. **Given** the same recipe, **When** completed by an entity with `baking: 100` and skill registry declaring `maxSpeedBonus: 0.5`, **Then** the recipe takes 12 ticks (50% reduction).
3. **Given** a skill registry entry with `outputBonus: { maxExtra: 1 }` for `baking`, **When** an entity with `baking: 100` completes a recipe producing 4 Bread, **Then** the entity has a chance to produce up to 5 Bread (1 bonus unit).
4. **Given** skill outcomes defined purely in skill registry data, **When** a new outcome effect is added to the registry data, **Then** it takes effect after the next bootstrap without code changes (registries are immutable during a session).
5. **Given** an entity with a trait that modifies `baking` performance, **When** the outcome is calculated, **Then** both the skill-based bonus and the trait modifier are applied (combined effect, not overriding each other).

---

### User Story 6 - Skill Profile Visibility (Priority: P2)

The player can inspect any entity's skill profile: all skills with their current values, all traits with their descriptions, and a "dominant skill" summary indicating which domain the entity has most strongly developed. This information is available at any time and updates in real time as skills grow.

**Why this priority**: Without visibility, players cannot make informed assignment decisions. The entire emergent-specialisation design relies on the player being able to see who is good at what.

**Independent Test**: Can be fully tested headlessly by: querying an entity's skill profile, verifying all registered skills appear with their values, and verifying the dominant skill field matches the highest-valued skill.

**Acceptance Scenarios**:

1. **Given** an entity with `baking: 60`, `construction: 20`, `hauling: 5`, **When** the skill profile is queried, **Then** all three skills appear with their values and `dominantSkill` is `baking`.
2. **Given** an entity with traits `Gifted Baker` and `Heavy-Handed`, **When** the trait list is queried, **Then** both traits appear with their human-readable name and effect description.
3. **Given** a skill grows from 40 to 41 during a tick, **When** the skill profile is queried after that tick, **Then** the value is 41 (immediately up to date; no caching lag).
4. **Given** an entity with all skills at 0, **When** `dominantSkill` is queried, **Then** it returns null or "none" (no dominant skill yet).
5. **Given** two skills tied at the same value (both 50), **When** `dominantSkill` is queried, **Then** one is returned deterministically (PRNG tie-break or alphabetical fallback).

---

### Edge Cases

- What happens if a skill domain is removed from the skill registry after entities have values in it? → Registries are immutable after bootstrap, so this can only arise when loading a save or content that references a skill ID no longer registered. Such a dangling skill reference is a load-validation error (spec 022 FR-015); it is not silently preserved.
- What happens if an entity with `baking: 100` is assigned a construction job? → The entity performs the job normally at its `construction` skill level; skill 100 in baking provides no benefit to construction.
- What happens if two traits conflict (e.g., `Gifted Baker` and `Hopeless Baker`)? → Both modifiers are applied. The net result of conflicting traits is their combined mathematical effect. No special conflict resolution is needed.
- What happens if an entity's trait specifies a skill aptitude for a skill not yet in the registry? → This is a dangling reference and a load-validation error (spec 022 FR-015); the trait registry fails validation and the error is reported with all other validation errors.
- What happens if skill growth produces a fractional value (e.g., 0.5 points)? → Growth accumulates as a fixed-point integer (×1000); the full accumulated value is serialized, and the queried value is always the floor integer (`floor(value / 1000)`). The fractional part is preserved so rounding never suppresses slow growth.
- What happens if an entity is created with more than 3 traits? → For procedurally generated entities, 1–3 is the enforced range. Authored entities (named NPCs, special characters) may be assigned more than 3 traits; the system imposes no hard cap for authored entities.
- What happens if skill growth is triggered by a job that spans multiple ticks (e.g., a 100-tick baking job)? → Growth fires once on job completion, not per tick. The size of the growth event does not scale with job duration.

## Clarifications

### Session 2026-05-03

- Q: Is the 1–3 trait count a hard cap or a soft guideline? → A: Soft guideline. Procedurally generated entities receive 1–3 traits (enforced). Authored/named entities may have more; no hard system cap applies to them.

## Requirements

### Functional Requirements

- **FR-001**: System MUST define a **Skill Registry**: an open, data-driven set of skill definitions. Each entry declares: `skillId`, human-readable name, `baseGrowthPerCompletion` (authored as a decimal, stored as fixed-point ×1000), `diminishingReturnsThreshold` (integer, e.g., 50), `diminishingReturnsFactor` (authored as a decimal, e.g., 0.5, stored as fixed-point ×1000), and `outcomeEffects` (list of effect definitions — see FR-007).
- **FR-002**: Every entity MUST have a skill profile: a map of `skillId → accumulated fixed-point value [0, 100000]` (×1000), queried as an integer level [0, 100]. Missing entries default to 0 (or the prototype's starting value, spec 022). The profile is serialized with the entity in GameState (feature 006).
- **FR-003**: System MUST define a **Trait Registry**: an open, data-driven set of trait definitions. Each entry declares: `traitId`, name, description, and a list of modifiers. Modifiers may be: `skillAptitude` (skillId + growthMultiplier + startingValueBonus), `performanceModifier` (domain + multiplier, e.g., `speedMultiplier` where values above 1.0 mean faster work and below 1.0 slower work), or `needModifier` (needId + offset) as defined in feature 013.
- **FR-004**: Each procedurally generated entity MUST be assigned 1–3 traits at creation time, drawn from the trait registry. Authored entities (named NPCs, special characters) may be assigned any number of traits. Traits are immutable once assigned and are serialized with the entity.
- **FR-005**: Skill growth MUST be triggered on job or recipe completion via the event bus (feature 010). Any system (construction, production, trade, hauling) that defines skill-granting completions emits a `skill.work.completed` event with `{ entityId, skillId }`. The skill system listens and applies growth.
- **FR-006**: Skill growth formula: `growth = baseGrowthPerCompletion × aptitudeMultiplier × diminishingFactor(currentLevel)`. `diminishingFactor` is 1.0 below `diminishingReturnsThreshold` and `diminishingReturnsFactor` above it. Growth accumulates as a fixed-point integer (×1000) and the full accumulated value is serialized; the queried value is always `Math.floor(accumulated / 1000)`. Hard cap at 100 (accumulated 100000).
- **FR-007**: Skill outcome effects MUST be applied when work is executed in a skill domain. Effect types supported: `maxSpeedBonus` (reduces work duration), `outputBonus` (chance of extra output units), `qualityBonus` (reserved for future use — currently a no-op). Effects interpolate linearly between skill 0 (no bonus) and skill 100 (maximum bonus as declared). Speed semantics: `speedBonus = maxSpeedBonus × level / 100`, and `duration = baseDuration × (1 − speedBonus)`; e.g., `maxSpeedBonus: 0.5` at skill 100 turns a 24-tick recipe into 12 ticks (50% reduction).
- **FR-008**: Trait performance modifiers MUST be applied multiplicatively on top of skill-based outcome effects. The combined effect is: `baseOutcome × skillEffect(level) × traitModifier`. For duration, a trait `speedMultiplier` scales work speed, so `duration = baseDuration × (1 − speedBonus) / speedMultiplier` (e.g., `speedMultiplier 0.8` makes work take 25% longer). All factors are fixed-point; the resulting duration is rounded up to a whole number of ticks (minimum 1).
- **FR-009**: Job selection affinity scoring (feature 017) MUST incorporate skill levels: for each candidate job, the affinity score includes a `skillAffinityBonus = skill[domain] / 100 × configuredAffinityWeight`. The `configuredAffinityWeight` is a global game balance constant.
- **FR-010**: Trait aptitude `startingValueBonus` MUST be applied at entity creation time: the entity's initial skill value for that domain is its prototype starting value (spec 022, default 0) plus `startingValueBonus` (clamped to [0, 100]).
- **FR-011**: All skill registry and trait registry entries are data-defined. Adding a new skill or trait requires no code change.
- **FR-012**: The entity skill profile and trait list MUST be queryable at any time and MUST reflect the current state as of the last completed tick.
- **FR-013**: System MUST emit `skill.increased` event on the event bus whenever a skill value (floor integer) increases, with payload `{ entityId, skillId, oldValue, newValue }`.

### Key Entities

- **SkillRegistry**: A data-driven registry of all skill definitions. Accessed by the skill system to look up growth rates, diminishing return thresholds, and outcome effects. Read-only at runtime.
- **TraitRegistry**: A data-driven registry of all trait definitions. Accessed at entity creation and when applying modifiers. Read-only at runtime.
- **SkillProfile**: A component on every entity mapping `skillId → fixed-point accumulated value` (×1000, stored and serialized in full) and `skillId → integer` (queried, floor of value / 1000). Serialized to GameState.
- **TraitList**: A component on every entity holding trait IDs — 1–3 for procedurally generated entities; authored entities may specify any number (FR-004). Immutable after creation. Serialized to GameState.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An entity that exclusively bakes for 200 in-game hours self-selects baking jobs at 3× the rate of a freshly created entity with zero skills, without any player intervention.
- **SC-002**: Skill growth is deterministic: given the same seed and the same sequence of completions, two entities reach identical skill values.
- **SC-003**: A new skill or trait can be added to the game entirely through data (no code change); entities with the new skill or trait behave correctly on the next game load.
- **SC-004**: Trait effects are measurably distinct: an entity with `Gifted Baker` reaches `baking: 50` in fewer completions than an entity without the trait, verifiable in a headless test.
- **SC-005**: Skill outcome effects produce measurably different results at skill 0 vs. skill 100 (e.g., construction duration differs by at least the declared `maxSpeedBonus`), verifiable in a headless test.
- **SC-006**: All skill and trait state is fully preserved through save/load with no loss or corruption.
- **SC-007**: Skill growth correctly accumulates fractional values: an entity gaining 0.5 skill per completion reaches `floor(10.0) = 10` after exactly 20 completions.

## Assumptions

- **No enforced professions**: There is no profession component, profession registry, or job-gating by profession. "Baker" is a description of what someone is currently doing, not an entity property. Job selection weighting by skill is the only mechanism producing occupational identity. Descriptive titles such as "the Baker" / "Master Baker" are derived from skills by spec 028 and are not a profession component.
- **Skill domains are defined in the skill registry, not hardcoded**: Skill IDs are strings (e.g., `"baking"`, `"construction"`). Which jobs grant which skill is declared in the job definition (feature 017) or recipe definition (feature 014), not in the skill system itself.
- **Traits are assigned at entity creation, not earned**: There is no in-game mechanism to gain or lose traits. They are either authored for named entities or procedurally drawn from the trait registry at spawning.
- **Skill growth fires on completion, not per tick**: A 100-tick baking job grants the same skill growth as a 10-tick baking job. Duration does not affect growth amount.
- **Fixed-point accumulation is private**: The accumulated skill is stored and serialized as a fixed-point integer (×1000) but its fractional part is never surfaced to the player or external systems. All external queries return the floor integer.
- **Trait count range (1–3) applies to procedural entities only**: Procedurally generated entities receive 1–3 traits. Authored/named entities may have any number of traits as defined in their authored data. The skill system applies all traits regardless of count.
- **AI integration is additive**: Skill affinity scoring adds to the existing job selection algorithm (feature 017); it does not replace need-priority or player-priority logic. Skill affinity is the familiarity criterion in the single job selection order defined in spec 017 FR-007: player priority > urgency > familiarity > distance.
