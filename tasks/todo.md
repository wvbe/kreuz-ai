# Todo — playable, spec-complete, headless-first Kreuzvibe

Plan and per-task acceptance criteria: `tasks/plan.md`. Spec digests: `tasks/spec-digests/`.
Greenfield: the old implementation is deleted and not consulted (owner decision).
Definition of Done for every task: lint + typecheck clean, a co-located test per exported function, TSDoc, folder README, JSON round-trip test for new state, `npm run ci` green.

## Phase 0 — Foundations
- [x] 0.1 Delete old code; scaffold per spec 023 (tsconfigs, ESLint incl. determinism bans, vitest, vite-node, check scripts)
- [x] 0.2 `docs/DECISIONS.md` — resolve cross-spec conflicts, command/event catalogues, tick order, descopes (owner waived review; includes trader refined-credit ledger rule)
- [x] 0.3 PRNG & seed (011)
- [x] 0.4 Event bus (010)

## Phase 1 — Kernel + headless shell
- [x] 1.1 Time, tick primitive, AutoRunner, TickPipeline (001)
- [x] 1.2 ECS: entities/components/prototypes/access (003A, 002)
- [x] 1.3 Task/step runtime + BT interpreter core — **highest risk, do first** (003B, 013 core)
- [x] 1.4 Map & terrain: square + Voronoi, sub-maps (004)
- [x] 1.5 Inventory (005)
- [x] 1.6 Save format, migrations, round-trip (006)
- [x] 1.7 Content loader + registries + vertical-slice pack v0 (022 loader)
- [x] 1.8 Engine bootstrap + system registry (007)
- [x] 1.9 `GameSession` facade, commands, queries, command log/replay
- [ ] 1.10 CLI renderer v0 + JSONL protocol + scenario runner + child-process e2e
- [ ] **Checkpoint A:** `npm run ci` green; CLI new/step/save/load works; determinism e2e passes in-process and via child process

## Phase 2 — A living world
- [ ] 2.1 Map generators: outdoor, village, cave/cellar, quick site (004, 009)
- [ ] 2.2 A* pathfinding (012)
- [ ] 2.3 Skills & traits (020)
- [ ] 2.4 Needs, mood, utility+BT AI, movement (013)
- [ ] 2.5 Factions core (021 part)
- [ ] 2.6 Citizen identity (028 part)
- [ ] **Checkpoint B:** settlers live autonomously, 1k-tick soak deterministic, save/load mid-soak identical

## Phase 3 — Economy
- [ ] 3.1 Job boards & claiming, Town Crier (017)
- [ ] 3.2 Stockpiles & storage (018)
- [ ] 3.3 Production & crafting (014)
- [ ] 3.4 Zones & rooms (015)
- [ ] 3.5 Construction (016)
- [ ] 3.6 Status explanations & flow (025)
- [ ] **Checkpoint C (playable in terminal):** scripted e2e farm → bakery → bread eaten; `why` explains every idle citizen

## Phase 4 — Society and progression
- [ ] 4.1 Trade & currency (019)
- [ ] 4.2 Diplomacy & factions rest (021)
- [ ] 4.3 Standing orders & Steward (026)
- [ ] 4.4 Settlement tiers, milestones, difficulty (027)
- [ ] 4.5 Dwellings & household upgrades (029)
- [ ] 4.6 Chronicle & journals (028)
- [ ] **Checkpoint D (complete headless):** `hamlet-to-village` and `harsh-survival` scenarios pass via CLI `--script`; every FR covered by a test

## Phase 5 — Content to full spec (022), parallelizable
- [ ] 5.1 Terrain / materials / furniture
- [ ] 5.2 Recipes / jobs / zones
- [ ] 5.3 Humanoids / animals / skills / traits / needs / behaviors / factions / names
- [ ] 5.4 Content conformance test (counts, references, Hamlet→Village reachability)

## Phase 6 — React renderer (024)
- [ ] 6.1 Shell: EngineHost (owns clock), store/hooks, Vite app, new/save/load
- [ ] 6.2 Map canvas, camera, picking, entity primitives, overlays
- [ ] 6.3 Inspection panels, why-popover, citizen/journal
- [ ] 6.4 Command UIs (build, zones, walls, boards, standing orders, steward, directives, pending list)
- [ ] 6.5 Views (content browser, flow, idle/blocked, chronicle, progress, toasts)
- [ ] 6.6 jsdom UI smoke tests running the shared scenario JSON

## Phase 7 — Hardening
- [ ] 7.1 Scenario snapshot library, perf success criteria, 10k-tick soak with invariants
- [ ] 7.2 Spec→test traceability audit, docs, CLI manual
- [ ] **Final:** all specs implemented, `npm run ci` green, playable in terminal and browser
