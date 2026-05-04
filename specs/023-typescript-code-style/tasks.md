# Tasks: Kreuzvibe Full Implementation

**Input**: Design documents from `/specs/023-typescript-code-style/` (master plan covering all 24 specs)
**Prerequisites**: plan.md, spec.md (023 + 024), research.md, data-model.md, contracts/

**Tests**: Each engine system requires co-located unit tests (FR-013). Scenario snapshots required (Constitution IV).

**Organization**: Tasks organized by implementation phase per plan.md. Engine phases (B–E) are organized by spec/system rather than user story. Phase F (renderer) is organized by spec 024 user stories.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label for Phase F tasks (maps to spec 024 user stories)

---

## Phase 1: Project Scaffolding (Spec 023)

**Purpose**: Establish project structure, tooling, and code style enforcement.

- [ ] T001 Initialize package.json with pnpm, type:module, and dev dependency placeholders in package.json
- [ ] T002 Create tsconfig.base.json with shared compiler options (strict, ES2022, NodeNext, composite) in tsconfig.base.json
- [ ] T003 [P] Create root tsconfig.json with project references to src/game and src/renderers/react in tsconfig.json
- [ ] T004 [P] Create src/game/tsconfig.json extending tsconfig.base.json (composite engine project) in src/game/tsconfig.json
- [ ] T005 [P] Create src/renderers/react/tsconfig.json extending tsconfig.base.json with jsx:react-jsx and references:[../../game] in src/renderers/react/tsconfig.json
- [ ] T006 Install TypeScript, ESLint 9, @typescript-eslint, eslint-plugin-import-x, eslint-plugin-barrel-files, eslint-plugin-jsdoc, eslint-plugin-tsdoc, eslint-config-prettier, Prettier, Vitest, Zod, React, @react-three/fiber, three via pnpm
- [ ] T007 Create eslint.config.ts with typescript-eslint strict+stylistic, projectService:true, all FR rules (no-default-export, barrel-files, consistent-type-definitions, no-explicit-any, naming-convention, import-x/no-restricted-paths, jsdoc/require-jsdoc, tsdoc/syntax) in eslint.config.ts
- [ ] T008 [P] Create prettier.config.js with project formatting rules in prettier.config.js
- [ ] T009 [P] Create vitest.config.ts with multi-project setup (game:node, react:jsdom) and coverage config in vitest.config.ts
- [ ] T010 [P] Create scripts/check-readmes.sh that verifies every folder in src/ has a README.md in scripts/check-readmes.sh
- [ ] T011 Add package.json scripts: test, test:watch, lint, lint:fix, typecheck, format, format:check, check-readmes, dev, build in package.json
- [ ] T012 [P] Create all folder READMEs: src/game/, src/game/engine/, src/game/systems/, src/game/map/, src/game/map/generators/, src/game/content/, src/game/content/schemas/, src/game/content/data/, src/game/scenarios/, src/renderers/, src/renderers/react/, src/renderers/react/hooks/, src/renderers/react/map/, src/renderers/react/panels/, src/renderers/react/tools/, src/renderers/react/ui/
- [ ] T013 [P] Create vite.config.ts for React renderer dev server and production build in vite.config.ts

**Checkpoint**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` all pass on skeleton.

---

## Phase 2: Engine Kernel (Specs 011, 001, 010, 003, 006)

**Purpose**: Core engine primitives that all game systems depend on.

**⚠️ CRITICAL**: No game system work can begin until this phase is complete.

### Spec 011 — PRNG & Seed

- [ ] T014 Implement seeded PRNG with deterministic number generation (Mulberry32 or similar) in src/game/engine/Prng.ts
- [ ] T015 [P] Write tests for PRNG determinism: same seed produces same sequence, different seeds diverge in src/game/engine/Prng.test.ts

### Spec 001 — Game Loop

- [ ] T016 Implement tick-based game loop that advances simulation state by one tick in src/game/engine/GameLoop.ts
- [ ] T017 [P] Write tests for game loop: tick counter increments, systems are called in order, deterministic replay in src/game/engine/GameLoop.test.ts

### Spec 010 — Event Bus

- [ ] T018 [P] Implement typed event bus with string-based hierarchical routing, typed payloads, and type guards in src/game/engine/EventBus.ts
- [ ] T019 [P] Write tests for event bus: subscribe/emit/unsubscribe, hierarchical matching, typed payload narrowing in src/game/engine/EventBus.test.ts

### Spec 003 — ECS Architecture

- [ ] T020 Implement EntityManager: create/destroy entities, add/remove components, pure data storage in src/game/engine/EntityManager.ts
- [ ] T021 [P] Implement ComponentRegistry: register component types, typed access to component data in src/game/engine/ComponentRegistry.ts
- [ ] T022 Write tests for entity lifecycle: create, add components, query, destroy in src/game/engine/EntityManager.test.ts
- [ ] T023 [P] Write tests for component registry: register, type-safe access, version tracking in src/game/engine/ComponentRegistry.test.ts

### Spec 006 — Save Format

- [ ] T024 Implement SaveManager: serialize full GameState to JSON, deserialize and reconstruct state in src/game/engine/SaveManager.ts
- [ ] T025 Write tests for save/load round-trip: state in → JSON → state out equals original in src/game/engine/SaveManager.test.ts

**Checkpoint**: Can create entities with components, tick the loop, emit events, save/load to JSON. All headless.

---

## Phase 3: World Foundation (Specs 004, 009, 012, 002)

**Purpose**: Map data structures, terrain generation, pathfinding, and entity spatial queries.

### Spec 004 — Map & Terrain

- [ ] T026 Implement abstract TileMap type and MapType enum in src/game/map/TileMap.ts
- [ ] T027 Implement VoronoiTileMap: cells, Delaunay adjacency, bounds, terrain assignment in src/game/map/VoronoiTileMap.ts
- [ ] T028 [P] Implement SquareTileMap: grid tiles, 4-connected adjacency, wall edges in src/game/map/SquareTileMap.ts
- [ ] T029 [P] Implement MapLink: parent/sub-map linking, entrance cell tracking in src/game/map/MapLink.ts
- [ ] T030 Write tests for voronoi map: cell count, adjacency correctness, bounds in src/game/map/VoronoiTileMap.test.ts
- [ ] T031 [P] Write tests for square map: grid dimensions, adjacency, wall edges in src/game/map/SquareTileMap.test.ts

### Spec 009 — Map Generators

- [ ] T032 Implement VoronoiOutdoorGenerator: random seed points, Lloyd relaxation, biome assignment via elevation+moisture in src/game/map/generators/VoronoiOutdoorGenerator.ts
- [ ] T033 [P] Implement TerrainPainter: assigns terrain types to cells based on elevation and moisture in src/game/map/generators/TerrainPainter.ts
- [ ] T034 [P] Implement CaveGenerator: cellular automata on square grid, flood-fill connectivity in src/game/map/generators/CaveGenerator.ts
- [ ] T035 [P] Implement CellarGenerator: BSP room subdivision on square grid in src/game/map/generators/CellarGenerator.ts
- [ ] T036 Implement VillageLayoutGenerator: places roads, zone seeds, and initial structures on voronoi map in src/game/map/generators/VillageLayoutGenerator.ts
- [ ] T037 Write tests for outdoor generator: deterministic output for same seed, cell count within range, valid adjacency in src/game/map/generators/VoronoiOutdoorGenerator.test.ts
- [ ] T038 [P] Write tests for cave generator: connectivity, floor ratio within tolerance in src/game/map/generators/CaveGenerator.test.ts
- [ ] T039 [P] Write tests for cellar generator: room count, doors between rooms in src/game/map/generators/CellarGenerator.test.ts

### Spec 012 — A* Pathfinding

- [ ] T040 Implement A* pathfinding on cell adjacency graphs (4-connected square, Delaunay voronoi) with traversability check in src/game/systems/PathfindingSystem.ts
- [ ] T041 Write tests: shortest path on square grid, path around obstacles, unreachable returns empty, voronoi path in src/game/systems/PathfindingSystem.test.ts

### Spec 002 — Entity Access & Queries

- [ ] T042 Implement entity query helpers: getEntitiesInCell, getEntitiesByComponent, getEntitiesByTag, getEntitiesInMap in src/game/engine/EntityQueries.ts
- [ ] T043 Write tests for entity queries: spatial lookup, component filter, tag filter, empty results in src/game/engine/EntityQueries.test.ts

**Checkpoint**: Can generate voronoi + square maps, place entities on cells, pathfind between cells, query entities by location/component. All headless.

---

## Phase 4: Game Systems (Specs 005, 020, 021, 013, 017, 014, 015, 016, 018, 019)

**Purpose**: All gameplay systems. Many can be built in parallel.

### Spec 005 — Inventory System

- [ ] T044 [P] Implement InventorySystem: add/remove items, transfer between entities, capacity checks, stack limits in src/game/systems/InventorySystem.ts
- [ ] T045 [P] Write tests for inventory: add item, overflow, transfer, capacity enforcement in src/game/systems/InventorySystem.test.ts

### Spec 020 — Skills & Traits

- [ ] T046 [P] Implement SkillSystem: skill levels, experience gain, level-up logic in src/game/systems/SkillSystem.ts
- [ ] T047 [P] Implement TraitSystem: trait application, effect modifiers on entity behavior in src/game/systems/TraitSystem.ts
- [ ] T048 [P] Write tests for skills: experience accumulation, level threshold, modifier calculation in src/game/systems/SkillSystem.test.ts
- [ ] T049 [P] Write tests for traits: trait effects applied, stacking, removal in src/game/systems/TraitSystem.test.ts

### Spec 021 — Diplomacy & Factions

- [ ] T050 [P] Implement FactionSystem: faction creation, membership, disposition tracking, diplomatic actions in src/game/systems/FactionSystem.ts
- [ ] T051 [P] Write tests for factions: disposition change, membership join/leave, diplomatic directives in src/game/systems/FactionSystem.test.ts

### Spec 013 — Entity AI & Behavior Trees

- [ ] T052 Implement BehaviorTreeSystem: two-layer async model (async/await high-level, tick-driven state machines low-level) in src/game/systems/BehaviorTreeSystem.ts
- [ ] T053 Implement behavior tree node types: Sequence, Selector, Condition, Action, Wait in src/game/systems/BehaviorNodes.ts
- [ ] T054 Write tests for behavior tree: sequence execution, selector fallback, condition gating, async task resolution over ticks in src/game/systems/BehaviorTreeSystem.test.ts

### Spec 017 — Job Work Prioritization

- [ ] T055 Implement JobSystem: job boards, job posting, claiming logic, priority scoring, work progress in src/game/systems/JobSystem.ts
- [ ] T056 Write tests for job system: post job, entity claims highest priority, work progress increments, completion in src/game/systems/JobSystem.test.ts

### Spec 014 — Production & Crafting

- [ ] T057 Implement ProductionSystem: recipe execution at stations, input consumption, output production, skill requirements in src/game/systems/ProductionSystem.ts
- [ ] T058 Write tests for production: recipe inputs consumed, outputs created, skill check gates production in src/game/systems/ProductionSystem.test.ts

### Spec 015 — Zones & Rooms

- [ ] T059 Implement ZoneSystem: zone creation from cell sets, type assignment, furniture requirement tracking, activation lifecycle in src/game/systems/ZoneSystem.ts
- [ ] T060 Write tests for zones: create zone, incomplete→active transition, pause/resume, furniture requirement in src/game/systems/ZoneSystem.test.ts

### Spec 016 — Construction

- [ ] T061 Implement ConstructionSystem: build queue, placement validation, material consumption, construction progress in src/game/systems/ConstructionSystem.ts
- [ ] T062 Write tests for construction: queue item, validate placement, consume materials, progress to completion in src/game/systems/ConstructionSystem.test.ts

### Spec 018 — Stockpiles & Storage

- [ ] T063 Implement StockpileSystem: storage zones, hauling job generation, item assignment to stockpiles in src/game/systems/StockpileSystem.ts
- [ ] T064 Write tests for stockpiles: item deposited, capacity respected, hauling job created when items on ground in src/game/systems/StockpileSystem.test.ts

### Spec 019 — Trade & Currency

- [ ] T065 Implement TradeSystem: merchant entities, trade offers, price calculation, currency exchange in src/game/systems/TradeSystem.ts
- [ ] T066 Write tests for trade: merchant arrives, offer generated, trade executed, currency transferred in src/game/systems/TradeSystem.test.ts

### Need System (cross-cutting, required by AI)

- [ ] T067 Implement NeedSystem: need decay per tick, satisfaction from actions, threshold-based urgency in src/game/systems/NeedSystem.ts
- [ ] T068 Write tests for needs: decay over ticks, satisfaction raises value, urgency thresholds in src/game/systems/NeedSystem.test.ts

**Checkpoint**: Full headless simulation: entities have needs, claim jobs, craft items, pathfind, store goods, trade, join factions. All testable without UI.

---

## Phase 5: Content Data (Spec 022)

**Purpose**: Load the 13th-century content catalog and validate all cross-references.

- [ ] T069 Implement ContentLoader: loads JSON data files, validates against Zod schemas, populates registries in src/game/content/ContentLoader.ts
- [ ] T070 [P] Implement Registry base class: generic typed registry with get, getAll, search, has, count in src/game/content/Registry.ts
- [ ] T071 [P] Create Zod schemas for all 12 content types (materials, skills, needs, terrain, traits, furniture, zones, factions, jobs, recipes, behaviorTrees, entityPrototypes) in src/game/content/schemas/
- [ ] T072 Create materials JSON data files: raw-resources.json, processed-goods.json, finished-goods.json, food-and-drink.json, currency.json in src/game/content/data/materials/
- [ ] T073 [P] Create recipes JSON data files: wood-processing.json, metal-processing.json, tools-and-equipment.json, weapons-and-armor.json, textiles.json, leather.json, stonework.json, food-and-drink.json, miscellaneous.json in src/game/content/data/recipes/
- [ ] T074 [P] Create furniture JSON data files: workstations.json, storage.json, comfort-and-living.json, religious.json, utility-and-decorative.json in src/game/content/data/furniture/
- [ ] T075 [P] Create zones JSON data files: production.json, storage-and-utility.json, living-and-social.json, religious.json, military.json, open-air.json in src/game/content/data/zones/
- [ ] T076 [P] Create entity prototype JSON data files: humanoids.json, livestock.json, wild-animals.json in src/game/content/data/entities/
- [ ] T077 [P] Create single-file JSON data: skills.json, traits.json, needs.json, jobs.json, terrain.json in src/game/content/data/
- [ ] T078 [P] Create factions JSON data files: guilds.json, religious.json, political.json in src/game/content/data/factions/
- [ ] T079 [P] Create behavior tree JSON data files: colonist-daily.json, worker.json, merchant.json, animal.json, guard.json, priest.json, idle.json in src/game/content/data/behavior-trees/
- [ ] T080 Write tests for ContentLoader: all registries load, cross-references valid, no duplicate IDs, schema validation catches bad data in src/game/content/ContentLoader.test.ts
- [ ] T081 [P] Write tests for Registry: get, search, has, count, missing ID returns undefined in src/game/content/Registry.test.ts

**Checkpoint**: `ContentLoader` loads all 12 registries, cross-validates references, all tests pass.

---

## Phase 6: Engine Bootstrap (Spec 007)

**Purpose**: Tie all systems together into the public GameEngine API.

- [ ] T082 Implement GameEngine.create(): initialize PRNG, load content, generate map, spawn initial entities in src/game/engine/GameEngine.ts
- [ ] T083 Implement GameEngine.load(): deserialize save data, reconstruct full state in src/game/engine/GameEngine.ts
- [ ] T084 Implement GameInstance.tick(): advance all systems in correct order (needs → AI → jobs → movement → production → events) in src/game/engine/GameEngine.ts
- [ ] T085 Implement GameInstance.dispatch(): process player commands, validate, enqueue in src/game/engine/GameEngine.ts
- [ ] T086 Implement GameInstance.subscribe(): state change notifications for renderer in src/game/engine/GameEngine.ts
- [ ] T087 Write tests for GameEngine: create new game, tick produces state changes, save/load round-trip, dispatch command in src/game/engine/GameEngine.test.ts

**Checkpoint**: `GameEngine.create()` produces a playable game state; `tick()` advances simulation; `save()`/`load()` work end-to-end.

---

## Phase 7: React Renderer — Map & Inspection (Spec 024, US1) 🎯

**Goal**: Player sees isometric map and can click-to-inspect any entity.

**Independent Test**: Load saved game with 50 entities, click entity, verify inspection panel shows correct live data.

- [ ] T088 [US1] Create GameProvider context: wraps GameInstance, exposes state via React context in src/renderers/react/hooks/GameProvider.tsx
- [ ] T089 [US1] Implement useGameLoop hook: state subscription, tick counter, play/pause/speed controls in src/renderers/react/hooks/useGameLoop.ts
- [ ] T090 [US1] Create App.tsx with layout: MapCanvas + SidePanel + Toolbar in src/renderers/react/App.tsx
- [ ] T091 [US1] Create main.tsx entry point with Vite HMR, GameEngine initialization in src/renderers/react/main.tsx
- [ ] T092 [US1] Implement IsometricCamera: orthographic projection, rotate/pan/zoom via mouse+touch in src/renderers/react/map/IsometricCamera.tsx
- [ ] T093 [US1] Implement TileRenderer: renders voronoi polygons as 3D extruded meshes with terrain colors in src/renderers/react/map/TileRenderer.tsx
- [ ] T094 [US1] Implement EntityRenderer: low-poly 3D representations for colonists, animals, furniture on map in src/renderers/react/map/EntityRenderer.tsx
- [ ] T095 [US1] Implement RaycastSelector: click-to-select entity or tile via ThreeJS raycasting in src/renderers/react/map/RaycastSelector.tsx
- [ ] T096 [US1] Implement useEntitySelection hook: selection state, navigation history, select/deselect in src/renderers/react/hooks/useEntitySelection.ts
- [ ] T097 [US1] Implement InspectionPanel: shows entity state (needs, skills, inventory, task, factions, traits) with live updates in src/renderers/react/panels/InspectionPanel.tsx
- [ ] T098 [US1] Implement LinkedEntity component: clickable links to related entities/jobs/zones/materials in src/renderers/react/ui/LinkedEntity.tsx
- [ ] T099 [US1] Implement useMapNavigation hook: sub-map navigation, breadcrumb state in src/renderers/react/hooks/useMapNavigation.ts
- [ ] T100 [US1] Implement Breadcrumb component: shows current map context, back navigation in src/renderers/react/ui/Breadcrumb.tsx
- [ ] T101 [US1] Implement frustum culling: only render tiles and entities within camera view in src/renderers/react/map/TileRenderer.tsx

**Checkpoint**: Map renders, entities visible, click opens inspection panel with live data, links navigate.

---

## Phase 8: React Renderer — Government Commands (Spec 024, US2)

**Goal**: Player can issue commands that affect simulation behavior.

**Independent Test**: Pause bakery job board, verify no new claims, resume, verify claims resume.

- [ ] T102 [US2] Implement CommandPanel: lists available commands, pending commands with status in src/renderers/react/panels/CommandPanel.tsx
- [ ] T103 [US2] Implement dispatch UI: pause/resume board, diplomatic directives, trade policy in src/renderers/react/panels/CommandPanel.tsx
- [ ] T104 [US2] Implement pending command display: show dispatched entity progress, estimated arrival in src/renderers/react/panels/CommandPanel.tsx
- [ ] T105 [US2] Implement cancel command: button to cancel pending commands before completion in src/renderers/react/panels/CommandPanel.tsx

**Checkpoint**: Player can pause/resume job boards, issue diplomatic commands, see pending state.

---

## Phase 9: React Renderer — Build Tools (Spec 024, US3 + US4)

**Goal**: Player can place furniture, draw zones, place walls and doors.

**Independent Test**: Place forge in smithy zone, verify job board starts posting. Draw zone, assign type, verify activation.

- [ ] T106 [US3] Implement BuildMenu: lists furniture types from registry, selects for placement in src/renderers/react/tools/BuildMenu.tsx
- [ ] T107 [US3] Implement FurniturePlacer: placement ghost, snap to tile, valid/invalid highlighting, confirm on click in src/renderers/react/tools/FurniturePlacer.tsx
- [ ] T108 [US3] Implement useBuildTool hook: active tool state, valid cells, confirm/cancel actions in src/renderers/react/hooks/useBuildTool.ts
- [ ] T109 [US4] Implement ZoneDrawer: paint tiles to define zone region, zone type picker in src/renderers/react/tools/ZoneDrawer.tsx
- [ ] T110 [US4] Implement WallPlacer: tile-edge wall placement, rectangle drag tool, door placement in src/renderers/react/tools/WallPlacer.tsx

**Checkpoint**: Furniture placement works end-to-end; zone drawing creates active zones; walls block pathing.

---

## Phase 10: React Renderer — Content Browser & Inventory (Spec 024, US5 + US6)

**Goal**: Player can browse all content registries and inspect inventories.

**Independent Test**: Search "bread" in content browser, find recipe, click input material, navigate to material record.

- [ ] T111 [US5] Implement ContentBrowser: tabs/filters for all 12 registries, live text search in src/renderers/react/panels/ContentBrowser.tsx
- [ ] T112 [US5] Implement useContentSearch hook: query state, result filtering across registries in src/renderers/react/hooks/useContentSearch.ts
- [ ] T113 [US5] Implement cross-reference links: recipe→materials, material→recipes, job→skill, etc. in src/renderers/react/panels/ContentBrowser.tsx
- [ ] T114 [US6] Implement InventoryPanel: shows items, quantities, capacity for inventory-enabled entities in src/renderers/react/panels/InventoryPanel.tsx

**Checkpoint**: Content browser searches across all registries; inventory panel updates in real time.

---

## Phase 11: React Renderer — Save/Load & Polish (Spec 024)

**Goal**: Player can save/load games. Application is complete and polished.

- [ ] T115 Implement SaveLoadControls: save to file, load from file picker, auto-save interval in src/renderers/react/ui/SaveLoadControls.tsx
- [ ] T116 [P] Implement GameControls: play/pause/speed buttons in toolbar in src/renderers/react/ui/GameControls.tsx
- [ ] T117 Verify cold start performance: application loads to playable state within 5 seconds
- [ ] T118 Verify rendering performance: 50 entities at stable 60fps during camera movement

**Checkpoint**: Full playable game in the browser with all spec 024 features.

---

## Phase 12: Integration & Scenario Tests

**Purpose**: Constitution IV compliance. Cross-system integration validation.

- [ ] T119 Create early-colony scenario snapshot: 10 colonists, basic production chains, verify replay determinism in src/game/scenarios/early-colony.test.ts
- [ ] T120 [P] Create mid-game scenario snapshot: 30 colonists, multiple zones, active trade, faction tensions in src/game/scenarios/mid-game.test.ts
- [ ] T121 [P] Create stress scenario: 50 entities, all systems active, verify no state corruption over 1000 ticks in src/game/scenarios/stress.test.ts
- [ ] T122 Run full typecheck, lint, test, format-check across entire codebase and verify zero errors
- [ ] T123 Run quickstart.md validation: follow setup steps from scratch, verify working game

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Scaffolding)
  ↓
Phase 2 (Engine Kernel): 011→001→010→003→006
  ↓
Phase 3 (World): 004→009,012→002
  ↓
Phase 4 (Game Systems): parallel tracks
  ↓
Phase 5 (Content Data): 022
  ↓
Phase 6 (Bootstrap): 007
  ↓
Phases 7–11 (Renderer): sequential sub-phases
  ↓
Phase 12 (Integration)
```

### Phase 4 Parallel Tracks

- **Track 1**: T044–T045 (Inventory) → T057–T058 (Production) → T061–T062 (Construction) → T063–T064 (Stockpiles)
- **Track 2**: T052–T054 (AI/Behavior) → T055–T056 (Jobs)
- **Track 3**: T046–T049 (Skills & Traits) — independent
- **Track 4**: T050–T051 (Factions) — independent
- **Track 5**: T059–T060 (Zones) — after Jobs (T055)
- **Track 6**: T065–T066 (Trade) — after Inventory + Factions
- **Track 7**: T067–T068 (Needs) — after ECS only

### Renderer Phase Order (7→11)

- Phase 7 (Map + Inspection): foundation for all UI
- Phase 8 (Commands): after Phase 7
- Phase 9 (Build Tools): after Phase 7
- Phase 10 (Content Browser): after Phase 7
- Phase 11 (Save/Load): after all above

Phases 8, 9, 10 can be done in parallel after Phase 7 is complete.

---

## Implementation Strategy

### MVP First

1. Phases 1–3 (T001–T043): Scaffolding + engine kernel + world = runnable headless simulation with entities on a generated map
2. Add Phase 4 core (Inventory + Jobs + AI + Needs): entities with behavior
3. Add Phase 6 (Bootstrap): `GameEngine.create()` ties it together
4. Add Phase 7 (Map rendering): visual feedback in browser
5. **STOP and DEMO**: Entities moving on a rendered map with click-to-inspect

### Full Delivery

Continue through Phases 8–12 for complete game experience.

### Task Count per Phase

| Phase | Tasks | Cumulative |
|-------|-------|-----------|
| 1 Scaffolding | 13 | 13 |
| 2 Engine Kernel | 12 | 25 |
| 3 World Foundation | 18 | 43 |
| 4 Game Systems | 25 | 68 |
| 5 Content Data | 13 | 81 |
| 6 Bootstrap | 6 | 87 |
| 7 Map & Inspection | 14 | 101 |
| 8 Commands | 4 | 105 |
| 9 Build Tools | 5 | 110 |
| 10 Content Browser | 4 | 114 |
| 11 Save/Load & Polish | 4 | 118 |
| 12 Integration | 5 | 123 |
| **Total** | **123** | |
