# Cross-references left open by task 5.1 (terrain, materials, furniture)

One line per id that other categories must still wire. The pack loads without dangling ids; these are gaps the final conformance task 5.4 reconciles. Format: `id: owner category - what is missing`.

## Resolved by task 5.4a

Every workstation tag now has a recipe (the `forge` and `apiary` pieces serve zones and jobs, not recipes), and zone requirements resolve against furniture. The raw materials with no gathering source are tracked in `docs/content-crossrefs-5.4.md`.

## Terrain ids for other categories (zones, jobs, animals)

New terrain ids that habitat lists, jobs (`zoneContext` terrain) and zones may use: forest_pine, forest_birch, rocky, ore_vein, water_deep, marsh, road_stone, sand, vineyard_soil, orchard_soil, clay_deposit, floor_stone. World generation places all of them except road_stone and floor_stone (built by the player) through the late feature pass of D-250 (`src/game/worldgen/placeFeatures.ts`); `nonGeneratedTerrain` there lists the ids that no generator paints, with the reason.

## Tier notes (furniture)

Furniture tiers follow the zone column of spec 022 US4 (the lowest tier of a zone that needs the piece). Hamlet pieces whose materials only a later tier can make (`masons_bench` needs iron chisels, `candelabra` and `candle_mold` need iron and candles, `throne` and `cooking_pot` need iron ingots) rely on the founders' kit and the iron-by-trade path of D-16, as the spec's Hamlet zones do.
