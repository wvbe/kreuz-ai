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
- [x] 1.10 CLI renderer v0 + JSONL protocol + scenario runner + child-process e2e
- [x] **Checkpoint A:** `npm run ci` green; CLI new/step/save/load works; determinism e2e passes in-process and via child process

## Phase 2 — A living world
- [x] 2.1 Map generators: outdoor, village, cave/cellar, quick site (004, 009)
- [x] 2.2 A* pathfinding (012)
- [x] 2.3 Skills & traits (020)
- [x] 2.4 Needs, mood, utility+BT AI, movement (013)
- [x] 2.5 Factions core (021 part)
- [x] 2.6 Citizen identity (028 part)
- [x] **Checkpoint B:** settlers live autonomously, 1k-tick soak deterministic, save/load mid-soak identical

## Phase 3 — Economy
- [x] 3.1 Job boards & claiming, Town Crier (017) - parts a (board/posting data, lifecycle, pause), b (claim order, eligibility, wage, executor registry, `fell.trees`) and e (system vs player pause, `claim_job` in `basic_needs`) done, D-46; c (Town Crier fleet, pending updates, `PostJob`/`RemovePosting`/`ModifyPosting`, `pending`/`crier`/`post` verbs, D-53) and d (every v0 job type has an executor or is explicitly deferred, `jobCoverage`) done
- [x] 3.2 Stockpiles & storage (018) - reservations, `Furniture`/`Stockpile`, tiered routing, `haul.deliver` + poster, stock queries, storage decay, `stock` verb, D-47; zones (tier 0/1, Pantry) wait for 3.4
- [x] 3.3 Production & crafting (014) - workstation prototypes + `ProductionOrders`, order commands, `craft.produce` (fetch, lock, craft, consume), output hauling, D-10 cancel rules, `explainOrder` for 025, `orders`/`order` verbs, `debugSpawn` + `scenarios/bakery.json`, D-49
- [x] 3.4 Zones & rooms (015) - `Zone` entities, requirement grammar + status/`zone.*` events (D-11 timing), merge/split commands, skill affinity, storage tiers 0/1 + zone filter, board pausing, `zones`/`zone` verbs + map overlay, D-48
- [x] 3.5 Construction (016) - `build_site` blueprints, `validatePlacement` with structured reasons, supply (`build.supply`, `Supply` reservations) and build (`build.construct`) jobs on the board, walls/doors that obstruct cells, completion by prototype, cancel/deconstruct with refunds, build definitions for every v0 piece, `build`/`sites` verbs, `scenarios/build-bakery.json`, D-50; tools and `NoQualifiedWorker` not modelled
- [x] 3.6 Status explanations & flow (025)
- [x] 3.7a Gathering & farming (014/022 gap) - `src/game/gathering`: crop plots on fertile cells of active `farm_field` zones (`Fallow`/`Sown`/`Ripe`, grown by `cropGrowthTicks`, `seasonModifier` hook = 1000), `farm.sow` / `farm.harvest` / `mine.ore` / `quarry.stone` executors with output bonus and skill XP, finite deposits (per-cell charges, depletion to `cave_floor`), stock-threshold and bounded auto-posters, field status reasons, `crops` query and `fields` verb, `mining` skill, `scenarios/farming.json` and `mining.json`, D-52
- [x] **Checkpoint C (playable in terminal):** `scenarios/checkpoint-c.json` (player commands only: zones, construction, orders; ten days, bread baked and eaten, six alive), `tests/integration/checkpointC.test.ts`, CLI child-process e2e, `docs/PLAYING.md`; D-54 (bakery chain is Hamlet content, founders' kit, balance, job priorities), verbs `find` / `cell`

## Phase 4 — Society and progression
- [x] 4.1 Trade & currency (019) - `src/game/trade`: treasury (government faction inventory, starting 1000 coins) and wages paid from it (deferred when empty), rent hook, price functions (scarcity, agreement discount, Greedy margin), travelling traders on the stream `trade.visit`, negotiated atomic trades with `Payment` reservations and rollback, **the refined-credit ledger of D-13** (persisted, no expiry), player trade orders carried out by `trade.sell` / `trade.buy` jobs, queries `traders` / `trade-offers` / `trade-orders` / `trade-ledger` / `treasury` / `trade-quote`, verbs `traders` / `trade` / `treasury` / `ledger`, `scenarios/trade-ore-for-iron.json` (Hamlet: ore sold, exact ingots bought, player commands only), D-55
- [x] 4.2 Diplomacy & factions rest (021) - `src/game/diplomacy`: NPC factions with seats and leaders seeded at new game (`merchant_caravans`, `ashford_barony` wary, `wulfric_abbey` friendly), attitude bands and the derived hostile status for the trade and labour gates, standing deltas per act and decay, `IssueDiplomaticAct` / `CancelDiplomaticDirective` / `RespondToProposal` / `SetFactionLeader`, `Envoy` entities (abstract trip from the seat distance, jitter on `diplomacy.resolve`, failure only by timeout, gift cargo refunded), trade agreements (0.9 prices), proposals, NPC AI on `diplomacy.ai` with insult incidents, leader succession, queries `factions-diplomacy` / `directives` / `agreements` / `envoys` / `proposals`, verbs `diplomacy` / `gift` / `envoy` / `directives` / `agreements` / `proposals` / `respond` / `leader`, `scenarios/diplomacy.json`, D-56
- [ ] 4.3 Standing orders & Steward (026)
- [x] 4.4 Settlement tiers, milestones, difficulty (027) - `src/game/settlement`: `SettlementProgress` / `SettlementChronicle` (placeholder) on the government, the tier ladder with data-driven requirements and the pure `evaluateTier`, the daily check at slot 15 (one promotion at most, `settlement.tier.reached`), the seven milestones recorded once from events (`settlement.milestone.reached`), the tier source of the job service feeding every gate (placement, zones, production, postings, build menu), `startingTier`, difficulty multipliers only on decay / need decay / hostility, queries `settlement-progress` / `unlocks` / `milestones`, verbs `tier` / `unlocks` / `milestones`, `validateTierReachability` (content-pack test, proves Village from a Hamlet start incl. the ore -> trader ledger path), cottage at Village and two more guilds in the pack, `scenarios/tier-progress.json`, D-57
- [x] 4.5 Dwellings & household upgrades (029) - `src/game/housing`: the `Dwelling` state on `dwelling` zones, the seven-step daily evaluation at slot 13 (clear invalid homes, supplied goods with the accumulator model, requirements and streaks with one level change a day, capacity, rent into the treasury, the homeless by id, settlers at most two a day), the household fetch chore (`housing.fetch`, behavior nodes before `claim_job`), household storage and beds reserved to residents (and the bed lookup fixed for built furniture), the Dwelling status provider, queries `dwellings` / `dwelling` / `housing` / `dwellings-at-or-above`, verbs `homes` / `home`, the settlement's dwelling counter, `scenarios/hamlet-to-village.json` (player commands only, Village on day 32), D-58 (wall 1 stone block, quarry 4 limestone)
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
