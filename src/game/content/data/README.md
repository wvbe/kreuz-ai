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
| `furniture.json` | 7 pieces | 50+ |
| `zones.json` | 6 zone types | 25+ |
| `recipes.json` | 4 recipes | 55+ |
| `jobs.json` | 6 jobs | 20+ |
| `factions.json` | 1 guild (`guild_bakers`) | 9 guilds + 3 religious |
| `behavior-trees.json` | `idle_wander`, `basic_needs` (uses `run_tree`) | 7+ trees |
| `name-lists.json` | `common_13c`: 62 given names, 41 bynames (meets the 60/40 minimum) | keep, extend |
| `humanoid-prototypes.json` | peasant, farmer, carpenter, baker | 20+ |
| `animal-prototypes.json` | empty | 6 livestock + 5 wild |
| `engine-prototypes.json` | `government_faction` (no components yet), `wall`, `job_board` | add `door`, `build_site`, `loose_pile`, `diplomatic_envoy` with their components |
| `dwelling-levels.json` | 4 levels, placeholder numbers | tuned (spec 029) |
| `settlement-tiers.json` | 4 tiers with the 027 default requirements | tuned, more zone requirements |
| `difficulty-modes.json` | 3 modes with the 027 multipliers | final |
| `content-constants.json` | spec values where given, the rest are guesses | tuned |
| `moment-templates.json` | one short English template per moment kind | final text |
| `name-formats.json` | the 028 templates | final |

Known v0 simplifications: unlock tiers are set only on `oven`, `bakery`, `bake_bread` and the two upper dwelling levels; `throne_room` needs a `table` instead of a throne; tier requirements reference only `throne_room`.
