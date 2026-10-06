# src/game/pathfinding

Deterministic A\* over the map adjacency graph (spec 012, DECISIONS D-21 and D-41). Square maps are 4-connected, voronoi maps use Delaunay neighbours; both go through `GameMap.neighbors`, `moveCost` and `isTraversable`, so walls, locked doors, furniture and impassable terrain are honoured without special cases.

- `PathfindingService.ts` - the engine-facing API: `findPath(mapId, from, target, {maxExpansions?})`, `findRoute(fromLocation, toLocation, options)` (crosses map links), `reachable(mapId, from, maxCost?)`, `findPathBreak(mapId, from, cells)` (path validation, FR-006), `cacheSize` / `cacheStats` / `clearCache()`.
- `registerPathfinding.ts` - `registerPathfinding(engine)` registers the system `pathfinding` through `engine.registerSystem` (idempotent per engine, returns the service) with the queries `find-path`, `find-route`, `reachable`. No tick function, events or save section.
- `searchPath.ts` - the pure single-map A\*. `searchRoute.ts` - flattened cross-map Dijkstra over cells and links. `reachableCells.ts`, `findPathBreak.ts` - the other pure queries.
- `pathHeuristic.ts` - admissible integer heuristic (square: Manhattan tiles x min step cost; voronoi: `floor(centroid distance x minStepCost / stepUnit)` in exact integer arithmetic).
- `PathHeap.ts` - binary heap ordered by `(priority, estimate, key)`; `PathCache.ts` - bounded LRU cache of same-map outcomes; `ReachCache.ts` - bounded LRU cache of `reachable` answers (task 7.1).
- `pathTypes.ts` - `PathResultKind` (`found | already-there | no-path`), `NoPathReason`, `PathResult`, `RouteResult`, `PathLocation`, `defaultMaxExpansions` (200000), `linkTraversalCost` (10). `pathSchemas.ts` - Zod schemas `pathResultSchema`, `routeResultSchema`.
- `pathTestWorld.ts` - ASCII map builder for tests.

## Rules

- Results are plain JSON and a pure function of `(map state, from, target, budget)`: ties break on `(f, h, cell index)` ascending, neighbours are visited ascending, no PRNG, no clock. `cells` excludes the start; `cost` is the sum of the entered cells' terrain move costs (integers). "Already there" and "no path" are different `kind`s, never an empty list.
- A blocked start may path out; a blocked or out-of-range target is `NoPath` at once. Hitting `maxExpansions` is `NoPath` with reason `budget-exceeded`.
- Cache: keyed on map object + synchronous `GameMap.revision`, so it can never serve stale data; bus events (`map.terrain.changed`, `map.cell.obstruction.changed`) also purge a map's entries. Entries remember their expansion count, so a warm answer obeys a smaller budget exactly as a cold one. Not saved; cleared on every `newGame` / `loadGame`.
- `reachable` answers are cached the same way (map object + `revision`, at most 500,000 cells held in all, `reachStats` counts hits and misses) and the returned list is shared: do not change it. Every citizen asks for its reachable cells whenever it looks for work, so without this cache a 200-citizen tick was quadratic (D-112).
- Cross-map: link edges cost 10 plus the landing cell's cost; the search uses heuristic 0 (a link can beat any geometric bound). Routes are not cached; a map without outgoing links uses the cached `findPath`.
- Movers store `cells` in task data, call `findPathBreak` before stepping (or after a map-change event) and re-plan when it returns an index.
