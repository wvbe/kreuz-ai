# Implementation Plan: TypeScript Code Style + React Game Application

**Branch**: `023-game-world-content` | **Date**: 2026-05-04 | **Spec**: [023-typescript-code-style/spec.md](../023-typescript-code-style/spec.md), [024-react-game-app/spec.md](../024-react-game-app/spec.md)
**Input**: Combined plan for code style enforcement, full game engine, React renderer, and map generation.

## Summary

This plan delivers a playable colony simulation in the browser. It restructures the repository according to spec 023's code style rules (`src/game/` for the engine, `src/renderers/react/` for the UI), implements the core game engine systems (ECS, game loop, pathfinding, jobs, needs, behavior trees, map, inventory), multiple map generators (voronoi outdoor, square-tile indoor, cave systems), and the React/ThreeJS front-end specified in spec 024.

## Technical Context

**Language/Version**: TypeScript 5.4+, strict mode, ES2022 target
**Primary Dependencies**: React 18+, Three.js (via @react-three/fiber), Zod 3.23+, Vitest 3+
**Storage**: Browser File System Access API (save/load), JSON serialization
**Testing**: Vitest (co-located `.test.ts`), headless scenario snapshots
**Target Platform**: Desktop modern browsers (Chrome/Firefox/Safari)
**Project Type**: Browser game application (SPA) with headless-first engine
**Performance Goals**: 60fps map rendering with 50 entities, <5s cold start, <200ms search
**Constraints**: No server; engine cannot import renderer; deterministic via seeded PRNG
**Scale/Scope**: ~50 live entities, 500–1000 voronoi tiles, 12 content registries with 300+ entries

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Engine-Renderer Decoupling | ✅ PASS | `src/game/` has zero renderer imports; enforced by tsconfig references + linter |
| II. Deterministic State & JSON Serialization | ✅ PASS | All state serializable; PRNG-seeded world gen |
| III. Headless-First Development | ✅ PASS | Engine + all game systems testable without browser |
| IV. Integration Testing via Scenario Snapshots | ✅ PASS | Scenario test library planned in Phase 4 |
| V. Modular Game Systems | ✅ PASS | ECS architecture with independent systems |

No violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/023-typescript-code-style/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output

specs/024-react-game-app/
├── spec.md              # React app specification
└── checklists/
```

### Source Code (repository root)

```text
src/
├── game/                          # Headless game engine (spec 023 FR-017)
│   ├── README.md
│   ├── tsconfig.json              # Project reference (engine)
│   ├── engine/                    # Core engine: ECS, game loop, PRNG, event bus
│   │   ├── README.md
│   │   ├── GameLoop.ts
│   │   ├── GameLoop.test.ts
│   │   ├── EntityManager.ts
│   │   ├── EntityManager.test.ts
│   │   ├── ComponentRegistry.ts
│   │   ├── ComponentRegistry.test.ts
│   │   ├── EventBus.ts
│   │   ├── EventBus.test.ts
│   │   ├── Prng.ts
│   │   ├── Prng.test.ts
│   │   ├── SaveManager.ts
│   │   └── SaveManager.test.ts
│   ├── systems/                   # Game systems: AI, jobs, needs, pathfinding, etc.
│   │   ├── README.md
│   │   ├── PathfindingSystem.ts
│   │   ├── NeedSystem.ts
│   │   ├── JobSystem.ts
│   │   ├── BehaviorTreeSystem.ts
│   │   ├── InventorySystem.ts
│   │   ├── ConstructionSystem.ts
│   │   ├── ProductionSystem.ts
│   │   └── FactionSystem.ts
│   ├── map/                       # Map data structures and generators
│   │   ├── README.md
│   │   ├── TileMap.ts             # Abstract tile map interface
│   │   ├── SquareTileMap.ts       # Square-grid implementation
│   │   ├── VoronoiTileMap.ts      # Voronoi polygon implementation
│   │   ├── MapLink.ts             # Parent/sub-map linking
│   │   └── generators/
│   │       ├── README.md
│   │       ├── VoronoiOutdoorGenerator.ts   # Main world: biomes, rivers, terrain
│   │       ├── CaveGenerator.ts             # Underground cave sub-maps
│   │       ├── CellarGenerator.ts           # Small square-tile cellars
│   │       ├── VillageLayoutGenerator.ts    # Places roads, zones, buildings
│   │       └── TerrainPainter.ts            # Assigns terrain types to tiles
│   ├── content/                   # Content registries and loaders
│   │   ├── README.md
│   │   ├── ContentLoader.ts
│   │   ├── Registry.ts
│   │   ├── schemas/
│   │   └── data/
│   └── scenarios/                 # Snapshot scenario tests
│       ├── README.md
│       └── early-colony.json
├── renderers/                     # All rendering targets (spec 023 FR-017)
│   ├── README.md
│   ├── tsconfig.json              # Project reference (renderers → game)
│   └── react/                     # React + ThreeJS renderer
│       ├── README.md
│       ├── App.tsx
│       ├── main.tsx
│       ├── hooks/                 # React hooks for game state
│       │   ├── README.md
│       │   ├── useGameLoop.ts
│       │   ├── useEntitySelection.ts
│       │   └── useContentSearch.ts
│       ├── map/                   # ThreeJS map rendering
│       │   ├── README.md
│       │   ├── IsometricCamera.tsx
│       │   ├── TileRenderer.tsx
│       │   ├── EntityRenderer.tsx
│       │   └── RaycastSelector.tsx
│       ├── panels/                # Inspection and command panels
│       │   ├── README.md
│       │   ├── InspectionPanel.tsx
│       │   ├── CommandPanel.tsx
│       │   ├── InventoryPanel.tsx
│       │   └── ContentBrowser.tsx
│       ├── tools/                 # Build and zone tools
│       │   ├── README.md
│       │   ├── BuildMenu.tsx
│       │   ├── FurniturePlacer.tsx
│       │   ├── ZoneDrawer.tsx
│       │   └── WallPlacer.tsx
│       └── ui/                    # Shared UI components
│           ├── README.md
│           ├── Breadcrumb.tsx
│           └── LinkedEntity.tsx
├── tsconfig.json                  # Root tsconfig with references
├── package.json
└── vite.config.ts
```

**Structure Decision**: Two TypeScript projects (`src/game/`, `src/renderers/`) enforcing one-way dependency via project references. Engine is fully headless; React renderer consumes engine state via imported APIs. Vite bundles the renderer for browser delivery.

## Complexity Tracking

No constitution violations. Table omitted.

## Spec-to-Implementation Mapping

All 24 specs are organized into 6 implementation phases. Each phase produces a working, testable increment. Specs within a phase may be implemented in parallel where marked.

### Phase A: Project Scaffolding (spec 023)

| Spec | Delivers | Files |
|------|----------|-------|
| 023 TypeScript Code Style | package.json, tsconfigs, ESLint, Prettier, Vitest, folder structure, READMEs | Root configs + `src/game/`, `src/renderers/react/` skeletons |

**Checkpoint**: `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass on skeleton project.

---

### Phase B: Engine Kernel (specs 011, 001, 010, 003, 006)

These are the lowest-level engine primitives. Everything else depends on them.

| Spec | Delivers | Depends On |
|------|----------|------------|
| 011 PRNG & Seed | `Prng.ts` — deterministic seeded random | Phase A |
| 001 Game Loop | `GameLoop.ts` — tick system, time progression | 011 |
| 010 Event Bus | `EventBus.ts` — typed pub/sub with string routing | Phase A |
| 003 ECS Architecture | `EntityManager.ts`, `ComponentRegistry.ts` — pure-data entities, system functions | 001, 010 |
| 006 Save Format | `SaveManager.ts` — JSON serialize/deserialize full state | 003 |

**Implementation order**: 011 → 001 → 010 (parallel with 001) → 003 → 006

**Checkpoint**: Can create entities, tick the game loop, emit events, save/load state to JSON. All headless.

---

### Phase C: World Foundation (specs 004, 009, 012, 002)

Maps, terrain, pathfinding, and entity queries.

| Spec | Delivers | Depends On |
|------|----------|------------|
| 004 Map & Terrain | `TileMap.ts`, `VoronoiTileMap.ts`, `SquareTileMap.ts`, terrain types | 003, 011 |
| 009 Quick Room Gen | Map generators: cave, cellar, village layout | 004 |
| 012 A* Pathfinding | `PathfindingSystem.ts` — A* on cell adjacency graphs | 004 |
| 002 Entity Access | Query helpers: `getEntitiesInCell()`, `getEntitiesByComponent()` | 003, 004 |

**Implementation order**: 004 → 009 (parallel with 012) → 012 → 002

**Checkpoint**: Can generate voronoi + square maps, place entities, pathfind between cells. All headless.

---

### Phase D: Game Systems (specs 005, 013, 014, 015, 016, 017, 018, 019, 020, 021)

The gameplay systems. Many can be built in parallel since they operate independently on the ECS state.

| Spec | Delivers | Depends On |
|------|----------|------------|
| 005 Inventory | `InventorySystem.ts` — item stacks, capacity, transfer | 003 |
| 013 Entity AI Behavior | `BehaviorTreeSystem.ts` — two-layer async model | 003, 012 |
| 017 Job Work Prioritization | `JobSystem.ts` — job boards, claiming, priority | 003, 010 |
| 014 Production & Crafting | `ProductionSystem.ts` — recipes, stations, outputs | 005, 017 |
| 015 Zones & Rooms | Zone system: define, activate, deactivate | 004, 017 |
| 016 Construction | `ConstructionSystem.ts` — build queue, placement | 005, 015 |
| 018 Stockpiles & Storage | Storage zones, hauling jobs | 005, 015, 017 |
| 019 Trade & Currency | Trade system, merchant entities, pricing | 005, 021 |
| 020 Skills & Traits | Skill system, trait effects on behavior | 003 |
| 021 Diplomacy & Factions | Faction system, disposition, diplomacy | 003, 010 |

**Parallel tracks** (after Phase C):
- Track 1: 005 → 014 → 016 → 018
- Track 2: 013 → 017
- Track 3: 020, 021 (independent of each other)
- Track 4: 015 (after 004 + 017)
- Track 5: 019 (after 005 + 021)

**Checkpoint**: Full headless simulation running: entities have needs, claim jobs, craft items, pathfind, store goods, trade. All testable without UI.

---

### Phase E: Content Data (spec 022)

Load the 13th-century content catalog into the engine.

| Spec | Delivers | Depends On |
|------|----------|------------|
| 022 Game World Content | Content registry, JSON data files (87 materials, 55 recipes, 55 furniture, 28 zones, 23 humanoids, 21 skills, etc.) | All of Phase D (schemas reference game systems) |

**Checkpoint**: `ContentLoader` loads all 12 registries, cross-validates references, all tests pass.

---

### Phase F: React Renderer (spec 024)

The browser UI. Implemented LAST per constitution (headless-first).

| Spec | Delivers | Depends On |
|------|----------|------------|
| 024 React Game App | ThreeJS isometric map, inspection panels, command UI, build tools, content browser, save/load | All engine systems (Phases B–E) |

Sub-phases within Phase F:
1. **F1**: Vite + React + R3F setup, `GameProvider`, `useGameLoop`
2. **F2**: Map rendering (voronoi tiles, entities, isometric camera)
3. **F3**: Entity selection + inspection panels
4. **F4**: Government commands + pending state
5. **F5**: Build tools (furniture placement, zone drawing, walls/doors)
6. **F6**: Content browser + search
7. **F7**: Save/load UI + auto-save

**Checkpoint**: Playable game in the browser with all features from spec 024.

---

### Phase G: Integration & Polish

| Task | Purpose |
|------|---------|
| Scenario snapshot library | Constitution IV compliance |
| Cross-system integration tests | Verify full game loop with all systems |
| Performance profiling | 60fps with 50 entities on voronoi map |
| 007 Engine Bootstrap | `GameEngine.create()` / `GameEngine.load()` — ties it all together |

---

## Implementation Order Summary

```
Phase A: 023 (scaffolding)
   ↓
Phase B: 011 → 001 → 010 → 003 → 006
   ↓
Phase C: 004 → 009, 012 → 002
   ↓
Phase D: 005, 013, 017, 020, 021 → 014, 015 → 016, 018, 019
   ↓
Phase E: 022 (content data)
   ↓
Phase F: 024 (React app)
   ↓
Phase G: 007 (bootstrap) + integration tests + polish
```

## Post-Design Constitution Re-Check

| Principle | Post-Design Status |
|-----------|-------------------|
| I. Engine-Renderer Decoupling | ✅ Renderer (Phase F) is always last; engine phases B–E have zero browser deps |
| II. Deterministic State & JSON | ✅ Save format (006) is in Phase B; all systems must serialize |
| III. Headless-First | ✅ Phases B–E produce a fully playable headless game before any UI |
| IV. Scenario Snapshots | ✅ Phase G includes snapshot library |
| V. Modular Systems | ✅ Each spec is an independent system module with typed contracts |

No gate failures.
