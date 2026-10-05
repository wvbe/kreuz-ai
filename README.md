# Kreuzvibe

A headless, deterministic colony/settlement simulation set in 13th-century Europe, with a React/Three.js renderer. The engine runs without a UI (in Node or the browser); renderers observe and control it.

**Status**: foundations in place (scaffold, PRNG, event bus); engine under construction per [tasks/plan.md](tasks/plan.md). Run `npm install && npm run ci`.

## Play / drive it headlessly

No browser needed. The terminal renderer and the scenario runner drive the same `GameSession` facade the React app will use (details in [docs/CLI.md](docs/CLI.md)).

```sh
npm run cli                                  # interactive shell: new 42 steady small, step 100, map, status, help
npm run cli -- --jsonl                       # one JSON command or query per stdin line, one JSON response per stdout line
npm run cli -- --script scenarios/kernel-smoke.json   # run a scenario; exit code 1 on the first failing step
```

JSONL example (`printf '%s\n' ... | npm run -s cli -- --jsonl`): `{"kind":"new-game","options":{"seed":42,"mapSize":0}}`, `{"kind":"step","ticks":100}`, `{"query":"time"}`, `{"hash":true}`. Each response is `{"ok":true,"result":...,"events":[...]}` or `{"ok":false,"error":{"kind":...,"message":...},"events":[]}`.

Scenarios are JSON files in [scenarios/](scenarios/) (`{name, seed, options?, steps[]}` with command, step, assert, assertHash, saveLoad and replay steps). `npm test` runs all of them in-process and through a child process (`tests/e2e/`).

## Documents

- [docs/CONSTITUTION.md](docs/CONSTITUTION.md) — project principles that every spec and implementation must follow.
- [docs/CLI.md](docs/CLI.md) — terminal verbs, JSONL protocol and scenario format.
- [docs/ROADMAP.md](docs/ROADMAP.md) — ideas that have no spec yet.
- [specs/](specs/) — feature specifications:
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
