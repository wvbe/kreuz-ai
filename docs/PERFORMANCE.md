# Performance

The measurable success criteria of the specs, how they are tested and what they cost today (plan task 7.1, D-112).

```sh
npm run perf                              # the table below on this machine (200 citizens, 288 ticks)
npm run perf -- --citizens 400 --ticks 144
```

Cases live in `scripts/lib/perfCases.ts`; `tests/integration/performanceBudgets.test.ts` runs them as tests. The older single-purpose checks stay where they are (`tests/integration/pathfindingPerformance.test.ts`, `zonesPerformance.test.ts`, the per-module tests that quote their SC).

## Measured

Development machine (Apple silicon laptop) while other builds were running, Node 24, one run of `npm run perf`; the numbers move with load, the budgets below leave room for that.

| Criterion                                                                            | Spec budget                          | Measured         |
| ------------------------------------------------------------------------------------ | ------------------------------------ | ---------------- |
| Bootstrap, no map (007 SC-001)                                                       | < 100 ms                             | 4.6 ms           |
| Bootstrap with the generated Small map                                               | < 100 ms                             | 23.6 ms          |
| Invalid options rejected (007 SC-002)                                                | < 50 ms                              | 0.04 ms          |
| Queries `state`, `time`, `settlement`, `maps`, `zones` with 1,000 entities (007 SC-007) | < 5 ms                            | 0.02 to 0.08 ms  |
| Query `entities` with 1,000 entities                                                 | < 5 ms                               | 1.7 ms           |
| Query `stock` with 1,000 entities                                                    | < 5 ms                               | 2.3 ms           |
| Tick, 6 citizens, mean / worst of 288                                                | -                                    | 0.46 / 3.2 ms    |
| Tick, 200 citizens, mean / worst of 288                                              | **< 50 ms mean** (documented budget) | 4.1 / 32 ms      |
| Decision per citizen (013 SC-010), whole tick / citizens                             | < 5 ms                               | 0.02 ms          |

Scaling of the mean tick (`peasant` settlers wandering and working on the Small map, 144-tick windows): 100 citizens 2.4 ms, 200 citizens 4.5 ms, 400 citizens 10.5 ms. Before the fixes of D-112 the same sizes cost 3.7, 11 and 35 ms (quadratic).

## Budgets in the tests

The real budgets are the spec figures in the table above and are judged by `npm run perf` (not part of `npm run ci`). The tests only guard against gross regressions: wall-clock assertions in CI are the spec figure times 10 (D-114), the 200-citizen test allows 500 ms mean and 5 s worst tick. The regression guards that matter count work instead of time:

- `quadrupling the citizens costs well under sixteen times as much per tick`: the tick at 400 citizens over the tick at 100 citizens must stay below 12 (linear is 4).
- `reachability answers come from the cache`: over a day with 200 citizens at most 40 % of the `reachable` questions may need a search (`PathfindingService.reachStats`).

## How the hot spots were found

`node --cpu-prof node_modules/vite-node/dist/cli.mjs <script>` on a 300-citizen settlement, then the self time by function from the `.cpuprofile`. The profile before the fixes: `reachableCells` 21 %, `TerrainRegistry.require` (called by it for every neighbour) 15 %, `PathHeap.pop` 10 %, `listBoards` 5 %, then the status providers. Both were called once per citizen and decision: the Dijkstra over the whole map (`claimJob.reachCostsOf`, `pickWanderCell`) and the scan of every entity for job boards. Fixed by the `ReachCache` of the path-finding service and the `structureRevision` of the entity store.

## Not covered yet

- The spec figures for 10,000 entities (002 SC-001 to SC-003), 1 million ticks (001 SC-001), 100,000 query iterations (002 SC-010) and the React renderer (024) are not measured here.
- Memory is only watched indirectly: the soak run (`npm run soak`, D-110) checks that the entity count stays bounded over 10,000 ticks (at most 88 entities, 40 checkpoints).
