# Content crossrefs of task 5.2 (recipes and zone types)

Work queue for the conformance task 5.4. Task 5.2 landed what resolves against the pack at its base commit; the rest is authored in full in `docs/content-pending-5.2.json` (`recipes` and `zones` in the loader's own record shape, validated by `src/game/content/contentTypes.test.ts`) and waits for the ids below, owned by task 5.1 (materials, furniture) or the skills task (skills). When an id exists, move the record from the JSON into `src/game/content/data/recipes.json` / `zones.json`, then the pending test count shrinks by itself.

Landed (spec 022 total in brackets): recipes 4 of 59 (`saw_oak_planks`, `cut_stone_block`, `grind_flour`, `bake_bread`, all v0 ids, values untouched, D-80); zone types 19 of 39 (v0: `stockpile`, `pantry`, `farm_field`, `bakery`, `bedroom`, `dwelling`, `throne_room`, `bell_tower`; new: `carpentry`, `dormitory`, `warehouse`, `guard_post`, `market`, `orchard`, `herb_garden`, `vineyard`, `quarry`, `fishing_dock`, `cemetery`).

Wiring notes for landed v0 records that differ from the spec (not rebalanced, D-80): `saw_oak_planks` makes 2 planks in 24 ticks (spec 4 in 20), `grind_flour` is 2 wheat to 1 flour with skill baking (spec 3 flour, no skill), `bake_bread` is 1 flour to 2 bread (spec 2 flour); `bakery` is 4 tiles (spec 6), `pantry` has no Pantry Shelf yet (needs `pantry_shelf`), `throne_room` asks for a `table` and 9 tiles (spec: `throne`, 10), `warehouse` lists 2 chests only (spec: 2 crates or 2 chests; add the `crate` alternative once it exists), `fishing_dock` lacks the "adjacent water" rule (no schema field; needs a zone placement rule).

## Recipes (missing id per recipe)

- recipe `saw_pine_planks`: material `pine_log`, material `pine_plank`
- recipe `saw_birch_planks`: material `birch_log`, material `birch_plank`
- recipe `burn_charcoal`: material `charcoal`, furniture `charcoal_kiln`
- recipe `smelt_iron`: furniture `smelter`
- recipe `smelt_copper`: material `copper_ore`, material `copper_ingot`, furniture `smelter`
- recipe `alloy_bronze`: material `copper_ingot`, material `tin_ore`, material `bronze_ingot`, furniture `smelter`
- recipe `forge_nails`: furniture `anvil`
- recipe `forge_hammer`: furniture `anvil`
- recipe `forge_chisel`: material `iron_chisel`, furniture `anvil`
- recipe `craft_saw`: material `saw`, furniture `anvil`
- recipe `forge_axe`: material `axe`, furniture `anvil`
- recipe `forge_pickaxe`: material `pickaxe`, furniture `anvil`
- recipe `forge_sickle`: material `sickle`, furniture `anvil`
- recipe `forge_hoe`: material `hoe`, furniture `anvil`
- recipe `craft_fishing_rod`: material `pine_plank`, material `linen_thread`, material `fishing_rod`
- recipe `forge_needle`: material `needle`, furniture `anvil`
- recipe `forge_sword`: material `leather`, material `iron_sword`, furniture `anvil`
- recipe `forge_shield`: material `iron_shield`, furniture `anvil`
- recipe `forge_spear`: material `spear`, furniture `anvil`
- recipe `craft_bow`: material `birch_plank`, material `linen_thread`, material `bow`
- recipe `fletch_arrows`: material `pine_plank`, material `arrow`
- recipe `craft_leather_armor`: material `leather`, material `leather_armor`, skill `leatherworking`
- recipe `forge_chainmail`: material `iron_chainmail`, furniture `anvil`
- recipe `forge_helm`: material `iron_helm`, furniture `anvil`
- recipe `spin_linen_thread`: material `flax`, material `linen_thread`, furniture `spinning_wheel`, skill `weaving`
- recipe `spin_wool_thread`: material `raw_wool`, material `wool_thread`, furniture `spinning_wheel`, skill `weaving`
- recipe `weave_linen_cloth`: material `linen_thread`, material `linen_cloth`, furniture `loom`, skill `weaving`
- recipe `weave_wool_cloth`: material `wool_thread`, material `wool_cloth`, furniture `loom`, skill `weaving`
- recipe `sew_peasant_clothing`: material `linen_cloth`, material `peasant_clothing`, furniture `tailoring_bench`, skill `tailoring`
- recipe `sew_fine_clothing`: material `wool_cloth`, material `linen_thread`, material `fine_clothing`, furniture `tailoring_bench`, skill `tailoring`
- recipe `sew_monks_habit`: material `wool_cloth`, material `monks_habit`, furniture `tailoring_bench`, skill `tailoring`
- recipe `twist_rope`: material `flax`, material `rope`, furniture `rope_walk`
- recipe `tan_hide`: material `raw_hide`, material `oak_bark`, material `leather`, furniture `tanning_rack`, skill `leatherworking`
- recipe `scrape_parchment`: material `raw_hide`, material `parchment`, furniture `parchment_frame`, skill `leatherworking`
- recipe `cut_granite_block`: material `granite`, furniture `masons_bench`
- recipe `fire_bricks`: material `clay`, material `brick`, furniture `kiln`
- recipe `mix_plaster`: material `plaster`, furniture `masons_bench`
- recipe `blow_glass_pane`: material `sand`, material `glass_pane`, furniture `kiln`, skill `glassblowing`
- recipe `grind_rye_flour`: material `rye`
- recipe `bake_rye_bread`: material `rye_bread`
- recipe `malt_barley`: material `barley`, material `malt`, furniture `malting_floor`, skill `brewing`
- recipe `brew_ale`: material `malt`, material `ale`, furniture `brewing_vat`, skill `brewing`
- recipe `brew_mead`: material `honey`, material `mead`, furniture `brewing_vat`, skill `brewing`
- recipe `press_cheese`: material `milk`, material `cheese`, furniture `cheese_press`, skill `cooking`
- recipe `churn_butter`: material `milk`, material `butter`, furniture `churn`, skill `cooking`
- recipe `dry_meat`: material `raw_meat`, material `salt`, material `dried_meat`, furniture `drying_rack`, skill `cooking`
- recipe `salt_fish`: material `raw_fish`, material `salt`, material `salted_fish`, furniture `salting_table`, skill `cooking`
- recipe `cook_pottage`: material `vegetables`, material `barley`, material `pottage`, furniture `cooking_pot`, skill `cooking`
- recipe `cook_stew`: material `raw_meat`, material `vegetables`, material `stew`, furniture `cooking_pot`, skill `cooking`
- recipe `roast_meat`: material `raw_meat`, material `roast_meat`, skill `cooking`
- recipe `cook_porridge`: material `barley`, material `porridge`, furniture `cooking_pot`, skill `cooking`
- recipe `make_preserves`: material `fruit`, material `honey`, material `fruit_preserves`, furniture `cooking_pot`, skill `cooking`
- recipe `press_wine`: material `grapes`, material `wine`, furniture `wine_press`, skill `brewing`
- recipe `dip_candles`: material `tallow`, material `candle`, furniture `candle_mold`
- recipe `mold_beeswax_candles`: material `beeswax`, material `candle`, furniture `candle_mold`

## Zone types (missing id per zone)

- zone `smithy`: furniture `forge`, furniture `anvil`
- zone `tannery`: furniture `tanning_rack`
- zone `pottery`: furniture `kiln`
- zone `brewery`: furniture `brewing_vat`, furniture `malting_floor`
- zone `weaving_hall`: furniture `loom`, furniture `spinning_wheel`
- zone `kitchen`: furniture `cooking_pot`, furniture `butchers_block`
- zone `smokehouse`: furniture `drying_rack`
- zone `masons_workshop`: furniture `masons_bench`
- zone `scriptorium`: furniture `bookcase`, furniture `lectern`
- zone `wine_cellar`: furniture `wine_rack`, furniture `barrel`
- zone `armory`: furniture `weapon_rack`, furniture `armor_stand`
- zone `great_hall`: furniture `long_table`, furniture `hearth`
- zone `tavern`: furniture `bench`, furniture `barrel`
- zone `chapel`: furniture `altar`, furniture `candelabra`
- zone `church`: furniture `altar`, furniture `candelabra`, furniture `lectern`, furniture `prayer_bench`
- zone `cloister`: furniture `prayer_bench`, furniture `bookcase`
- zone `barracks`: furniture `straw_pallet`, furniture `weapon_rack`
- zone `pasture`: furniture `trough`
- zone `charcoal_yard`: furniture `charcoal_kiln`
- zone `apiary_yard`: furniture `apiary`
