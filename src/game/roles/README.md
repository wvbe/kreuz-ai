# src/game/roles

The behavior handlers of the role trees of spec 022 US14 that belong to no other system (DECISIONS D-141). The trees themselves are content (`../content/data/behavior-trees.json`): `daily_routine` (the v0 `basic_needs` order with `worker_cycle` and `idle_wander` as `run_tree` references), `guard_patrol`, `merchant_routine` and `priest_routine` (each ends in `run_tree daily_routine`). `registerRoles` is called by the engine for itself.

- `zoneVisitHandlers.ts` - the condition `zone_available` and the action `go_to_zone`, both with the param `zoneTypes` (comma separated zone type ids): the merchant walks to an active `market` zone, the priest to a `chapel`, `church` or `cloister` zone, stands there and decides again after a while. Without such a zone the branch fails and the entity falls through to `daily_routine`.
- `guardHandlers.ts` - `hostile_animal_near` (a predator within about 8 cells) and `engage_threat` (walk to it, strike it for a third of its health once in reach; at zero health it leaves the world, no drops).
- `registerRoles.ts` - `registerRoles(engine)`.

Not modelled (no system behind them yet): the social, comfort and faith branches of `daily_routine`, patrol and watch duty, the merchant's restock trips and daytime, the sermon and the charity trigger. They are listed in `docs/content-crossrefs-5.3.md`.
