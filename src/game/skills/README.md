# src/game/skills

Skills and traits (spec 020, DECISIONS D-20, D-43). Every humanoid has a `Skills` component (milli-percent experience per skill id, level = `floor(v / 1000)`) and an immutable `Traits` component (trait ids). Content tables define growth, caps and effects; nothing here is hard-coded per skill.

- `skillsComponent.ts` - `skillsComponent` (`{values: {skillId: 0..100000}}`) and `traitsComponent` (`{ids: string[]}`) with strict Zod schemas. They live in the entities save section, so there is no save section of their own.
- `registerSkills.ts` - `registerSkills(engine)` (the engine calls it for itself, idempotent): components, the bus subscription for `skill.work.completed`, load validation (a skill or trait id the pack does not define is a `SkillError`, so `loadGame` fails and keeps the current game) and the queries `skills-of` / `traits-of` (`{entityId}`; `null` when the entity has no such component).
- `skillGrowth.ts` - `growthDeltaMilli(content, entity, skillId)` (D-20 growth), `applySkillWork(engine, entityId, skillId)` (adds growth, caps at 100000, emits `skill.increased` on level change), `emitSkillWorkCompleted(bus, entityId, skillId)` (what job-executing systems call), `skillWorkCompletedSchema`.
- `workSpeed.ts` - `workSpeed(content, entity, work)` and `workDuration(content, entity, work, baseTicks)`; `work` is any record with a `skillId` (recipe, job type). `outputBonus.ts` - `expectedOutputBonusMilli`, `rollOutputBonus(content, entity, work, stream)` (stream `skill.output`).
- `traitModifiers.ts` - the trait effect hooks other systems call: `aptitudeMultiplierPermille`, `traitPerformance(content, entity, skillId, stat)`, `marginAddPermille` (trade), `needModifiers(content, entity, needId)` (needs and mood), `traitsOf`, `modifierCoversSkill`.
- `affinityScore.ts` - `affinityScore(entity, skillIds)` and `familiarityBucket(entity, skillId)`; `skillLevels.ts` - `skillLevel`, `skillValueMilli`, `levelOfMilli`, `dominantSkill`.
- `traitAssignment.ts` - `initializeCharacter(engine, entityId)` (call right after spawning a humanoid; worldgen does) and `drawTraitIds`.
- `skillViews.ts` - `buildSkillsView`, `buildTraitsView`, `describeTrait`, `formatPermille` (the data behind the queries and the CLI `inspect` lines).
- `SkillError.ts` - `SkillError` / `SkillErrorKind`. `skillTypes.ts` - component data types, event names and payloads, stream names, constants.
- `testSkillContent.ts` - small skill and trait tables plus `createTestCharacter` for pure-function tests.

## Rules

- All numbers are integers: experience milli-percent, multipliers permille. Growth per completion is `trunc(baseGrowth * aptitude * factor / 1e6)`; `factor` is `diminishingFactor` from the threshold level up. Growth happens once per `skill.work.completed`, never per tick, never decreases and stops (no event) at 100.
- `skill.work.completed {entityId, skillId}` is emitted once per completed claim by the executing system (production, construction, gathering, hauling, trade); growth runs when the bus drains.
- Duration is `max(1, ceilDiv(base * (1000 - speedBonus) * 1000, 1000 * traitMultiplier))`, computed when work starts. Output bonus rolls draw from `skill.output` only when a fractional part exists.
- Traits stack multiplicatively (aptitude, multiplier, speed multiplier) or additively (output bonus, margin add); conflicting traits both apply but are never drawn together. Wildcards: `ALL`, `ALL_WORK` (also unskilled work), `ALL_CRAFTING` (skills some recipe uses).
- Procedural traits (prototypes with no `defaultTraitIds`) come from the `content.traits` stream: count 1..3 by weights 50/35/15, capped by `traitSlots`, ascending ids.
