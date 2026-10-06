# Content crossrefs of task 5.2 (recipes and zone types)

Resolved by task 5.4a (D-120): all 59 spec recipes and all 39 spec zone types are in `src/game/content/data/recipes.json` and `zones.json`. The `docs/content-pending-5.2.json` queue is gone. The remaining open items are the raw-material source gaps in `docs/content-crossrefs-5.4.md`.

Wiring notes for landed v0 records that differ from the spec (not rebalanced, D-80): `saw_oak_planks` makes 2 planks in 24 ticks (spec 4 in 20), `grind_flour` is 2 wheat to 1 flour with skill baking (spec 3 flour, no skill), `bake_bread` is 1 flour to 3 bread (spec 2 flour; 2 bread until D-182); `bakery` is 4 tiles (spec 6), `pantry` has no Pantry Shelf (needs `pantry_shelf`), `throne_room` asks for a `table` and 9 tiles (spec: `throne`, 10), `warehouse` lists 2 chests only (spec: 2 crates or 2 chests), `fishing_dock` lacks the "adjacent water" rule (no schema field; needs a zone placement rule).
