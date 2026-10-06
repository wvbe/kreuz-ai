# Kreuzvibe

A headless, deterministic colony simulation set in 13th-century Europe. You start a hamlet of six settlers and grow it toward a village and beyond by placing zones, buildings and production orders; the settlers claim jobs from boards and do the work themselves. The engine runs without any UI (in Node or the browser); a terminal client and a React/Three.js client observe and control it.

## Status

- **Engine**: every spec 001 to 029 (there is no 008) is implemented headless in `src/game`. The checkpoints of `tasks/plan.md` are reached: playable in the terminal (Checkpoint C), Hamlet to Village and a Harsh run that survives ten days (Checkpoint D). 763 of 770 requirement ids are named by a test ([docs/FR-COVERAGE.md](docs/FR-COVERAGE.md)).
- **Clients**: the terminal REPL / JSONL client (`src/renderers/cli`) and the React client (`src/renderers/react`, spec 024) both run the same `GameSession` facade.
- **Descoped by owner decision**: envoy combat (envoys fail only by timeout), touch support, the trade-policy screen and command, external 3D models (the GUI draws generated primitives). See [docs/ROADMAP.md](docs/ROADMAP.md).
- **Not verified here**: browser frame rate and cold-start time need a real GPU and browser; the jsdom tests stub WebGL. Open follow-ups are collected in "Known gaps and follow-ups" at the top of [tasks/plan.md](tasks/plan.md).

## Quick start

Requires Node 24 or newer.

```sh
npm install
npm run cli          # interactive terminal shell: new 42 steady small, step 100, map, status, help
npm run cli:jsonl    # JSON lines on stdin/stdout, for other front-ends and scripts
npm run dev          # the browser app on the vite dev server (open the printed URL)
npm run build        # type-check (tsc -b) and build the browser app into dist/
npm run ci           # format check, typecheck, lint, README and convention checks, tests with coverage, build
npm run soak         # 10,000-tick soak on two seeds with invariants (about 40 s)
npm run perf         # the measurable success criteria of the specs against this machine
npm run fr-coverage  # regenerate docs/FR-COVERAGE.md (requirement ids named by tests)
```

Other scripts: `npm test` (vitest, all tests), `npm run test:coverage`, `npm run typecheck`, `npm run lint`, `npm run format` / `format:check`, `npm run check:readmes` and `npm run check:conventions` (the folder README and style gates of spec 023).

Run a scenario file: `npm run cli -- --script scenarios/checkpoint-c.json` (exit code 1 on the first failing step).

### Play in 5 minutes

[docs/PLAYING.md](docs/PLAYING.md) walks through the opening in the terminal: zones, fields, a bakery, production orders, then trade, diplomacy, tiers, homes, the chronicle and standing orders. Its first block is the command list of `scenarios/checkpoint-c.json`. In the browser, start a game on the New game screen; [docs/UI.md](docs/UI.md) describes the screens.

## Architecture

- **Headless engine** (`src/game`): no DOM, no timers, no `Date`, no `Math.random` (lint enforces it; `AutoRunner` is the one place with timers). All state is JSON with integer numbers (fixed-point milli-units). Systems register into one ordered tick pipeline. Folder tour: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [src/game/README.md](src/game/README.md).
- **One facade**: renderers and tests use `GameSession` (`src/game/api`): `dispatch(command)`, `step(n)`, `query.run(name, args)`, `events`, `save()` / `load()`, `stateHash()`, and a command log that replays into the identical state. Commands are queued and applied at a fixed slot of the next tick; queries return plain readonly JSON.
- **Renderers** (`src/renderers`): `cli` (REPL, JSONL protocol, scenario runner) and `react` (EngineHost owns the clock; no game state lives in React). Siblings do not depend on each other and may import only `src/game/api` for values.
- **Scenarios** (`scenarios/*.json`): `{name, seed, options?, steps[]}` end-to-end tests that drive the engine with player commands and assert queries and state hashes. The same file runs in-process, through the CLI process and, for Checkpoint C, through the React host.
- **Constitution rules** ([docs/CONSTITUTION.md](docs/CONSTITUTION.md)): the engine is decoupled from rendering; state is fully serializable and the same seed and commands give the same result; all randomness comes from one seeded PRNG (an unseeded game draws its seed once at bootstrap and records it in the save); development is headless first; scenarios guard against regressions; systems are modular. Saves must round-trip (`save(load(save(x))) === save(x)`) and a loaded game continues identically to an uninterrupted one.

## Testing

- **Unit tests** sit next to the code (`src/**/*.test.ts`, `*.test.tsx` for React under jsdom).
- **Integration** (`tests/integration`): multi-system behaviour, conformance tests per spec, determinism and save/load round trips, performance budgets.
- **End to end** (`tests/e2e`): `scenarios.test.ts` runs every file in `scenarios/` in-process (twice, for determinism); `cli.test.ts` spawns the CLI as a child process; `asciiMap.test.ts` compares golden maps.
- **Soak** (`tests/soak`): invariant checks over thousands of ticks; `npm run soak` runs 10,000 ticks, the CI variant 2,400 (about 20 s on a quiet machine, D-110).
- **Scripts** (`tests/scripts`): tests of the check and coverage scripts and the style fixtures.

Run a subset with vitest, for example `npx vitest run tests/e2e/scenarios.test.ts`, `npx vitest run src/game/jobs` or `npx vitest run -t "checkpoint"`. Refresh golden maps after an intentional rendering change with `npx vitest run -u tests/e2e/asciiMap.test.ts`. Wall-clock assertions in CI are the spec figure times 10 (D-114); the real budgets are judged by `npm run perf` ([docs/PERFORMANCE.md](docs/PERFORMANCE.md)). Full-suite timing is not recorded in the documents.

## Documents

- [docs/INDEX.md](docs/INDEX.md): a map of every document.
- [docs/CONSTITUTION.md](docs/CONSTITUTION.md): the principles every spec and implementation must follow.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): module map, tick pipeline, save format, how to extend.
- [docs/DECISIONS.md](docs/DECISIONS.md): design decisions, tick order, command and event catalogues, descopes.
- [docs/PLAYING.md](docs/PLAYING.md), [docs/CLI.md](docs/CLI.md), [docs/UI.md](docs/UI.md): playing, the terminal and JSONL protocol, the browser client.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md), [docs/FR-COVERAGE.md](docs/FR-COVERAGE.md), [docs/audit/](docs/audit/): measured budgets, requirement traceability, per-spec audit tables.
- [docs/ROADMAP.md](docs/ROADMAP.md): ideas without a spec, and what is descoped.
- [tasks/plan.md](tasks/plan.md), [tasks/todo.md](tasks/todo.md): the plan with its status, and the checklist.

## Specifications

The feature specifications in [specs/](specs/):

- [001-game-loop](specs/001-game-loop/spec.md) — Game Loop & Time Progression
- [002-entity-access](specs/002-entity-access/spec.md) — Entity Access & Query Helpers
- [003-ecs-architecture](specs/003-ecs-architecture/spec.md) — ECS Architecture & Entity Interaction API
- [004-map-terrain](specs/004-map-terrain/spec.md) — Game Map & Terrain System
- [005-inventory](specs/005-inventory/spec.md) — Inventory System
- [006-save-format](specs/006-save-format/spec.md) — Game State & Save Format
- [007-engine-bootstrap](specs/007-engine-bootstrap/spec.md) — GameEngine Bootstrap
- [009-quick-room-gen](specs/009-quick-room-gen/spec.md) — Quick Room Generator
- [010-event-bus](specs/010-event-bus/spec.md) — Event Bus System
- [011-prng-seed](specs/011-prng-seed/spec.md) — PRNG & Seed System
- [012-a-star-pathfinding](specs/012-a-star-pathfinding/spec.md) — A\* Pathfinding System
- [013-entity-ai-behavior](specs/013-entity-ai-behavior/spec.md) — Entity AI Behavior Architecture
- [014-production-crafting](specs/014-production-crafting/spec.md) — Production & Crafting System
- [015-zones-rooms](specs/015-zones-rooms/spec.md) — Zones & Rooms
- [016-construction](specs/016-construction/spec.md) — Construction System
- [017-job-work-prioritization](specs/017-job-work-prioritization/spec.md) — Job Work Prioritization System
- [018-stockpiles-storage](specs/018-stockpiles-storage/spec.md) — Stockpiles & Storage
- [019-trade-currency](specs/019-trade-currency/spec.md) — Trade System & Currency
- [020-skills-traits](specs/020-skills-traits/spec.md) — Skills & Traits
- [021-diplomacy-factions](specs/021-diplomacy-factions/spec.md) — Diplomacy & Factions
- [022-game-world-content](specs/022-game-world-content/spec.md) — Game World Content — 13th-Century European Setting
- [023-typescript-code-style](specs/023-typescript-code-style/spec.md) — TypeScript Code Style Convention
- [024-react-game-app](specs/024-react-game-app/spec.md) — React Game Application
- [025-status-explanations](specs/025-status-explanations/spec.md) — Status Explanations & Production Flow
- [026-standing-orders](specs/026-standing-orders/spec.md) — Standing Orders & Steward
- [027-settlement-tiers](specs/027-settlement-tiers/spec.md) — Settlement Tiers, Milestones & Difficulty
- [028-citizen-identity](specs/028-citizen-identity/spec.md) — Citizen Identity & Chronicle
- [029-housing-upgrades](specs/029-housing-upgrades/spec.md) — Dwellings & Household Upgrades
