# src/game/worldgen

Deterministic map generators (plan task 2.1, spec 004 generators, spec 009, DECISIONS D-06 and D-33). Integer math only; every random choice is drawn from the named PRNG stream `world.gen` (site generator: `site.gen`), so a result is a pure function of `(seed, size)` plus the content pack's terrain ids.

## What `newGame({ mapSize })` builds

The engine system `world.starting-map` (registered in `GameEngine`) calls `generateWorld(engine, mapSize, seed)`:

1. creates the main voronoi map (generator `outdoor`, map id 1, 600 / 1200 / 2400 cells for Small / Medium / Large, geometry seed = game seed);
2. draws a candidate: `chooseVillageCenter`, `generateOutdoorTerrain` (mountain band along the edges, stone at the mountain foot, lakes, rivers as greedy cell chains with a ford every 6th cell, oak forest patches, fertile soil on the shore), `layoutVillage` (two-step grassland clearing, four dirt road spokes along the cell adjacency, four fertile starter plots), `placeIronOre` (1 to 3 ore cells at a mountain foot, 5 to 14 cell spacings from the village; DECISIONS D-16 Hamlet iron source);
3. `verifyWorld` checks that every class exists (water, fertile soil, forest, stone, iron ore), every passable class and the ore is reachable from the village (Dijkstra), the clearing is traversable and 60% of the passable cells are reachable; a failing candidate is replaced by the next draw of the same stream (at most 8, `maxWorldAttempts`), after which `carvePath` connects the ore to the village (`GeneratedWorld.repaired`); if that fails too a `WorldGenError` is thrown;
4. `spawnSettlers` spawns the `job_board` entity on the village center and six settlers (`farmer, farmer, carpenter, baker, peasant, peasant`) on distinct clearing cells, each with `Position` and registered in the occupant index.

`readWorldLayout(engine)` recovers `{ mapId, villageCell, oreCells, settlerIds }` from saved state only (village anchor = position of the job board, ore = cells of terrain `iron_ore_deposit`), so it also works after `loadGame`. `terrainHash(map)` fingerprints the terrain for golden tests.

## Files

- `generateWorld.ts`, `generateOutdoorTerrain.ts`, `layoutVillage.ts`, `placeIronOre.ts`, `verifyWorld.ts`, `carvePath.ts`, `spawnSettlers.ts`, `readWorldLayout.ts`, `terrainHash.ts` - the outdoor world as described above.
- `generateCave.ts` - `generateCaveTerrain` (cellular automaton, largest cavern kept, corridor fallback) and `generateCave(maps, stream, {parentId, parentCell})`: square sub-map linked both ways to the parent cell (`MapRegistry.linkMaps`, so `travel` works in both directions).
- `generateCellar.ts` - `generateCellarTerrain` (3 to 5 rooms with L corridors, connected by construction) and `generateCellar(...)` with the same link contract. Caves and cellars are not created by `newGame`; systems and scenarios call the generators.
- `SiteGenerator.ts` - spec 009 renamed (`SiteGenerator`, `SiteSize`, `SiteScenario`, `GeneratedSite`): `new SiteGenerator(stream('site.gen')).generate(options)` returns data (square 15 / 25 / 40, wall cells, 10 to 20 entities, 5 to 10 objects, scenario trade / interaction / navigation) and records the seed in `params`. Explicit `seed` uses a private `Prng`. 8 layout retries. `insertSite.ts` puts a site into a game (map, wall entities with obstructions, citizens; objects stay data until furniture exists, task 3.5).
- `WorldTerrain.ts` - terrain ids the generators use; `WorldGenError.ts` - typed errors; `integerSqrt.ts`, `distanceSquared.ts` - integer helpers.

## Rules

- No `Math.random`, no floats in state, no clock. The generators write terrain with `GameMap.assignTerrain` (silent, one revision bump), so a new game does not queue thousands of `map.terrain.changed` events.
- Adding a draw or reordering draws changes every golden terrain hash (`generateWorld.test.ts`, `tests/e2e/golden/world-seed42-small.txt`); update them deliberately.
- The content pack must contain the terrain ids of `WorldTerrain` (outdoor subset); otherwise `newGame({ mapSize })` throws `WorldGenError(MissingTerrain)`.
