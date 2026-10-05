# src/game/map

Maps, terrain and the cell-to-entity index (spec 004, DECISIONS D-05, D-21, D-34). The generators live in `../worldgen`; this folder has the structures plus `fill`, `assignTerrain` (silent bulk write for generators) and `setTerrain`.

- `mapTypes.ts` - `GridType` (`square | voronoi`), `BlockReason`, `MoveCostClass` (5/7/10/15/25), `MapGeometry`, `MapParams`, `MapState`, `MapLink`, `MapLocation`, and the world constants (`voronoiWorldSize` 65536, `squareTilePitch` 1000).
- `TerrainRegistry.ts` - per-engine terrain definitions `{ id, moveCost, passable, blockReason }` fed by the content pack (task 1.7); `terrainDefinitionSchema` is the Zod schema the loader reuses. Impassable terrain names `water` or `impassable_cliff`.
- `buildSquareGeometry.ts` - 4-connected square grid, `cellIndex = y * width + x`, milli-tile coordinates.
- `delaunay.ts` - exact integer Delaunay triangulation (Bowyer-Watson, BigInt-exact predicates behind a conservative float filter) plus clipped Voronoi polygons.
- `voronoiGeometry.ts` - `buildVoronoiGeometry({ seed, cellCount, relaxPasses })`: seeded distinct sites in `0..65535`, integer Lloyd relaxation, cells renumbered in row-major bands, adjacency. `hashGeometry` fingerprints a geometry for golden tests.
- `GameMap.ts` - one map: terrain per cell, derived geometry, `neighbors(cell)` (ascending cell index on both kinds), movement cost, `blockReason`/`isTraversable` (terrain first, then entity obstructions), `setTerrain` (event), `fill` (silent), `setObstruction` (event), outgoing links, and a synchronous `revision` counter (bumped by terrain, obstruction and link changes; not saved) that derived caches such as the path cache key on.
- `MapRegistry.ts` - all maps: `createMap` (ids from `CounterName.MapId`, `size: MapSize` option), parent/child sub-maps, `linkMaps`, `deleteMap` (rejected while in use), `placeEntity`/`moveEntity`/`transferEntity`/`travel`, `queryCell`, `serialize`/`restore` (root key `maps`), `rebuildOccupants`.
- `OccupantIndex.ts` - derived cell occupants, ascending entity ids, rebuilt from `Position` components.
- `positionComponent.ts` - the `Position { mapId, cellIndex }` component.
- `mapSize.ts` - `MapSize` and `mapDimensionsFor` (Small 600 / Medium 1200 / Large 2400 cells).
- `MapError.ts` - `MapError` with a `MapErrorKind`.

## Rules

- Geometry is a pure function of `(gridType, width/height or params)` and is regenerated on load, never saved. Saves hold `params` (generator, seed, cellCount, relaxPasses), per-cell terrain ids, parent id and links.
- Integer-only state. Voronoi sites are integers in `0..65535`; every adjacency decision uses exact integer predicates, so the same params give the same graph on every platform (golden test: 64x64 map, seed 42).
- Events (queued on the bus): `map.created`, `map.terrain.changed`, `map.cell.obstruction.changed`, `entity.map.changed`.
- Obstructions (walls, doors, blocking furniture) are derived from entities and are set by the systems that own them (task 3.5) with `setObstruction`; they are not serialized by the map.
- The registry keeps the occupant index consistent for the entities it places; the caller writes the `Position` component. After loading entities call `rebuildOccupants(store.entities())`.
- Restore order: counters, then `MapRegistry.restore`, then the entity store, then `rebuildOccupants`.
