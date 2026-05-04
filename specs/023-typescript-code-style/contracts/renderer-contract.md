# Renderer Contract

The React renderer (`src/renderers/react/`) consumes the engine API and provides the player-facing UI. This document defines the renderer's own internal contracts.

## React Component Tree

```
<App>
  <GameProvider engine={gameInstance}>      ← context provider with engine state
    <Layout>
      <MapCanvas />                         ← ThreeJS canvas (@react-three/fiber)
      <SidePanel>
        <InspectionPanel />                 ← shows selected entity/tile
        <CommandPanel />                    ← government commands
        <ContentBrowser />                  ← searchable content catalogue
      </SidePanel>
      <Toolbar>
        <BuildMenu />                       ← furniture placement
        <ZoneTools />                       ← zone drawing, walls, doors
        <GameControls />                    ← play/pause/speed
        <SaveLoadControls />                ← save/load UI
      </Toolbar>
    </Layout>
  </GameProvider>
</App>
```

## Hook Contracts

### useGameLoop

```typescript
export function useGameLoop(): {
  state: Readonly<GameState>
  tick: number
  isPaused: boolean
  speed: number
  play(): void
  pause(): void
  step(): void
  setSpeed(multiplier: number): void
}
```

### useEntitySelection

```typescript
export function useEntitySelection(): {
  selectedId: string | null
  selectedEntity: EntityView | null
  selectedCell: CellView | null
  select(entityId: string): void
  selectCell(mapId: string, cellId: number): void
  deselect(): void
  history: string[]         // navigation history for back button
  goBack(): void
}
```

### useContentSearch

```typescript
export function useContentSearch(): {
  query: string
  setQuery(q: string): void
  results: SearchResult[]
  selectedRegistry: string | null
  setRegistryFilter(registryId: string | null): void
}

export type SearchResult = {
  registryId: string
  entryId: string
  displayName: string
  matchField: string
}
```

### useMapNavigation

```typescript
export function useMapNavigation(): {
  currentMapId: string
  breadcrumb: MapInfo[]
  navigateToSubMap(mapId: string): void
  navigateUp(): void
}
```

### useBuildTool

```typescript
export function useBuildTool(): {
  activeTool: BuildToolType | null
  selectedFurniture: string | null
  validCells: number[]
  activate(tool: BuildToolType, furnitureTypeId?: string): void
  deactivate(): void
  confirm(cellId: number): void
}

export type BuildToolType = "furniture" | "zone" | "wall" | "door"
```

## State Flow

```
Engine (headless)            React Renderer
─────────────────           ────────────────
GameState ──subscribe()───→ useGameLoop hook
                           ↓
                           React re-render
                           ↓
Player input ←─────────── CommandInput
                           ↓
dispatch(cmd) ←─────────── useBuildTool / CommandPanel
                           ↓
Next tick processes cmd     UI shows pending state
```

## Map Rendering Contract

The ThreeJS map renderer receives cell and entity data through the engine's MapQuery interface and renders:

| Data | ThreeJS Representation |
|------|----------------------|
| VoronoiCell | ExtrudeGeometry from polygon vertices, colored by terrain |
| SquareTile | PlaneGeometry 1×1, colored by terrain |
| Colonist entity | Low-poly mesh or capsule geometry with color by faction |
| Animal entity | Smaller mesh with type-specific shape |
| Furniture entity | Box/cylinder geometry matching furniture type |
| Wall segment | Thin box on tile edge |
| Door | Thin box with pivot animation |
| Zone highlight | Transparent overlay on zone cells |
| Selection | Outline effect on selected entity/cell |

## Performance Contracts

- Frustum culling: only render cells within camera view + 1 cell buffer
- Entity instancing: use InstancedMesh for entities of same prototype
- Maximum re-render: 60fps target; throttle game ticks independently of render
- Content search: <200ms response with simple filter (no Web Worker needed for 300 entries)
