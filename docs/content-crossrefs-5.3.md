# Content cross-references left for task 5.4 (task 5.3 part 1)

Skills, traits, needs, humanoid prototypes, factions and name lists (spec 022 US5-8, 12, 13) landed with only ids that exist in the pack. Everything below needs an id that did not exist at the base commit and is left out of the pack. Each line: missing id - owning category - used by.

## Humanoid equipment (category: materials, agents A/B)

- hoe - materials (tool) - peasant (spec Farming 10, Hoe, Peasant Clothing)
- sickle - materials (tool) - farmer
- iron_chisel - materials (tool) - mason
- saw - materials (tool) - carpenter (the pack keeps `iron_hammer`, `nails`)
- needle - materials (tool) - weaver
- fishing_rod - materials (tool) - fisherman
- pickaxe - materials (tool) - miner
- axe - materials (tool) - lumberjack
- herbs - materials (food/plant) - herbalist
- spear - materials (weapon) - guard
- leather_armor - materials (armor) - guard
- iron_helm - materials (armor) - guard, soldier
- iron_sword - materials (weapon) - soldier
- iron_chainmail - materials (armor) - soldier
- iron_shield - materials (armor) - soldier
- peasant_clothing - materials (clothing) - every prototype except guard, soldier, merchant, priest, monk, scholar, noble
- fine_clothing - materials (clothing) - merchant, scholar, noble
- monks_habit - materials (clothing) - priest, monk
- parchment - materials (processed) - scholar

Every new prototype currently carries `bread` x2 (like the v0 four), blacksmith the `iron_hammer`, merchant and noble the `silver_penny` stacks of the spec (100 and 200).

## Need satisfaction methods (spec 022 US8)

Only hunger (`bread`) and rest (`wooden_bed`) have methods; the v0 decay values stay (hunger 0.15, rest 0.15 against the spec 0.10, safety 0.02, social 0.04, comfort 0.03, faith 0.02) because the scenarios depend on them.

- stew, pottage, roast_meat, porridge, cheese, dried_meat, fruit - materials (food) - hunger +50/+35/+55/+25/+20/+20/+15
- straw_pallet (+0.8/tick), noble_bed (+1.5/tick) - furniture - rest
- guard_post (+10) - zone (also needs a guard proximity rule in the engine) - safety
- great_hall (+20), tavern (+15) - zones - social (conversation +15 is engine behavior)
- chair (+10), bench (+5), hearth (+8), tapestry (+3) - furniture - comfort
- altar (+20), lectern (+25) - furniture; chapel (+10 passive), church (+20 passive) - zones - faith

## Factions (category: zones)

Religious faction `associatedZoneIds` stay empty until the zones exist:

- chapel, church - zones - parish_church
- cloister, church, brewery, herb_garden - zones - monastic_order
- chapel, market - zones - mendicant_friars (`market` may be a zone id)
- charity.distribute - jobs - mendicant_friars charity (spec open question, no job type yet)

Spec differences kept on purpose (existing ids are never rebalanced): `guild_masons` is `mercantile` in the pack (spec: isolationist); the three religious factions have no skill criterion (membership by prototype or choice); `wulfric_abbey` is an NPC religious faction on top of the three spec factions, so a pack test counts the player-side religious factions as `factionType: religious` without an `npc` block.

## Behavior trees (category: behavior trees, later task)

All 19 new humanoid prototypes use `basic_needs` until the tree catalogue exists:

- daily_routine, worker_cycle - all workers
- guard_patrol - guard, soldier
- merchant_routine - merchant
- priest_routine - priest, monk (and the charity trigger of the friars)

## Skill to job and recipe links

The spec names the recipe skill and job skill domain for each skill. Ids on the right that are not in the pack yet belong to the recipes and jobs of agents A and B and to the later jobs task. Skills not listed have no spec recipe or job.

| Skill | Spec recipes (plausible links) | Spec jobs |
| --- | --- | --- |
| farming | (zone farm_field) | farm.sow, farm.tend, farm.harvest |
| woodcutting | - | fell.trees |
| carpentry | saw_oak_planks (pack), saw_pine_planks, saw_birch_planks, craft_fishing_rod, craft_bow, fletch_arrows | - |
| construction | - | build.construct, build.deconstruct |
| hauling | - | haul.deliver, haul.bury |
| baking | bake_bread (pack), bake_rye_bread | - |
| masonry | cut_stone_block (pack), cut_granite_block, fire_bricks, mix_plaster | quarry.stone |
| smithing | smelt_iron, smelt_copper, alloy_bronze, forge_nails, forge_hammer, forge_chisel, craft_saw, forge_axe, forge_pickaxe, forge_sickle, forge_hoe, forge_needle, forge_sword, forge_shield, forge_spear, forge_chainmail, forge_helm | - |
| mining | - | mine.ore |
| trading | - | trade.sell, trade.buy, diplomacy.dispatch |
| leatherworking | craft_leather_armor, tan_hide, scrape_parchment | - |
| weaving | spin_linen_thread, spin_wool_thread, weave_linen_cloth, weave_wool_cloth | - |
| tailoring | sew_peasant_clothing, sew_fine_clothing, sew_monks_habit | - |
| glassblowing | blow_glass_pane | - |
| brewing | malt_barley, brew_ale, brew_mead, press_wine | - |
| cooking | press_cheese, churn_butter, dry_meat, salt_fish, cook_pottage, cook_stew, roast_meat, cook_porridge, make_preserves | - |
| fishing | - | fish.catch |
| herbalism | - | gather.herbs |
| animal_husbandry | - | tend.animals, tend.bees |
| combat | - | guard.patrol, guard.watch |
| preaching | - | preach.sermon, preach.pray |

Not skill-linked in the spec (skill null): burn_charcoal, twist_rope, grind_flour, grind_rye_flour, dip_candles, mold_beeswax_candles.

## Tuning deferred

Skill growth values of the ten v0 skills (growth 2, factor 0.25) and trait strengths of the v0 traits (hearty 0.8, slow_learner 0.8, strong and weak on hauling only) differ from the spec tables. They stay unchanged so the scenarios keep passing; the new skills and traits use the spec values.
