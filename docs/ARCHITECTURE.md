# Architecture

How `src/game` is put together and how to extend it. Everything here is taken from the folder READMEs and `docs/DECISIONS.md`; when they disagree with this file, they win. The principles behind it are in [CONSTITUTION.md](CONSTITUTION.md).

## Layers

```text
renderers (src/renderers/cli, src/renderers/react)   view + input only
        |  GameSession: dispatch(command), query.run(name, args), events, step, save/load
src/game/api        facade, command queue, command log, scenario runner
        |
src/game/engine     GameEngine host, TickPipeline, EventBus, Prng, ID counters
        |
src/game/<system>   one folder per system, each registered with engine.registerSystem(...)
```

- `src/game` imports nothing from `src/renderers`, has no DOM lib and no `Date`, `Math.random`, timers or `fetch` (lint and `tsc -b`). `AutoRunner` is the only file allowed timers.
- A renderer holds no game state. State comes out of queries (plain readonly JSON built from copies); changes go in as commands.
- The React client may import values only from `src/game/api`; other game modules are type-only imports.

## Module map of `src/game`

- **engine**: kernel pieces. The seeded PCG32 `Prng` with named, persisted streams, the typed `EventBus` with a FIFO queue drained at the tick boundary, `TickPipeline` (the single `tick()` primitive), `AutoRunner` (optional real-time driver behind an injected `Scheduler`), persisted never-reused `IdCounters`, fixed-point helpers, and `GameEngine`, the per-engine host with `newGame`, `loadGame`, `saveGame`, `tick` and `registerSystem`.
- **api**: the one facade renderers and tests use. `GameSession` wraps an engine and adds the command queue (applied at slot 1), the command log with replay into an identical state hash, the typed query methods, a bounded recent-event buffer, `defineCommand` / `defineQuery`, the content-browser queries and the scenario runner (`api/scenario`).
- **time**: the simulation clock (integer tick count, pause flag, speed settings, tick interval) and pure calendar helpers: 12 ticks per hour, 288 per day, 336 per year.
- **ecs**: entities, components, prototypes, queries and relationships. IDs are never reused, components are JSON-only, queries return a stable order (by id) and relationship lookups work in both directions.
- **task**: serializable task step machines (queue, priorities, interrupts, waits) in place of async functions, so a task survives save and load mid-step (D-01).
- **behavior**: JSON behavior trees: the DSL schema, loader checks and an interpreter whose running node is serialized.
- **map**: square and Voronoi maps, the terrain registry, sub-maps and links, and the derived occupant index. Voronoi geometry is a pure function of the map parameters and is regenerated on load.
- **pathfinding**: deterministic A\* over the map adjacency graph with a reachability cache; ties are broken by cell index, never by the PRNG.
- **worldgen**: deterministic map generators (outdoor, village layout, cave and cellar, quick site) and the starting settlement: village, board, six settlers, starting chest, wild animals.
- **inventory**: materials, stacked slots, weight, perishables, equipment, permissions, atomic transfers and money.
- **save**: the `GameState` root, canonical save and load, validation, migrations and the state hash.
- **content**: the content pack loader. Zod schemas, JSON data files, referential checks and the per-engine `ContentRegistries` (no global registries).
- **skills**, **factions**, **identity**: skills and traits with growth and affinity; factions, citizens, derived membership and leaders; names, derived titles, offices and styled names.
- **ai**: settler AI. Needs, mood, health, utility decisions among critical needs, the handlers of the behavior trees and the movement task. **roles** adds the handlers of the role trees, **fauna** the animals (senses, flee, graze and hunt handlers, products, the animal job executors).
- **jobs**, **crier**: job boards, postings, the claim order, wages and the job-type executor registry; the Town Crier fleet that carries player edits to the user-managed board.
- **storage**, **zones**, **production**, **gathering**, **construction**: reservations, stockpiles, tiered routing and hauling; zones and rooms with the furniture requirement grammar; workstations and production orders with the `craft.produce` job; farming, mining and quarrying with the crop plots; blueprints, placement validation, supply and build jobs, walls and doors.
- **trade**, **diplomacy**: the treasury and wages, travelling traders, negotiated atomic trades, the refined-credit ledger (D-13); NPC factions with standing, envoys, agreements, proposals and leader succession.
- **standing**, **settlement**, **housing**, **chronicle**: standing orders and the Steward; the tier ladder, unlock table and milestones; dwellings and household upgrades; moments, journals and the settlement chronicle.
- **status**: derived statuses with structured reasons from per-system providers, `explain` with cause chains, the Idle & Blocked list and the per-day flow ledger.

Each folder has its own README with the file list and rules (`npm run check:readmes` fails on a folder without one); [src/game/README.md](../src/game/README.md) is the index.

## The tick pipeline

`GameEngine.tick()` runs 21 slots in order, once per tick (`TickSlot` in `src/game/engine/TickPipeline.ts`, pinned to DECISIONS section 2 by a test). A system registers `{id, slot, order}`. While paused, slot 0 returns and nothing changes. Day systems fire when `tickOfDay` equals a constant of the content pack.

| Slot | Name | Work, and what registers there today |
| --- | --- | --- |
| 0 | Begin | pause check, `tick.begin`, flush the bus |
| 1 | Commands | apply queued commands in FIFO order (the kernel system of `api`) |
| 2 | Time | `tickCount += 1` |
| 3 | Decay | perishable decay and expiry (`inventory.decay`) |
| 4 | NeedsAndMood | need decay, mood, health and starvation (`ai.needs`, the fauna system) |
| 5 | AiDecision | utility choice and behavior-tree step (`ai.decision`) |
| 6 | TaskExecution | one step of the highest-priority task per entity, ascending id |
| 7 | JobBoards | claims, recurring re-posts, crier delivery (`jobs`, `crier`) |
| 8 | ProductionAndConstruction | orders to postings, site completion (`production`, `construction`) |
| 9 | Zones | room and requirement evaluation, `zone.*` events |
| 10 | StockpileTradeTreasury | haul postings, offers, ledger, wages (`storage`, `trade`) |
| 11 | Diplomacy | envoys, standing, NPC AI, trader visits (`diplomacy`, `trade.visits`) |
| 12 | World | crop growth (`gathering`) |
| 13 | HousingDay | the seven-step dwelling evaluation (`housing`) |
| 14 | StewardDay | Steward review, bell rings (`standing`) |
| 15 | TierDay | tier check at the first tick of a day (`settlement`) |
| 16 | IdentityMaintenance | reserved by the table; no system registers here in the code today |
| 17 | Removal | deferred entity deletions and reference clean-up (`entities.removal`) |
| 18 | Status | evaluate status subjects, `status.*` events (`status`) |
| 19 | LedgerRollover | flow ledger day roll (`status`) |
| 20 | Drain | `processQueue()`; event-driven systems (identity, chronicle, milestones, skill growth, journals) run inside their handlers |

Rules from DECISIONS section 2: event handlers run in slot 20 and may nest events (depth cap 16); entities flagged for deletion are skipped by slots 4 to 8 and removed at slot 17; housing precedes the Steward on the same tick of day.

## Save format

`saveGame` returns canonical text (sorted keys, integers only, no `-0` or NaN); the engine does no file I/O. The same state gives the same string; only the host-injected `timestamp` differs. Details: [src/game/save/README.md](../src/game/save/README.md) and DECISIONS D-05 and D-36.

- Root keys: `version`, `timestamp`, `time`, `prng`, `eventQueue`, `initOptions`, `counters`, `systems`, `statuses`, `productionLedger`, `stewardship`, `entities`, `maps`. `counters` holds the ID counters; `systems` holds one entry per system without an owning entity (reservations, board back-off, command queue, trader visits and so on).
- Systems add their own root keys or `systems.<key>` entries through `SaveSectionRegistry` without editing the save module. A registered section must be present in current-version saves.
- Unknown root keys, unknown `systems` entries and unknown component fields reject the load; `initOptions` alone ignores unknown fields. A newer version is rejected, an older one migrated (`migrations/`, currently `0 -> 1`). A failed load leaves the running game untouched.
- Prototypes, registries and map geometry are not saved: the content pack is supplied to the engine and Voronoi geometry is regenerated from the map parameters.
- Round trip: `save(load(save(x))) === save(x)`, and a loaded game continues identically to an uninterrupted one (`stateHash`, command-log replay).

## Catalogues

- Commands: DECISIONS section 3 (by area: session and time, construction, zones and storage, production, job boards, trade, diplomacy, standing orders, identity). Commands are queued and applied at slot 1, so a result appears after the next step. The registered kinds are the ones the systems pass to `registerSystem`; the CLI `help` and [CLI.md](CLI.md) show the verbs over them.
- Events: DECISIONS section 4, grouped by system.
- Queries: DECISIONS section 5 summarises the facade; the registered names are the keys of `queries` in each `register*.ts` file, and each folder README names its own.
- Errors: `ApiErrorKind` strings (D-39) for dispatch failures; semantic refusals are accepted, queued and reported as `command.rejected` when applied (D-110).

## How to add

### A system

Call `engine.registerSystem({...})` before the first game (details in [src/game/engine/README.md](../src/game/engine/README.md)):

```ts
engine.registerSystem({
  id: "needs.decay", // unique, dotted lowercase; also the dependency name
  slot: TickSlot.NeedsAndMood, // with `run`
  order: 0, // inside the slot
  run: (context) => {}, // once per tick
  dependencies: ["world.starting-map"], // init order
  init: ({ engine, mode, options }) => {}, // NewGame and LoadGame
  components: [needsComponent],
  saveSection: { key, location, schema, serialize, restore },
  commandHandlers: {},
  queries: {},
});
```

Everything is validated before anything changes. `init` runs after the world is reset (`NewGame`: put generators here) or after all saved state is restored (`LoadGame`: rebuild derived indexes). Task and behavior handlers are registered directly on `engine.taskHandlers` and `engine.behaviorHandlers` before the first game. Put the registration in a `register<Name>.ts` in the system's folder, call it from the `GameEngine` constructor, add a folder README, add a JSON round-trip test for new state and, for new rules, a scenario or integration test.

### A command and a query

No file in `api` changes ([src/game/api/README.md](../src/game/api/README.md)). In the system's registration pass `commandHandlers` built with `defineCommand({schema, handler})` (strict Zod schema of the payload without `kind`; the handler validates, changes state or throws to reject; `mode: CommandMode.Immediate` applies at dispatch instead of queueing) and `queries` built with `defineQuery({schema, run})` that return readonly JSON built from copies. Then add the verb or panel that uses them: a CLI verb ([src/renderers/cli/verbs/README.md](../src/renderers/cli/verbs/README.md): a file per group, add it to `verbGroups`, test through `executeReplLine`, add a line to [CLI.md](CLI.md)) or a React panel ([UI.md](UI.md)). Add the command to the catalogue in DECISIONS section 3.

### A job type

1. Add the record to `src/game/content/data/jobs.json` (dot-namespaced id, skill, wage, priority, zone context).
2. Register an executor with `registerJobType(engine, typeId, executor)` from `src/game/jobs/jobExecutor.ts`, or build one with `createWorkAtLocationExecutor` for a walk-and-work job. An executor may carry a `cancel` hook that runs before the claim is released. Register it from the owning system's `register*.ts` (see `craft.produce` in `production`, `haul.deliver` in `storage`).
3. Post it to a board with `postJob` (system postings go to their board at once; player edits go through a Town Crier).
4. A job type without an executor must be listed in `deferredJobTypeIds` with a reason, or the test over `findUnhandledJobTypes` fails (`jobs/jobCoverage.ts`).

### A content entry

Content is JSON in `src/game/content/data/`, loaded by static imports in the fixed order of `ContentFile`, validated per file by Zod (`content/schemas`), converted from authored decimals to fixed point and checked for dangling references (the error names the file, record id and field). To add an entry: edit the data file, extend the schema if a new field is needed, and run the conformance tests (`tests/integration/worldContentPack.test.ts`, `contentConformance022.test.ts`, `src/game/content/contentTypes.test.ts`): counts at least the spec 022 minima, every recipe input has a source or is declared in [content-crossrefs-5.4.md](content-crossrefs-5.4.md), tier reachability from Hamlet to Village. Ids are lowercase snake_case. New furniture needs its build definition and unlock tier; new recipes the tier of their workstation (D-121). Tier reachability is a corpus check, not a loader error (D-15, D-16).

### A scenario

Add `scenarios/<name>.json` (format in [CLI.md](CLI.md)); `tests/e2e/scenarios.test.ts` picks every file up. Use player commands only, assert invariants and relative outcomes, and use `assertHash` only to compare two points of the same run (D-110).
