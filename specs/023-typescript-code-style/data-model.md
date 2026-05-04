# Data Model: Game Engine + React Renderer

**Date**: 2026-05-04 | **Specs**: 023, 024

## Core Engine Entities

### Entity (ECS base)

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique entity identifier (UUID) |
| prototype | `string` | Reference to prototype ID from content registry |
| components | `Map<ComponentType, ComponentData>` | All attached components |
| tags | `Set<string>` | Fast-lookup tags (e.g., "colonist", "furniture") |

### Component Types

| Component | Fields | Entities |
|-----------|--------|----------|
| Position | `{ mapId: string, cellId: number, x: number, y: number }` | All map entities |
| Inventory | `{ items: ItemStack[], capacity: number }` | Colonists, stockpiles, storage furniture |
| Needs | `{ values: Record<NeedId, number>, decayRates: Record<NeedId, number> }` | Colonists, animals |
| Skills | `{ levels: Record<SkillId, number>, experience: Record<SkillId, number> }` | Colonists |
| TaskQueue | `{ tasks: Task[], currentTask: Task | null }` | Colonists, animals |
| JobClaim | `{ jobId: string, progress: number, paused: boolean }` | Working colonists |
| FactionMembership | `{ factionId: string, role: string, loyalty: number }` | Colonists, factions |
| Traits | `{ traitIds: string[] }` | Colonists |
| Pathfinding | `{ path: number[], targetCellId: number }` | Moving entities |
| Furniture | `{ furnitureTypeId: string, zoneId: string | null }` | Placed furniture |
| Door | `{ open: boolean, lockState: LockState }` | Doors |
| Wall | `{ orientation: WallOrientation }` | Walls |

### GameState (root serializable)

| Field | Type | Description |
|-------|------|-------------|
| seed | `number` | PRNG seed for determinism |
| tick | `number` | Current simulation tick |
| maps | `Map<string, TileMap>` | All maps (main + sub-maps) |
| entities | `Map<string, Entity>` | All live entities |
| zones | `Map<string, Zone>` | Active zones |
| jobBoards | `Map<string, JobBoard>` | Job posting boards |
| factions | `Map<string, Faction>` | Active factions |
| pendingCommands | `Command[]` | Government commands in transit |

## Map Data Model

### TileMap (abstract)

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique map identifier |
| type | `MapType` | `"voronoi" \| "square"` |
| parentMapId | `string \| null` | Link to parent map (null for root) |
| parentCellId | `number \| null` | Cell in parent map where entrance is |

### VoronoiTileMap extends TileMap

| Field | Type | Description |
|-------|------|-------------|
| cells | `VoronoiCell[]` | All voronoi cells |
| delaunayEdges | `[number, number][]` | Adjacency graph (cell index pairs) |
| bounds | `{ width: number, height: number }` | World bounds |

### VoronoiCell

| Field | Type | Description |
|-------|------|-------------|
| index | `number` | Cell index in array |
| centroid | `{ x: number, y: number }` | Center point |
| vertices | `{ x: number, y: number }[]` | Polygon vertices |
| terrain | `TerrainTypeId` | Terrain type reference |
| elevation | `number` | 0.0–1.0 normalized |
| moisture | `number` | 0.0–1.0 normalized |
| zoneId | `string \| null` | Assigned zone (if any) |
| occupants | `string[]` | Entity IDs present in cell |
| traversable | `boolean` | Whether entities can enter |
| resources | `ResourceDeposit[]` | Harvestable resources |

### SquareTileMap extends TileMap

| Field | Type | Description |
|-------|------|-------------|
| width | `number` | Grid width in tiles |
| height | `number` | Grid height in tiles |
| tiles | `SquareTile[]` | Row-major tile array |

### SquareTile

| Field | Type | Description |
|-------|------|-------------|
| index | `number` | Tile index (row * width + col) |
| terrain | `TerrainTypeId` | Terrain type reference |
| traversable | `boolean` | Whether entities can pass |
| wallEdges | `WallEdge[]` | Walls on tile edges (N/E/S/W) |
| zoneId | `string \| null` | Assigned zone |
| occupants | `string[]` | Entity IDs in tile |

## Zone & Job Model

### Zone

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique zone ID |
| zoneTypeId | `string` | Reference to zone-type registry |
| mapId | `string` | Which map this zone is on |
| cellIds | `number[]` | Cells/tiles belonging to zone |
| status | `ZoneStatus` | `"incomplete" \| "active" \| "paused"` |
| furnitureRequirements | `Record<string, number>` | Min furniture to activate |
| placedFurniture | `string[]` | Entity IDs of furniture in zone |

### JobBoard

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Board ID |
| zoneId | `string` | Parent zone |
| jobs | `Job[]` | Posted jobs |
| paused | `boolean` | Player can pause via command |

### Job

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Job ID |
| jobTypeId | `string` | Reference to job-type registry |
| boardId | `string` | Parent board |
| claimedBy | `string \| null` | Entity ID that claimed it |
| status | `JobStatus` | `"posted" \| "claimed" \| "inProgress" \| "completed"` |
| inputs | `ItemStack[]` | Required input materials |
| outputs | `ItemStack[]` | Produced outputs |

## Command Model

### Command

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Command ID |
| type | `CommandType` | `"pauseBoard" \| "resumeBoard" \| "setTradePolicy" \| "diplomatic" \| "postJob"` |
| payload | `Record<string, unknown>` | Type-specific data |
| status | `CommandStatus` | `"pending" \| "dispatched" \| "completed" \| "cancelled"` |
| dispatchedEntityId | `string \| null` | Town crier entity (if physical delivery) |
| issuedAtTick | `number` | When player issued it |
| completedAtTick | `number \| null` | When it took effect |

## Content Registry Types

All content is loaded from static JSON at startup via the content loader (spec 022).

| Registry | Key Entity | Used By |
|----------|-----------|---------|
| materials | `Material { id, name, category, weight }` | Recipes, inventory |
| skills | `Skill { id, name, category }` | Colonist skills, job requirements |
| needs | `Need { id, name, decayRate, satisfiers }` | Need system |
| terrain | `TerrainType { id, name, color, traversable, resources }` | Map generators, renderer |
| traits | `Trait { id, name, effects }` | Colonist creation |
| furniture | `FurnitureType { id, name, size, zoneReq, jobs }` | Build menu, zones |
| zones | `ZoneType { id, name, furnitureReqs, jobTypes }` | Zone drawing |
| factions | `Faction { id, name, disposition, traits }` | Faction system |
| jobs | `JobType { id, name, skill, duration, inputs, outputs }` | Job board |
| recipes | `Recipe { id, name, inputs, outputs, skill, station }` | Production |
| behaviorTrees | `BehaviorTree { id, name, nodes }` | AI system |
| entityPrototypes | `Prototype { id, name, components }` | Entity spawning |

## State Transitions

### Zone Lifecycle
```
incomplete → active (when furniture requirements met)
active → paused (player command)
paused → active (player command)
```

### Job Lifecycle
```
posted → claimed (entity picks up)
claimed → inProgress (entity starts work)
inProgress → completed (duration elapsed, outputs produced)
posted → [removed] (board paused or zone deactivated)
```

### Command Lifecycle
```
pending → dispatched (town crier assigned)
dispatched → completed (crier arrives at destination)
pending → cancelled (player cancels before dispatch)
dispatched → cancelled (player cancels, crier returns)
```

### Entity Need Lifecycle
```
satisfied (value > 70%) → concerned (30-70%) → critical (< 30%) → emergency (< 10%)
```

## Validation Rules

- Entity `id` must be unique across all entities in GameState
- Zone `cellIds` must all reference valid cells in the zone's map
- Job `inputs` must reference valid material IDs from content registry
- Command `dispatchedEntityId` must be a valid entity with Position component
- All `tick` values must be monotonically increasing
- Map `parentMapId` must not form cycles
- VoronoiCell `vertices` must form a closed polygon (first === last)
- Entity Position `mapId` must reference an existing map in GameState
- Entity Position `cellId` must be a valid cell index in the referenced map
