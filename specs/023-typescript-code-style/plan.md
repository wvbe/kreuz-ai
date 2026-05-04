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
