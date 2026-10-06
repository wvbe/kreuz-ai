# src/game/content/data

The JSON content files, kebab-case, loaded with static imports by `ContentLoader.ts` in the order of `ContentFile`. Content ids are lowercase snake_case; job ids are dot-namespaced. Decimals are authored and converted at load.

## Status: vertical-slice pack v0

This is a **minimal placeholder pack**, just enough for the kernel, the e2e tests and the next tasks. Phase 5 (tasks 5.1-5.3) replaces and expands it into the full spec 022 content (70+ materials, 55+ recipes, 50+ furniture, 25+ zone types, 20+ humanoids, animals, 20+ skills, 24+ traits, 12 factions, 20+ jobs, 15+ terrain, 7+ behavior trees). Do not treat any value below as balanced.

| File | v0 content | Phase 5 |
| --- | --- | --- |
| `categories.json` | 14 item categories | extend with the 022 categories |
| `terrain.json` | 11 terrain types | 15+ |
| `materials.json` | 14 materials incl. `silver_penny` | 70+ |
| `needs.json` | the 6 needs; only hunger (bread) and rest (wooden_bed) have satisfaction methods | all methods |
| `skills.json` | 8 skills | 20+ |
| `traits.json` | 7 traits | 24+ |
| `furniture.json` | 11 records: 9 pieces plus `wall` and `door` (the `notice_post` of the Village tier and the `church_bell` of the Market Town came with task 4.3); each has the build definition of task 3.5 (`constructionMaterials`, `constructionTicks`, `unlockTier`, `deconstructionYield`, optional `removable`); bed, workbench, chest, table, sawmill, wall and door unlock at `hamlet`, the oven at `village` | 50+ |
| `zones.json` | 8 zone types (stockpile, pantry, farm_field, bakery, bedroom, dwelling, throne_room, bell_tower); a furniture alternative may carry `perTiles` (density), a zone type `requiresJobBoard` | 25+ |
| `recipes.json` | 4 recipes (optional `minSkillLevel`, default 0: the least level of the recipe skill a crafter needs) | 55+ |
| `jobs.json` | 11 jobs (a `priority` field per job type since D-54) | 20+ |
| `factions.json` | 3 guilds (`guild_bakers`, `guild_masons`, `guild_carpenters`) and three NPC factions with an `npc` block (`merchant_caravans`, `ashford_barony`, `wulfric_abbey`) | 9 guilds + 3 religious |
| `behavior-trees.json` | `idle_wander`, `basic_needs` (uses `run_tree`) | 7+ trees |
| `name-lists.json` | `common_13c`: 62 given names, 41 bynames (meets the 60/40 minimum) | keep, extend |
| `humanoid-prototypes.json` | peasant, farmer, carpenter, baker | 20+ |
| `animal-prototypes.json` | empty | 6 livestock + 5 wild |
| `engine-prototypes.json` | `government_faction` (no components yet), `wall`, `door`, `zone`, `furniture_piece` (test and construction stand-in: `Position` + `Furniture`), `job_board`, `chest` (furniture storage and stockpile), `loose_pile`, `build_site` (task 3.5: `Position`, a non-queryable 16-slot staging `Inventory`, `BuildSite`) | add `diplomatic_envoy` with its components |
| `dwelling-levels.json` | 4 levels, placeholder numbers | tuned (spec 029) |
| `settlement-tiers.json` | 4 tiers with the 027 default requirements | tuned, more zone requirements |
| `difficulty-modes.json` | 3 modes with the 027 multipliers | final |
| `content-constants.json` | spec values where given, the rest are guesses (task 2.4 added `starvationHealthPerTick`, `healthRegenPerTick`, `moodSmoothing`, `groundSleepRate`, `sleepWakeThreshold`, `wealthyCoins`, `poorCoins`, `wanderRadiusCost`, `idleStandChance`, `idleStandMinTicks/MaxTicks`) | tuned |
| `moment-templates.json` | one short English template per moment kind | final text |
| `name-formats.json` | the 028 templates | final |

Known v0 simplifications: unlock tiers are set only on the two upper dwelling levels (the oven, the bakery zone and `bake_bread` are Hamlet content since D-54, so a Hamlet can feed itself); `throne_room` needs a `table` instead of a throne; tier requirements reference only `throne_room`.
