# Research: TypeScript Code Style + React Game Application

**Date**: 2026-05-04 | **Spec**: 023, 024

## R-001: Voronoi Map Generation for Games

**Decision**: Use Fortune's algorithm (via d3-delaunay) to generate voronoi tessellations from random seed points, then apply Lloyd relaxation (2–3 iterations) for organic-looking cells.

**Rationale**: d3-delaunay is well-maintained, zero-dependency (operates on plain arrays), and produces both Voronoi and Delaunay dual graphs needed for neighbor lookups and pathfinding. The library works fully headlessly (no DOM required) which satisfies constitution principle III.

**Alternatives considered**:
- Custom Fortune's implementation → high effort, error-prone, no benefit
- Poisson disc sampling → produces uniform point distributions but requires additional voronoi step regardless
- Grid-based with noise → doesn't produce voronoi cells required by spec 024 FR-002

## R-002: Square-Tile Cave/Cellar Generation

**Decision**: Use cellular automata (4-5 rule) for cave maps and BSP (Binary Space Partitioning) for cellar/room-based sub-maps.

**Rationale**: Cellular automata produces natural-looking cave networks with a simple implementation. BSP produces structured room layouts appropriate for cellars and buildings. Both are deterministic given the seeded PRNG.

**Alternatives considered**:
- Drunkard's walk → produces narrow corridors, unsuitable for open caves
- Wave Function Collapse → over-engineered for the simple tile types needed
- Perlin noise thresholding → viable but cellular automata gives better connectivity control

## R-003: Village Layout Generation

**Decision**: Implement a constraint-based zone placer that: (1) identifies flat terrain voronoi cells, (2) places roads along Delaunay edges, (3) assigns zone types to cell clusters based on terrain affinity (e.g., farms on fertile, mines near rock).

**Rationale**: This produces coherent village layouts that respect terrain without requiring hand-placement. Using the dual Delaunay graph for roads gives natural-looking path networks between zones.

**Alternatives considered**:
- Random zone scattering → produces incoherent villages
- Template-based layouts → doesn't adapt to voronoi geography
- L-system growth → visually interesting but unpredictable for gameplay

## R-004: Terrain Painting Strategy

**Decision**: Multi-pass terrain assignment: (1) elevation from 2D simplex noise, (2) moisture from separate noise octave, (3) terrain type from elevation×moisture lookup table, (4) river carving along low-elevation paths, (5) resource spawning per terrain affinity.

**Rationale**: This Whittaker-diagram approach produces biome diversity from minimal configuration. Each pass is deterministic and independently testable. Rivers follow natural drainage paths rather than arbitrary placement.

**Alternatives considered**:
- Pure random per-cell → no spatial coherence
- Voronoi-plate tectonics simulation → too expensive for startup time budget
- Hand-authored biome maps → violates procedural generation requirement

## R-005: React + ThreeJS Integration

**Decision**: Use @react-three/fiber (R3F) as the React-ThreeJS bridge. The isometric camera is a custom `OrthographicCamera` positioned at a 45° azimuth and ~35° elevation (true isometric). Raycasting uses R3F's built-in `useThree` hooks.

**Rationale**: R3F is the de-facto standard for React+Three integration. It provides declarative scene graph composition, automatic disposal, and integrates with React's lifecycle. The built-in pointer event system handles raycasting without custom code.

**Alternatives considered**:
- Raw Three.js with React refs → manual lifecycle management, brittle
- Babylon.js → different paradigm, less React ecosystem support
- 2D Canvas (as in demo.html) → doesn't meet spec 024's "3D" and "isometric camera with rotate" requirements

## R-006: Engine-to-Renderer State Bridge

**Decision**: The engine exposes a `GameState` readonly snapshot after each tick. The React renderer subscribes via a `useGameLoop` hook that triggers React re-render on tick completion. Selection state lives in the renderer; game mutations go through a `CommandDispatcher` interface that the engine processes on the next tick.

**Rationale**: This maintains strict one-way data flow (engine → renderer) per constitution principle I, while allowing the renderer to issue commands without coupling. The hook-based subscription uses React's useSyncExternalStore for tear-free reads.

**Alternatives considered**:
- Direct engine mutation from UI → violates decoupling principle
- Redux/Zustand intermediate store → unnecessary layer when engine IS the store
- Web Workers → adds serialization overhead; defer to optimization phase

## R-007: TypeScript Project References Layout

**Decision**: Two tsconfig project references:
1. `src/game/tsconfig.json` — composite, emits declarations
2. `src/renderers/tsconfig.json` — references `src/game/`, cannot be referenced by game

Root `tsconfig.json` is references-only (no own files). ESLint `import/no-restricted-paths` additionally enforces that `src/game/**` cannot import from `src/renderers/**`.

**Rationale**: TypeScript project references provide compile-time boundary enforcement. The ESLint rule provides IDE-time feedback. Together they make it impossible to accidentally couple engine to renderer.

**Alternatives considered**:
- Monorepo with workspaces (npm/pnpm) → overhead for 2 packages; project references are lighter
- Single tsconfig with path aliases → no compile-time enforcement
- Separate repositories → too much friction for a single-developer project

## R-008: Content Search Performance (<200ms)

**Decision**: Pre-build a trie-based index of all content IDs and display names at load time. Search queries traverse the trie with prefix matching. For substring matching, also maintain a reverse-suffix trie. Index size for 300 entries is negligible (<50KB).

**Rationale**: A trie gives O(k) lookup where k is query length, easily meeting the 200ms requirement even for 1000+ entries. Building the index at startup amortizes the cost.

**Alternatives considered**:
- Linear scan with Array.filter → O(n) per keystroke; fine for 300 items but doesn't scale
- Fuse.js fuzzy search → adds dependency; fuzzy matching may confuse exact ID lookups
- Web Worker search → unnecessary given data size

**Revised decision**: Given only 300 entries, a simple `Array.filter` with case-insensitive `includes()` will comfortably meet 200ms. Defer trie to when registries exceed 1000 entries.

## R-009: Pathfinding on Voronoi Maps

**Decision**: A* pathfinding on the Delaunay dual graph (each voronoi cell is a node; Delaunay edges define neighbors). Heuristic: euclidean distance between cell centroids. Cost function considers terrain traversability.

**Rationale**: The Delaunay dual of a Voronoi diagram naturally encodes cell adjacency. A* on this graph is well-understood, efficient for ~1000 nodes, and works identically in headless and rendered contexts.

**Alternatives considered**:
- Navigation mesh → overkill for cell-based movement
- Dijkstra without heuristic → slower convergence; A* is trivially better
- Pre-computed flow fields → useful for many units; defer to optimization

## R-010: Map Generators — Diversity Requirements

The user requests "various distinct map generators so that the game world is rich." This resolves to:

1. **VoronoiOutdoorGenerator** — Main world map. 500–1000 voronoi cells. Biomes via elevation+moisture. Rivers, lakes, forests, mountains, plains, swamps. Starting village auto-placed.
2. **CaveGenerator** — Underground sub-maps. Square tiles 30×30. Cellular automata caverns with ore deposits and underground water.
3. **CellarGenerator** — Small 10×10 square-tile rooms beneath buildings. BSP room partitioning.
4. **VillageLayoutGenerator** — Operates ON the voronoi map. Places roads, assigns initial zones (town square, farms, workshops), spawns starting entities and furniture.
5. **TerrainPainter** — Shared utility. Assigns terrain types to cells based on noise-derived properties.

Each generator is deterministic (takes PRNG seed), produces a `TileMap` subtype, and is independently testable headlessly.

## R-011: Save/Load Format Integration

**Decision**: Use the save format defined in spec 006. The React renderer provides UI (save button, load file picker, auto-save interval setting) but delegates serialization to `SaveManager` in the engine.

**Rationale**: Keeps all state logic in the engine per constitution principles I and II. The renderer only triggers save/load commands.

## R-012: Code Style Migration (Spec 023)

**Decision**: Since the repository is essentially greenfield (no existing `src/` directory), spec 023 rules apply from the start. No migration is needed — all new code follows the rules directly.

**Key rules applied**:
- Named exports only (no default exports)
- No barrel files (no `index.ts` re-exports)
- `type` over `interface` for data shapes
- Native `enum` with `z.nativeEnum()` for Zod validation
- No `any` or `unknown` (use `z.infer<>` for schema-derived types)
- Co-located tests (`*.test.ts` adjacent to source)
- `README.md` in every folder
- TSDoc on all exports
- Identifiers ≥3 chars (exception: `id`, `x`, `y`, `z` for coordinates)
