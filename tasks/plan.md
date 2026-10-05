# Implementation Plan: Kreuzvibe — playable, spec-complete, headless-first

## Overview

Build the game described by specs 001–029 (excluding the absent 008) as a **headless deterministic engine** (`src/game`) with **two interchangeable front-ends**: a **terminal/JSONL renderer** (`src/renderers/cli`) and the **React/Three.js renderer** (`src/renderers/react`). Everything a front-end can do goes through one narrow, serializable **command/query API** (`GameSession`). The whole game, from new game to settlement tiers, must be end-to-end testable with no browser, no timers, no network — both in-process (vitest) and as a real child process speaking JSONL over stdin/stdout.

Inputs: 28 specs (~840 KB), `docs/CONSTITUTION.md`, `docs/ROADMAP.md` (out of scope). Per-spec digests (FR lists, APIs, blockers, test scenarios) are in `tasks/spec-digests/NNN.md` — **implementers read the digest first, then the spec**.

> **State of the repo.** HEAD still contains an older ~6k-line implementation (commit `89f7e41`) that the owner has declared a failure ("it didn't work at all"). **Decision (owner, confirmed): greenfield. Keep nothing, port nothing, do not consult it.** Task 0.1 deletes it. Everything is written fresh from the specs.

## The headless contract (user requirement)

```
            ┌──────────────────────── src/game (no DOM, no timers, no Date/Math.random) ───────────────────────┐
 Command ──▶│ GameSession.dispatch(cmd) ─▶ command queue ─▶ tick pipeline (ordered systems) ─▶ GameState     │
 (JSON)     │ GameSession.step(n) / runUntil(pred, maxTicks)                                                 │
            │ GameSession.query.* ─▶ plain readonly JSON views      GameSession.events ─▶ typed event stream  │
            │ GameSession.save() / GameSession.load(json)                                                     │
            └─────────────────────────────────────────────────────────────────────────────────────────────────┘
                 ▲                       ▲                             ▲
      src/game/**/*.test.ts      src/renderers/cli (REPL + JSONL)   src/renderers/react (EngineHost owns the clock)
      (in-process e2e)           (child-process e2e)
```

- `Command` is a JSON discriminated union (enum `CommandKind`); every player action in spec 024 maps to one. Commands are queued and applied at a fixed point in the tick pipeline → deterministic, loggable, replayable.
- **Scenario = `{seed, options, [{tick, command}], assertions}`**. The same file drives: an in-process vitest e2e, the CLI (`--script`), and (later) a UI smoke test. This is also the Constitution-IV scenario library.
- **The clock lives outside the engine.** `engine.tick()` is the only primitive; `AutoRunner` (spec 001) and the React `EngineHost` are the only things allowed real timers.
- CLI renderer: `new`, `step N`, `run-until <cond>`, `map`, `inspect <id>`, `why <id>` (spec 025), `jobs`, `flow`, `order …`, `zone …`, `build …`, `save/load`, plus `--script file.jsonl` and raw JSONL command mode (`{"cmd":...}` in → `{"result":...,"events":[...]}` out). That JSONL stdio protocol *is* the "other API" for driving the game externally.

## Architecture decisions (to be ratified in `docs/DECISIONS.md`, Task 0.2)

| # | Decision | Rationale |
|---|----------|-----------|
| AD1 | Greenfield rebuild; old code deleted, not referenced or ported | Owner decision: it did not work at all |
| AD2 | Single facade `src/game/api/GameSession.ts`; renderers/tests import only it (+ read-only view types) | Spec 024 scatters ~25 queries/commands with no facade; Constitution I |
| AD3 | **No JS `async` in simulation.** Long-running behaviour = serializable task/step state machines + JSON behavior trees (013). `AsyncOperation`/`waitFor` of 003 are modelled as serialized task records | Spec 003 blocker: a JS async function cannot be resumed after load; Constitution II |
| AD4 | One explicit, ordered **tick pipeline** (`src/game/engine/TickPipeline.ts`): commands → time → needs/mood → AI/behaviour → pathing/movement → jobs/board → production/construction → zones → stockpile/trade → diplomacy → steward/orders → housing → tier check → event drain → chronicle. Intra-tick collisions (026 vs 029 both at tick-of-day 72) resolved by pipeline order | No spec defines it; determinism depends on it |
| AD5 | All state numbers are integers. Milli-units (×1000) default; percentages/mood/weights → permille; currency whole units (019 vs Constitution reconciled in DECISIONS) | Constitution II; spec 006 FR-014 |
| AD6 | PRNG: named streams `prng.stream(name)` get-or-create and persisted; 64-bit state serialized as two uint32 | 011 `derive()` vs FR-011 contradiction |
| AD7 | A\* tie-break is pure (lowest cell index), never the PRNG | 012 vs its SC-001 and 011 |
| AD8 | Registries/prototypes are **per-engine instances**, not global singletons; loaded from a JSON content pack validated by Zod; count minima are content-pack tests, not loader errors | 007 FR-014 isolation; lets a vertical-slice pack load before full 022 |
| AD9 | Voronoi/square geometry is a pure function of (map params, map seed) and is regenerated on load; saves keep `cells[].terrain` + params + `nextId` counters (adds missing ID counters to 006) | 004/006 gap |
| AD10 | Stack: TypeScript 5, Node ≥ 22, **vitest** (runner + coverage), **vite-node** (CLI/script runner, replaces tsx; not Node native type-stripping because enums are mandated), Zod, ESLint 9 flat, Prettier (existing config), Vite + React 19 + three/R3F for UI | 023 names no runner/TS runner |
| AD11 | 023 carve-outs: `unknown` allowed only at JSON/Zod/catch boundaries (`// eslint-disable` with reason); `.json` extension allowed for content imports; extra lint bans in `src/game`: `Date`, `Math.random`, `setTimeout/Interval`, DOM lib | 023 vs 022 conflicts; Constitution II |
| AD12 | Delivery is **vertical**: each phase ends with a headless e2e that a player-equivalent script can pass, in the terminal first | Skill guidance; fail fast |

## Spec conflicts that must be resolved before the affected task starts

Resolved by Task 0.2 (author proposes, owner approves — the only human gate before Phase 1). Source: digests §5.

1. **003** async/await vs persistence → AD3. **003 vs 006** prototypes serialized or not → not (content pack at startup).
2. **010** late-subscriber semantics (FR-011 vs US5.5), `tick.begin` timing, depth cap value; **011** stream API (AD6).
3. **006** ID counters, root key list (US1 vs FR-004a), version/migration scheme; **007** static vs instance `newGame`, FR-017 vs FR-002, drop `OutOfMemoryError`, "starting entity counts" removed; method names (`save/load`, `getTime`, `getEntity`).
4. **005** permission model (actor param), `canStore` example arithmetic, weight "tenths" vs ×1000, stack limit source of truth, money stack cap.
5. **017/016/019/020/021/027** shared posting fields: `wage`, `eligibility` predicate (adult-humanoid, hostile-faction, `unlockTier`), `posterFaction`, which board receives construction jobs, Town Crier for player jobs, completion event carrying worker+wage; "urgency" and familiarity (017 FR-007 strict order vs 020 additive affinity) → define one score; `skill.work.completed` emitters; reservation mechanism and exclusion of BuildSite/carried/reserved stock from 018 queries.
6. **014** cancel semantics (US8.3 vs FR-013a), material registry owner (005/014/022), recipe variants; **015** timing (immediate/next tick/within 1 tick), merge-confirm headless command, "Room" naming collision with 009 (rename 009's to `Site`/`MapRoom`).
7. **019** negotiation protocol (counter reply, timeout, atomicity), barter valuation; **021** standing deltas, leader succession, NPC faction seat location, envoy combat (descope: envoys can fail by timeout only), refund on failed dispatch.
8. **022** blockers: missing wall/door/job-board/town-crier/envoy prototypes, BT sub-tree references, gathering `outputs`/crop/season mechanics, `trading`/`preaching` skill effects vs 020, hunt/butcher/charity jobs, `mood` as non-need, zone furniture-requirement grammar, animal BTs.
9. **027** *Hamlet has no iron source ⇒ Village unreachable* (smelter/forge are Village-tier). **DECIDED (owner): Smelter/Forge stay at Village. Hamlet gets iron via trade:** it mines/gathers ore (add an ore source to Hamlet content), sells it to a trader, and may later buy refined iron. General, data-driven trader rule (019/021 amendment): each trader has content-defined `refines: {raw → refined, ratio}`; per-settlement ledger `refinedCredit[refined] += rawSold × ratio` (persisted in the trader/standing state, integer milli-units, **no expiry**; unbought refined stock stays stashed with the trader); the trader sells at most `refinedCredit` of that refined good and each purchase draws it down. 027 reachability validator (5.4) must prove Hamlet → ore source → sale → refined purchase → Village requirements. Also: 029 `dwelling` zone + level `unlockTier`s are missing from 027's table; Burgher House ≥ Market Town.
10. **028 vs 029** Arrived-as-Major floods chronicle (SC-005); SC-006 size budget (300 KB/200 journals) infeasible → raise to ~1 MB or compact journals; store seen-skills set.
11. **025** "report reasons" vs pure-derivation (FR-008): choose derivation (systems expose `explain()` providers) — simpler, no mutable state. **026** defaults for `maxOpenRunsPerOrder`, `maxStandingOrders`, `noticePostRadius`, `bellRadius`.
12. **024** missing: trade-policy command semantics (descope to a no-op preference or define), time-control commands, who drives ticks (EngineHost), touch support (descope), asset pipeline (procedural primitives, no external models).

## Dependency graph

```
Scaffold(0.1) ─▶ Decisions(0.2) ─┐
PRNG(011) ─▶ EventBus(010) ─▶ Time(001) ─▶ TickPipeline ─▶ ECS(003/002) ─▶ Tasks/BT runtime(003B/013)
                                   │                          │
                                   ├─▶ Map(004) ─▶ A*(012)    ├─▶ Inventory(005)
                                   └─▶ Save(006) ─▶ Bootstrap(007) ─▶ GameSession+Commands ─▶ CLI ─▶ e2e harness
Content loader(022-loader) ─▶ vertical-slice pack ─▶ MapGen(009+004 gens) ─▶ Skills/Traits(020) ─▶ Needs/AI(013)
JobBoard(017, hub) ─▶ Stockpiles(018) ─▶ Production(014) ─▶ Zones(015) ─▶ Construction(016) ─▶ Status(025)
Factions(021) ─▶ Trade(019) ; StandingOrders/Steward(026) ; Tiers(027) ─▶ Housing(029) ; Chronicle(028)
Full content(022) ‖ (parallel once loader + schemas stable)        React UI(024) after GameSession is stable
```

## Task List (detail in the sections below; checklist in `tasks/todo.md`)

### Phase 0 — Foundations
- [ ] 0.1 Clean slate + scaffold (023): package.json, tsconfigs, ESLint, vitest, vite-node, check scripts, README gates
- [ ] 0.2 `docs/DECISIONS.md`: resolve the cross-spec conflicts above (**human review gate**)
- [ ] 0.3 PRNG & seed (011)
- [ ] 0.4 Event bus (010)

### Phase 1 — Kernel + headless shell
- [ ] 1.1 Game time, tick primitive, AutoRunner, TickPipeline (001)
- [ ] 1.2 ECS: entities, components, prototypes, access helpers (003A, 002)
- [ ] 1.3 Task/step runtime + behavior-tree interpreter skeleton (003B, 013 core)
- [ ] 1.4 Map & terrain: square + Voronoi, adjacency, sub-maps/links (004)
- [ ] 1.5 Inventory (005)
- [ ] 1.6 Save format, migrations, round-trip (006)
- [ ] 1.7 Content loader + registries + vertical-slice pack v0 (022-loader, FR-018/019)
- [x] 1.8 GameEngine bootstrap + system registry (007)
- [x] 1.9 `GameSession` facade + `Command`/query/view types + command log/replay
- [x] 1.10 CLI renderer v0 + JSONL protocol + scenario runner (e2e harness)

### Checkpoint A — Kernel
- [x] Fresh clone: `npm run ci` green; `vite-node src/renderers/cli/main.ts` can new/step/save/load; same-seed determinism e2e passes in-process and via child process

### Phase 2 — A living world
- [ ] 2.1 Map generators: outdoor Voronoi, village layout, cave/cellar, quick room/site (004 gens, 009)
- [ ] 2.2 A\* pathfinding (012)
- [ ] 2.3 Skills & traits (020)
- [ ] 2.4 Needs, mood, utility+BT AI, movement (013)
- [ ] 2.5 Factions & membership core (021 FR-001..): government faction, citizen membership
- [ ] 2.6 Citizen identity: names/titles/styled names (028 identity part)

### Checkpoint B — Living world
- [ ] Spawned settlers wander, eat, rest, sleep, die/leave deterministically; CLI `map` shows them moving; 1k-tick soak passes

### Phase 3 — Economy
- [ ] 3.1 Job boards & claiming (017) incl. wage/eligibility/poster fields, Town Crier
- [ ] 3.2 Stockpiles & storage (018)
- [ ] 3.3 Production & crafting (014)
- [ ] 3.4 Zones & rooms (015)
- [ ] 3.5 Construction (016): build sites, walls/doors, blueprints
- [ ] 3.6 Status explanations & flow (025)

### Checkpoint C — Economy playable in terminal
- [ ] Scripted e2e: zone a farm + stockpile, build a bakery, bread produced, hauled, eaten; `why` explains every idle citizen

### Phase 4 — Society and progression
- [ ] 4.1 Trade & currency (019)
- [ ] 4.2 Diplomacy, envoys, standing (021 remainder)
- [ ] 4.3 Standing orders & Steward (026)
- [ ] 4.4 Settlement tiers, milestones, difficulty (027)
- [ ] 4.5 Dwellings & household upgrades (029)
- [ ] 4.6 Chronicle & journals (028 remainder)

### Checkpoint D — Game is complete headless
- [ ] Scripted e2e plays Hamlet → Village (and a Harsh-difficulty run); every spec FR has a covering test (traceability table, 6.2)

### Phase 5 — Content to full spec (parallelizable by category)
- [ ] 5.1 Terrain/materials/furniture content to 022 counts
- [ ] 5.2 Recipes, jobs, zones content
- [ ] 5.3 Humanoids/animals/skills/traits/needs/behaviors/factions/names content
- [ ] 5.4 Content-pack conformance test (counts, referential integrity, reachability per 027 FR-010)

### Phase 6 — React renderer (024)
- [ ] 6.1 Renderer shell: EngineHost (clock), store/hooks, Vite app, new-game/save/load screens
- [ ] 6.2 Map canvas: Voronoi/square tiles, camera, picking, entity primitives, overlays
- [ ] 6.3 Inspection panels + why-popover + citizen/journal tabs
- [ ] 6.4 Command UIs: build menu, zone/wall tools, job boards, standing orders, steward, directives, pending list
- [ ] 6.5 Views: content browser, flow, idle/blocked, chronicle, settlement progress, toasts
- [ ] 6.6 UI smoke tests (jsdom) driving a scenario through the same commands

### Phase 7 — Hardening
- [ ] 7.1 Scenario snapshot library (Constitution IV) + soak/perf success criteria
- [ ] 7.2 Spec traceability audit; docs (README, per-folder READMEs, CLI manual)

---

# Task details

Format: **Specs** · Deps · Scope (XS/S/M/L; anything L must be split during execution) · Acceptance · Verification. Common bar for every task = Definition of Done: lints clean, typecheck clean, co-located `*.test.ts` for every exported function (023 FR-013), TSDoc, folder README, JSON round-trip test for any new state (Constitution), `npm run ci` green.

## Phase 0

### 0.1 Clean slate + scaffold
**Specs 023, Constitution.** Deps none · M.
Remove the old `src/`, `scripts/`, configs; create the scaffold: `tsconfig.base.json`, `src/game/tsconfig.json` (no DOM lib; no reference to renderers), `src/renderers/tsconfig.json` (DOM, references game), root solution tsconfig; flat ESLint config implementing 023 FR-001..018 plus AD11 extras; vitest config with coverage; `scripts/check-readmes`, `scripts/check-conventions` (barrel/file-name/test-pairing); `package.json` scripts `build typecheck lint test test:coverage format:check check:readmes check:conventions ci`.
- [ ] A throwaway `src/game` file importing `src/renderers` fails both `tsc -b` and eslint (023 FR-018)
- [ ] Lint fixtures prove each 023 rule fires (default export, barrel, `interface`, `any`, `unknown`, one-line TSDoc, extension import) and `Date.now`/`Math.random` in `src/game` fire
- [ ] A folder without README fails `check:readmes`
- Verify: `npm run ci`; `npm run lint -- tests/style-fixtures`.

### 0.2 DECISIONS.md (human gate)
Deps 0.1 (parallel) · M (writing only, no code).
One entry per conflict in "Spec conflicts" above with the chosen resolution and the spec edits (errata) needed; update the specs' text where a decision changes normative behaviour (small PR-able diffs), plus the canonical tick-pipeline order, command catalogue (names), event catalogue (names + payloads), and fixed-point conventions table.
- [ ] Every numbered conflict has a decision or an explicit "defer to task X"
- [ ] Command & event catalogues exist (inputs to 1.9 and each system task)
- Verify: self-review against the conflict list. **Not an owner gate** (owner waived review); log decisions and proceed. Phase 1 may start once the catalogues exist; 0.3/0.4 can start immediately (conflict-free after AD6).

### 0.3 PRNG & seed (011)
Deps 0.1 · S–M. Files: `src/game/engine/Prng.ts`(+test).
- [ ] Same seed → identical sequences across 1e6 draws (golden vector committed)
- [ ] Named streams: `stream(name)` get-or-create, independent, serialized/restored mid-sequence exactly (JSON, no 64-bit number loss)
- [ ] No seed → generated once via injected entropy source; recorded
- Verify: `vitest Prng`.

### 0.4 Event bus (010)
Deps 0.3 · M. `EventBus.ts`.
- [ ] Typed string topics + type guards; sync vs tick-boundary delivery as per DECISIONS; depth cap enforced; deterministic subscriber order
- [ ] Queued events serialize and restore; subscriber registered after load receives restored events (per DECISIONS)
- Verify: spec-010 US scenarios as tests.

## Phase 1

### 1.1 Time & tick pipeline (001)
Deps 0.4 · M. `GameTime.ts`, `TickPipeline.ts`, `AutoRunner.ts`.
- [ ] 12 ticks/hour, 288/day; pause/speed enum commands; paused tick = no advance
- [ ] Systems register with explicit order; pipeline order test pins AD4 order
- [ ] `AutoRunner` is the only code using timers, tested with injected fake scheduler
- Verify: 1000 `tick()`s → expected day/hour; two engines same inputs → same state hash.

### 1.2 ECS & access (003A, 002)
Deps 1.1 · L → split: (a) entity/component store + ID counters + deletion; (b) prototypes/component schemas via Zod from content pack; (c) query helpers & relationships registry (name→field, direction, inverse).
- [ ] IDs never reused (counter persisted); components JSON-only; runtime add/remove; `hasComponent` guard narrows type
- [ ] Queries return stable ordering (by ID); relationship lookups work both directions
- [ ] 1k-entity query < 5 ms (007 SC-007)
- Verify: spec 002/003 scenarios.

### 1.3 Task/step runtime + BT interpreter core (003B, 013 core)
Deps 1.2 · L → split (a) task records + queue + priority/interrupt/cancel semantics per DECISIONS; (b) JSON behavior-tree interpreter (selector/sequence/condition/action, depth ≤ 5, sub-tree refs) with running-node state serialized.
- [ ] A multi-step task survives save → load mid-step and finishes identically to an uninterrupted run (byte-equal final state)
- [ ] Interrupt/cancel/priority matrix from spec 003 US as tests
- Verify: golden save-mid-task test. *This is the highest-risk item — do it first in Phase 1 (fail fast).*

### 1.4 Map & terrain (004)
Deps 1.1 · L → split (a) square map + adjacency + movement costs + terrain registry hook; (b) Voronoi geometry (seeded relaxation), adjacency graph; (c) sub-maps & links, map registry.
- [ ] Geometry deterministic from (params, seed), not saved (AD9); `neighbors(cell)` identical order on both kinds
- [ ] Terrain change events; per-terrain movement cost/passability from content
- Verify: golden hash of a 64×64 Voronoi map for seed 42.

### 1.5 Inventory (005)
Deps 1.2 · L. `Inventory.ts`, errors.
- [ ] store/retrieve/transfer with actor parameter + permission rules; capacity by weight/slots; stack limits from material registry; atomic transfers (all-or-nothing)
- [ ] Money as whole-unit stacks per DECISIONS; fractional-free arithmetic
- Verify: 005 scenarios incl. the corrected `canStore` example.

### 1.6 Save format (006)
Deps 1.2, 1.3, 1.4, 0.3, 0.4 · M. `SaveManager.ts`, `migrations/`.
- [ ] `save()`→string; `load()` validates (Zod), rejects invalid/newer, migrates older (fixture v0→v1 migration)
- [ ] Round-trip: `save(load(save(x))) === save(x)`; continue 500 ticks after load equals uninterrupted 500 ticks (state hash)
- [ ] Hand-edited save with unknown fields rejected/ignored per DECISIONS
- Verify: property-style test over a populated state.

### 1.7 Content loader + vertical-slice pack v0 (022 loader)
Deps 1.2 · M–L. `content/ContentLoader.ts`, `content/schemas/*`, `content/data/*.json`.
- [ ] Static JSON imports in fixed order; Zod per registry; decimals → milli at load (006 FR-014); referential integrity errors name the file+id
- [ ] Per-engine `ContentRegistries` (AD8); pack v0 = minimal terrain/material/need/skill/trait/humanoid/behavior set the kernel tests need
- Verify: invalid-pack fixtures each produce the expected error.

### 1.8 Engine bootstrap (007)
Deps 1.6, 1.7 · M. `GameEngine.ts`, `SystemRegistry.ts`, `options.ts`.
- [ ] `new GameEngine(content)`, `newGame(opts)` / `loadGame(save)` per DECISIONS; validation messages exact (007 US4); topo-sorted system init, cycle/missing-dep errors
- [ ] Failed load leaves current state untouched; two engines isolated; bootstrap < 100 ms
- Verify: all 007 scenarios.

### 1.9 GameSession facade + commands
Deps 1.8 · M–L. `src/game/api/{GameSession,Command,Views}.ts`.
- [ ] `dispatch(cmd)` returns `{ok,error?}`; command queue applied in pipeline slot 0; `commandLog` exportable; `replay(log)` reproduces identical state hash
- [ ] Views are plain readonly JSON (no engine object refs); `events` stream typed; time control commands
- [ ] Skeleton commands: `NewGame, Load, Save, Pause, Resume, SetSpeed, Step`; later phases register more via a command-handler registry (no giant switch)
- Verify: replay-equals-live test.

### 1.10 CLI renderer v0 + e2e harness
Deps 1.9 · M. `src/renderers/cli/{main,Repl,Jsonl,AsciiMap,ScenarioRunner}.ts`.
- [ ] `vite-node src/renderers/cli/main.ts --jsonl`: one JSON command per line in, one JSON result (+ events) per line out; `--script scenario.json` runs and exits non-zero on assertion failure
- [ ] Interactive REPL prints ASCII map and entity inspect
- [ ] Child-process e2e test: spawn CLI, pipe a scenario, assert stdout (no browser, no network)
- Verify: `npm run test` includes `e2e/cli.test.ts`.

**Checkpoint A** as listed above. Review with owner.

## Phase 2

### 2.1 Map generators (004 gens, 009)
Deps 1.4, 1.7 · L → split (a) outdoor Voronoi biomes/rivers/forests; (b) village layout; (c) cave/cellar; (d) quick room/site generator (009; rename "Room" per DECISIONS). `mapSize`→generator mapping defined in DECISIONS.
- [ ] Seed-stable golden maps; connectivity guaranteed (all spawn-reachable); starting position valid; size-scaled
- Verify: CLI `map` snapshot for seed 42 committed as golden.

### 2.2 A\* (012) — Deps 1.4 · M
- [ ] Pure tie-break; "no path" vs "already there" distinct result types; cost = terrain cost; blocked-cell/door handling; path cache invalidated on map-change events; deterministic on both map kinds
- Verify: 012 scenarios + 10k-random-pairs property (path valid, optimal vs brute-force Dijkstra on small maps).

### 2.3 Skills & traits (020) — Deps 1.7 · M
- [ ] Fixed-point XP/levels, registry-driven growth, speed formula, affinity score (single formula per DECISIONS), trait effect hooks; `skill.work.completed` event
- Verify: 020 scenarios; level-up determinism.

### 2.4 Needs, mood, AI, movement (013) — Deps 1.3, 2.2, 2.3 · XL → split (a) needs decay/thresholds with difficulty multiplier hook; (b) mood model (permille) + risk mapping; (c) utility scoring + role-derived priorities; (d) movement system following paths, per-tick step; (e) relationship/wealth context minimal; (f) content: BTs for human + animals.
- [ ] Settlers eat when hungry if food exists, sleep when tired, wander otherwise; starving → health consequences/death per content
- [ ] Decision < 5 ms/entity; per-entity decisions deterministic with seed
- Verify: scenario "10 settlers, 2 days, no jobs" stable and snapshot-equal across runs.

### 2.5 Factions core (021 part) — Deps 1.2 · M
- [ ] Government faction at bootstrap; membership derived; `Citizen.factions` change events (the missing hook per digest)
### 2.6 Citizen identity (028 part) — Deps 2.5 · S–M
- [ ] Name list generation, titles/styled names, `entity.deleted` carries last styled name

**Checkpoint B** — 1000-tick soak, determinism hash stable, save/load mid-soak identical.

## Phase 3

### 3.1 Job boards (017) — Deps 2.4 · XL → split (a) posting/board data + lifecycle + pause; (b) claim algorithm: priority > urgency > familiarity > distance, PRNG ties from a named stream; eligibility predicate; wage + poster fields; (c) Town Crier fleet delivering postings; (d) job-type content hooks; (e) system-pause vs player-pause.
- [ ] Job never double-claimed; abandoned/unreachable jobs released; claim order test table
- [ ] Event `jobboard.job.completed` carries worker, wage (feeds 019, 020)
### 3.2 Stockpiles (018) — Deps 3.1, 1.5 · L
- [ ] Zones route goods; tiered routing; fixed-point decay; reservation primitive; queries exclude BuildSite/carried/reserved stock; "locked chest" defined
### 3.3 Production (014) — Deps 3.1, 3.2, 2.3 · XL → split (a) recipe/order model + variants; (b) crafting progress/skill duration formula; (c) input locking/output placement; (d) cancel semantics per DECISIONS; (e) blocked-reason reporting hooks.
### 3.4 Zones (015) — Deps 1.4, 3.2 · L
- [ ] Grid-agnostic zones, furniture-requirement grammar, status events (`zone.requirements.*`), skill-derived affinity, headless merge/split commands
### 3.5 Construction (016) — Deps 3.1–3.4 · L → split (a) BuildSite entities + blueprint command; (b) construction jobs & materials delivery; (c) walls/doors occupying cells + path invalidation; (d) cancel/deconstruct.
- [ ] No double-claim of site work; materials reserved; completion spawns the entity and emits events
### 3.6 Status & flow (025) — Deps 3.1–3.5 · XL → split (a) `explain(subject)` derivation providers + `BlockedReasonKind`; (b) idle/blocked list; (c) per-day flow ledger (FlowSource) ; (d) CLI `why`, `flow` commands.
- [ ] Every non-working citizen has a primary reason (invariant checked in soak test)

**Checkpoint C** as listed.

## Phase 4

### 4.1 Trade (019) — Deps 2.5, 3.1, 3.2 · L: negotiation protocol per DECISIONS, wages payer, treasury rent, Greedy margin hook, barter; whole-unit currency; **trader refined-credit ledger** (conflict item 9): content `refines` entries, persisted per settlement/trader, no expiry, purchases bounded by credit.
- [ ] e2e: sell 10 ore → can buy exactly 10×ratio refined iron, not more; credit survives save/load and a 5000-tick wait; second sale adds to remaining credit
- Hamlet content gains an ore source (mine/gather job) in 5.x.
### 4.2 Diplomacy (021 rest) — Deps 4.1 · L: standing deltas/thresholds, envoy lifecycle (timeout failure only), gifts with refund rule, leader succession, labour gate.
### 4.3 Standing orders & Steward (026) — Deps 3.3, 3.2 · L: orders CRUD commands, run budget caps, Notice Post/Bell Tower routing (017 hooks), Steward review at its pipeline slot.
### 4.4 Tiers/milestones/difficulty (027) — Deps 3.x · M: check cadence, unlock table incl. 029 dwellings, reachability validator (Hamlet→Village fixed per DECISIONS), difficulty multipliers (decay/hostility only).
### 4.5 Housing (029) — Deps 4.4, 3.5 · L–XL → split (a) dwelling zone + level requirements; (b) evaluation/streaks & at-risk; (c) upgrade/downgrade + events; (d) settlers arriving (≤ 2/day, Arrived ≠ Major per DECISIONS).
### 4.6 Chronicle (028 rest) — Deps 4.4, 4.5 · M: moments, journals (bounded, seen-skill set), 200-entry chronicle, size budget per DECISIONS.

Each: acceptance = its spec's US scenarios as tests + commands registered in `GameSession` + CLI verb + one e2e scenario.

**Checkpoint D**: `scenarios/hamlet-to-village.json` passes via CLI `--script` with only player-level commands (no test-only hooks); `scenarios/harsh-survival.json` also passes.

## Phase 5 — Content (022)
Parallel, small PRs per category; each ends with the conformance test (5.4) green for its slice. Authoring order follows what Phases 3–4 needs first. Items flagged unauthored in 022 (walls, doors, boards, crier, envoy prototypes; hunt/butcher/charity jobs; crop/season mechanics; animal BTs) are authored here per DECISIONS.
- 5.4 asserts: counts ≥ 022 minima (86 materials, 59 recipes, 64 furniture, 39 zone types, 23 humanoids, 13 animals, 21 skills, 31 traits, 6 needs, 23 jobs, 21 terrains, 12 factions, 7 BTs, name list), all references resolve, every recipe producible from Hamlet (027 FR-010).

## Phase 6 — React UI (024)
Deps: `GameSession` API stable (after Checkpoint C at the earliest; recommended after D). The UI never imports anything but `GameSession` + view types; it owns no sim state. Voronoi picking via polygon hit-test; procedural primitives only; desktop-only. 6.6 uses vitest+jsdom (no real browser) to run the same scenario JSON through `EngineHost`, proving the UI path and CLI path hit identical engine behaviour. Optional manual/Playwright pass is out of the automated bar.

## Phase 7 — Hardening
7.1: scenario library (early economy, mid-game politics, late conflict, edge/failure) stored in `scenarios/*.json` with expected state-hash/metrics; perf SCs from specs (bootstrap <100 ms, queries <5 ms, per-entity AI <5 ms, tick budget at 200 citizens); 10k-tick soak with invariants (no NaN/non-integer state, no orphan refs, every idle citizen explained). 7.2: spec→test traceability (every FR id appears in a test name or `@covers` tag; script lists uncovered FRs), docs.

## Parallelisation
- Safe parallel: 0.3 ‖ 0.4 (after AD6); 1.4 ‖ 1.5 ‖ 1.7; 2.1 ‖ 2.3 ‖ 2.5; Phase 5 content packets; Phase 6 views once API frozen.
- Sequential spine: 1.2 → 1.3 → 1.6 → 1.8 → 1.9; 3.1 before 3.2–3.5; 4.4 before 4.5.
- Contract-first: command & event catalogues (0.2) are the shared contract for parallel agents.

## Risks and mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Resumable-task model (003) is the hardest design; wrong choice poisons all behaviour code | High | AD3; do 1.3 first with golden mid-task save test; no JS async in sim |
| Specs are under-specified/contradictory (see 12 conflict groups) | High | 0.2 decision gate; per-task "defer to DECISIONS"; errata committed to specs |
| 840 KB of spec ⇒ scope is huge (est. 40–60k LOC incl. tests/content/UI) | High | Vertical checkpoints; terminal playable at C; UI last; content parallel |
| Determinism regressions (iteration order, float math, hash-map order) | High | Integer-only lint bans, ordered pipeline, state-hash e2e on every checkpoint, replay-equals-live test |
| Hamlet→Village unreachable (027) | High | Fixed in DECISIONS; reachability validator in 5.4 |
| Lint rules (023) too strict for JSON/Zod boundaries | Med | AD11 carve-outs in 0.1 |
| Tick cost at scale (many agents × BT × A\*) | Med | Path cache, budgets in 7.1, spatial indices in 1.2c |
| Scenario/e2e brittleness from content tuning | Med | Assert on invariants and relative outcomes; golden hashes only for kernel scenarios |

## Owner decisions (interview, 2026-10-05) — all former open questions are closed
1. **Greenfield:** delete the old implementation, keep and consult nothing.
2. **Playable =** start a Hamlet in the terminal, place a farm and buildings, watch settlers work and eat, grow toward Village. Terminal first (Checkpoint C playable, D complete headless); React GUI last (Phase 6).
3. **Spec amendments allowed** when specs contradict each other or can't be built (incl. AD3: serializable step machines instead of spec 003's async/await). Each change is logged in `docs/DECISIONS.md`; **no owner review of DECISIONS.md is required** — task 0.2 is not a gate. Stop and ask only when a choice changes game rules in a way not covered above.
4. **Village reachability:** trade-ledger rule in conflict item 9 (general, data-driven, no expiry). Smelter/Forge stay at Village.
5. **Descoped (record in DECISIONS.md):** envoy combat (envoys fail only by timeout), touch support, trade-policy screen/command, external 3D models (GUI uses generated primitives).
6. **Out of scope:** everything in `docs/ROADMAP.md`.
7. Still mine to decide without asking: fixed-point handling of currency (default: keep ×1000 internally, display whole units) — logged in DECISIONS.md.
