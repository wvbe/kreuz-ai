# Cross-references left open by task 5.1 (terrain, materials, furniture)

One line per id that other categories must still wire. The pack loads without dangling ids; these are gaps the final conformance task 5.4 reconciles. Format: `id: owner category - what is missing`.

## Workstation tags with no recipe yet (recipes)

Furniture workstations exist with the tag equal to their id (plus `workstation`); no recipe names them yet.

- forge: recipes - spec 022 US2 recipes for the forge
- anvil: recipes - smithing, tools, weapons, armor
- smelter: recipes - iron, copper, bronze ingots
- spinning_wheel: recipes - linen and wool thread
- loom: recipes - linen and wool cloth
- tanning_rack: recipes - leather
- parchment_frame: recipes - parchment
- tailoring_bench: recipes - clothing
- malting_floor: recipes - malt
- brewing_vat: recipes - ale, mead
- wine_press: recipes - wine
- cheese_press: recipes - cheese
- churn: recipes - butter
- cooking_pot: recipes - pottage, stew, porridge, fruit preserves
- drying_rack: recipes - dried meat
- salting_table: recipes - salted fish
- masons_bench: recipes - stonecutting (the v0 `cut_stone_block` still uses `workbench`)
- kiln: recipes - brick, glass pane
- charcoal_kiln: recipes - charcoal
- candle_mold: recipes - candle
- rope_walk: recipes - rope
- butchers_block: recipes - butchering (raw meat, hide, tallow)
- apiary: recipes / jobs - honey and beeswax (furniture has no inventory, no engine prototype)

## Materials no recipe produces yet (recipes)

Produced goods: pine_plank, birch_plank, brick, copper_ingot, bronze_ingot, charcoal, malt, linen_thread, wool_thread, linen_cloth, wool_cloth, leather, rope, parchment, candle, glass_pane, plaster, iron_chisel, saw, axe, pickaxe, sickle, hoe, fishing_rod, needle, iron_sword, iron_shield, spear, bow, arrow, leather_armor, iron_chainmail, iron_helm, peasant_clothing, fine_clothing, monks_habit, rye_bread, ale, wine, mead, cheese, dried_meat, salted_fish, pottage, stew, roast_meat, fruit_preserves, butter, porridge.

Raw or gathered materials without a source job or zone (jobs, zones, animals): pine_log, birch_log, granite, clay, copper_ore, tin_ore, flax, raw_wool, barley, rye, raw_hide, tallow, herbs, salt, sand, honey, raw_fish, raw_meat, milk, grapes, vegetables, fruit, oak_bark, beeswax, eggs. Terrain `harvestable` lists them already (`forest_pine`, `forest_birch`, `ore_vein`, `clay_deposit`, `marsh`, `sand`, `vineyard_soil`, `orchard_soil`, `water_shallow`, `fertile_soil`, `forest_oak`, `stone_deposit`), but jobs carry their own `outputs` and do not read terrain `harvestable`.

## Furniture tags and ids zones should reference (zones)

Zone requirements per spec 022 US4 can now resolve: forge, anvil, tanning_rack, kiln, brewing_vat, malting_floor, loom, spinning_wheel, cooking_pot, butchers_block, drying_rack, masons_bench, bookcase, lectern, pantry_shelf, wine_rack, barrel, crate, weapon_rack, armor_stand, long_table, hearth, bench, throne, altar, candelabra, prayer_bench, straw_pallet, trough, charcoal_kiln, apiary. v0 `throne_room` still requires `table`; spec asks for `throne`.

## Terrain ids for other categories (zones, jobs, animals)

New terrain ids that habitat lists, jobs (`zoneContext` terrain) and zones may use: forest_pine, forest_birch, rocky, ore_vein, water_deep, marsh, road_stone, sand, vineyard_soil, orchard_soil, clay_deposit, floor_stone. World generation does not place any of them yet (it only uses the v0 ids).

## Tier notes (furniture)

Furniture tiers follow the zone column of spec 022 US4 (the lowest tier of a zone that needs the piece). Hamlet pieces whose materials only a later tier can make (`masons_bench` needs iron chisels, `candelabra` and `candle_mold` need iron and candles, `throne` and `cooking_pot` need iron ingots) rely on the founders' kit and the iron-by-trade path of D-16, as the spec's Hamlet zones do.
