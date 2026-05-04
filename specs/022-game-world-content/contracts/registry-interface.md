# Contract: Registry Public Interface

**Feature**: 022-game-world-content
**Date**: 2026-05-04

## Overview

The content system exposes two levels of interface:

1. **`Registry<T>`** — Generic base class used by all 13 registries
2. **`ContentLoader`** — Top-level orchestrator that loads all registries and validates cross-references

Each registry's entry type is defined by a **Zod schema** (single source of truth). TypeScript types are inferred from schemas via `z.infer<>`. JSON data files are validated against schemas at load time using `schema.parse()`, providing rich error messages on invalid content. JSON Schemas can be generated from Zod schemas via `zod-to-json-schema` for designer tooling.

Consumer systems (ECS, production, AI, trade, etc.) depend only on the registry interfaces — they never access data files directly.

---

## Registry<T> Interface

```typescript
/**
 * Generic typed content registry.
 * T must have a string `id` field.
 * All entries are immutable after loading.
 */
interface IRegistry<T extends { id: string }> {
  /** Get entry by ID. Throws if not found. */
  get(id: string): Readonly<T>;

  /** Get entry by ID, or undefined if not found. */
  tryGet(id: string): Readonly<T> | undefined;

  /** Check if an entry exists. */
  has(id: string): boolean;

  /** Get all entries as a readonly array. */
  getAll(): readonly Readonly<T>[];

  /** Get all entries matching a predicate. */
  filter(predicate: (entry: Readonly<T>) => boolean): readonly Readonly<T>[];

  /** Number of entries in the registry. */
  readonly size: number;
}
```

### Usage by consumer systems

```typescript
// Production system looking up a recipe's workstation
const recipe = recipeRegistry.get("forge_sword");
if (recipe.restrictions.workstation) {
  const furniture = furnitureRegistry.get(recipe.restrictions.workstation);
  // ... check if workstation exists in zone
}

// Trade system looking up base price
const material = materialRegistry.get("iron_sword");
const basePrice = material.value; // immutable reference data

// AI system looking up behavior tree
const tree = behaviorTreeRegistry.get(entity.behaviorTree);
// ... execute tree nodes

// Job system checking tool requirement
const jobType = jobTypeRegistry.get("mine.ore");
if (jobType.toolRequired) {
  const tool = materialRegistry.get(jobType.toolRequired);
  // ... check entity inventory for tool
}
```

---

## ContentLoader Interface

```typescript
interface ContentLoadResult {
  /** True if all registries loaded and validated without errors. */
  success: boolean;

  /** List of validation errors (empty if success). */
  errors: ContentValidationError[];

  /** List of validation warnings (non-fatal). */
  warnings: ContentValidationWarning[];

  /** All loaded registries, accessible by name. */
  registries: ContentRegistries;
}

interface ContentValidationError {
  registry: string; // Which registry the error is in
  entryId?: string; // Which entry (if applicable)
  field?: string; // Which field
  message: string; // Human-readable error description
  referencedId?: string; // The missing/invalid reference
  referencedRegistry?: string; // Where it was expected to be found
}

interface ContentValidationWarning {
  registry: string;
  entryId?: string;
  message: string;
}

interface ContentRegistries {
  materials: IRegistry<Material>;
  recipes: IRegistry<Recipe>;
  furniture: IRegistry<Furniture>;
  zoneTypes: IRegistry<ZoneType>;
  entityPrototypes: IRegistry<EntityPrototype>;
  skills: IRegistry<Skill>;
  traits: IRegistry<Trait>;
  needs: IRegistry<Need>;
  jobTypes: IRegistry<JobType>;
  terrainTypes: IRegistry<TerrainType>;
  factions: IRegistry<Faction>;
  behaviorTrees: IRegistry<BehaviorTree>;
}

/**
 * Load all content registries from data files.
 * Validates internal consistency and cross-references.
 * Returns a result object — does not throw.
 */
function loadAllContent(): ContentLoadResult;
```

---

## Consumer System Integration Points

### How each game system consumes content registries:

| System (Spec)          | Registries Consumed          | Access Pattern                             |
| ---------------------- | ---------------------------- | ------------------------------------------ |
| ECS Architecture (003) | EntityPrototype              | `get(prototypeId)` at entity creation      |
| Map/Terrain (004)      | TerrainType                  | `get(terrainId)` per tile                  |
| Inventory (005)        | Material                     | `get(materialId)` for stack limits, weight |
| Save/Load (006)        | All (for validation on load) | Cross-validate after deserialization       |
| Engine Bootstrap (007) | ContentLoader                | `loadAllContent()` at startup              |
| PRNG (011)             | EntityPrototype              | Trait/equipment randomization              |
| Pathfinding (012)      | TerrainType                  | Movement modifier lookup                   |
| Entity AI (013)        | BehaviorTree, Need           | Tree lookup + need satisfaction            |
| Production (014)       | Recipe, Furniture            | Recipe lookup + workstation check          |
| Zones/Rooms (015)      | ZoneType, Furniture          | Zone validation + effect lookup            |
| Construction (016)     | Furniture                    | Construction cost lookup                   |
| Jobs (017)             | JobType                      | Job posting + skill matching               |
| Stockpiles (018)       | Material, Furniture          | Filter matching + capacity                 |
| Trade (019)            | Material                     | Base price lookup                          |
| Skills/Traits (020)    | Skill, Trait                 | Growth + modifier lookup                   |
| Diplomacy (021)        | Faction                      | Faction prototype lookup                   |

---

## Error Handling Contract

- **Missing entry (`get()`)**: Throws `ContentNotFoundError` with registry name and requested ID
- **Load failure**: `loadAllContent()` returns `{ success: false, errors: [...] }`; engine must not start
- **Cross-reference failure**: Reported as `ContentValidationError`; specific enough to identify the broken reference
- **Duplicate IDs**: Rejected at registration time with `DuplicateContentError`
- **Post-freeze mutation**: Throws `TypeError` (from `Object.freeze`) in strict mode
