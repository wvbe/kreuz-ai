# src/game/ai/mood

Mood (spec 013 FR-004/005, DECISIONS D-04 and D-25). Mood is a component stat, not a need.

- `moodComponent.ts` - the `Mood` component `{ valueMilli, influences: [{ source, deltaMilli, untilTick }] }`; at most 8 influences, neutral (50000) by default.
- `moodModel.ts` - pure functions: `activeInfluences`, `moodTargetMilli` (mean need level + active influences + trait mood bonus, clamped), `stepMood` (a `moodSmoothing` share of the gap per tick, at least one unit, never overshoots), `addMoodInfluence` (drops expired ones, evicts the oldest beyond the cap).
- `runMood.ts` - `updateMood` (one tick for one entity) and `addMoodInfluenceTo`.
- `riskMapping.ts` - `riskSuccessPermille(mood) = clamp(200, 800, 200 + floor((mood - 10000) * 3 / 400))`, i.e. the spec's `20 + (mood - 10) * 60 / 80` percent between mood 10 and 90 and clamped outside; `rollRisk(stream, mood)` draws from the `ai.risk` stream.

Influences used so far: `consumed_<need>` (+3 percent for 72 ticks after a meal) and `slept_on_ground` (-4 percent for 144 ticks).
