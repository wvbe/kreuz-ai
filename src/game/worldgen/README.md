# src/game/worldgen

Deterministic map generators (plan task 2.1, spec 004 generators, spec 009, DECISIONS D-06 and D-33). Integer math only; every random choice is drawn from the named PRNG stream `world.gen` (site generator: `site.gen`), so a result is a pure function of `(seed, size)` plus the content pack's terrain ids.

## What `newGame({ mapSize })` builds

The engine system `world.starting-map` (registered in `GameEngine`) calls `generateWorld(engine, mapSize, seed)`:

1. creates the main voronoi map (generator `outdoor`, map id 1, 600 / 1200 / 2400 cells for Small / Medium / Large, geometry seed = game seed);
2. draws a candidate: `chooseVillageCenter`, `generateOutdoorTerrain` (mountain band along the edges, stone at the mountain foot, lakes, rivers as greedy cell chains with a ford every 6th cell, oak forest patches, fertile soil on the shore), `layoutVillage` (two-step grassland clearing, four dirt road spokes along the cell adjacency, four fertile starter plots), `placeIronOre` (1 to 3 ore cells at a mountain foot, 5 to 14 cell spacings from the village; DECISIONS D-16 Hamlet iron source);
3. `verifyWorld` checks that every class exists (water, fertile soil, forest, stone, iron ore), every passable class and the ore is reachable from the village (Dijkstra), the clearing is traversable and 60% of the passable cells are reachable; a failing candidate is replaced by the next draw of the same stream (at most 8, `maxWorldAttempts`), after which `carvePath` connects the ore to the village (`GeneratedWorld.repaired`); if that fails too a `WorldGenError` is thrown;
4. `placeFeatures` (D-250, own stream `world.gen.features`) converts cells of existing biomes into the terrains the base generator never paints, after the world is verified and repaired: pine and birch forest and ore veins (from oak edge cells), sand, clay, marsh and rocky ground (from shore grass and grass beside stone), orchard and vineyard soil (from fertile soil with a fertile neighbour) and deep water (lake heart cells). It never changes the clearing, cells within 8 cell spacings of the village (13 for marsh) or within 3 of the iron ore deposit, keeps passability and move cost (marsh excepted), and has a guarantee step so every feature appears wherever a cell can carry it. `baseTerrainOf` maps a feature terrain back to its base biome; the wild animal spawn and the animal movement read cells through it, so fauna behaves as before. `nonGeneratedTerrain` lists pack ids no generator paints (walls and floors of caves and cellars, player-built floors and paving).
5. `spawnSettlers` spawns the `job_board` entity on the village center (user-managed: the town square, edited through a Town Crier, D-53), six settlers (`farmer, farmer, carpenter, baker, peasant, peasant`) on distinct clearing cells and then the starting stockpile, a `chest` (entity 9 of a default game; furniture storage with `Stockpile`, DECISIONS D-47) on the next clearing cell, each with `Position` and registered in the occupant index; settlers also join the government faction, get an `Identity` (`assignIdentity`) and the one with the greatest total skill becomes the government leader; the first peasant is appointed Town Crier (D-12, D-53).

Wild animals are not placed here: `spawnFauna.ts` (`spawnFauna(engine, mapId, villageCell)`, task 5.3 part 2b, D-140) runs at the end of the new-game init of `../fauna` (after the NPC factions, so no id of the starting world changes) and draws only from the stream `world.fauna`: per wild prototype, one animal per `habitatCellsPerAnimal[threat]` free habitat cells at least six cell spacings from the village (cap `maxAnimalsPerSpecies[threat]`, at least one for deer, rabbit and fox).

`readWorldLayout(engine)` recovers `{ mapId, villageCell, oreCells, settlerIds }` from saved state only (village anchor = position of the job board, ore = cells of terrain `iron_ore_deposit`), so it also works after `loadGame`. `terrainHash(map)` fingerprints the terrain for golden tests.

## Files

- `placeFeatures.ts` - the late feature pass, `baseTerrainOf`, `nonGeneratedTerrain`.
- `generateWorld.ts`, `generateOutdoorTerrain.ts`, `layoutVillage.ts`, `placeIronOre.ts`, `verifyWorld.ts`, `carvePath.ts`, `spawnSettlers.ts`, `readWorldLayout.ts`, `terrainHash.ts` - the outdoor world as described above.
- `generateCave.ts` - `generateCaveTerrain` (cellular automaton, largest cavern kept, corridor fallback) and `generateCave(maps, stream, {parentId, parentCell})`: square sub-map linked both ways to the parent cell (`MapRegistry.linkMaps`, so `travel` works in both directions).
- `generateCellar.ts` - `generateCellarTerrain` (3 to 5 rooms with L corridors, connected by construction) and `generateCellar(...)` with the same link contract. Caves and cellars are not created by `newGame`; systems and scenarios call the generators.
- `SiteGenerator.ts` - spec 009 renamed (`SiteGenerator`, `SiteSize`, `SiteScenario`, `GeneratedSite`): `new SiteGenerator(stream('site.gen')).generate(options)` returns data (square 15 / 25 / 40, wall cells, 10 to 20 entities, 5 to 10 objects, scenario trade / interaction / navigation) and records the seed in `params`. Explicit `seed` uses a private `Prng`. 8 layout retries. `insertSite.ts` puts a site into a game (map, wall entities with obstructions, citizens; objects stay data until furniture exists, task 3.5).
- `WorldTerrain.ts` - terrain ids the generators use; `WorldGenError.ts` - typed errors; `integerSqrt.ts`, `distanceSquared.ts` - integer helpers.

## Rules

- No `Math.random`, no floats in state, no clock. The generators write terrain with `GameMap.assignTerrain` (silent, one revision bump), so a new game does not queue thousands of `map.terrain.changed` events.
- Adding a draw or reordering draws changes every golden terrain hash (`generateWorld.test.ts`, `tests/e2e/golden/world-seed42-small.txt`); update them deliberately. The feature pass has its own stream, so changing it never moves the other goldens, and `generateWorld.test.ts` also pins the hash of the terrain mapped back through `baseTerrainOf` (the goldens from before D-250).
- The content pack must contain the terrain ids of `WorldTerrain` (outdoor subset); otherwise `newGame({ mapSize })` throws `WorldGenError(MissingTerrain)`.
