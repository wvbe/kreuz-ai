# Research: Game World Content Implementation

**Feature**: 022-game-world-content
**Date**: 2026-05-04

## Research Task 1: Content Registry Architecture Pattern

**Question**: What is the best pattern for a typed, validated, immutable content registry in TypeScript that loads from JSON at startup?

### Decision: Generic Registry<T> Base Class

**Rationale**: A single generic `Registry<T>` class handles all 13 content registries with one implementation. Each registry specializes it with a concrete type and optional validation logic. This keeps the codebase DRY while allowing per-registry validation rules.

**Pattern**:

```
Registry<T extends { id: string }>
  - entries: ReadonlyMap<string, Readonly<T>>
  - register(entry: T): void         // startup only
  - get(id: string): T               // O(1) lookup, throws if missing
  - tryGet(id: string): T | undefined // O(1), returns undefined
  - getAll(): readonly T[]            // full list
  - has(id: string): boolean          // existence check
  - validate(): ValidationResult     // per-registry integrity
  - size: number
```

After all registries are loaded, a cross-validation pass checks referential integrity (e.g., every recipe's workstation ID exists in the furniture registry). Registries are frozen after loading — no mutations at runtime.

**Alternatives Considered**:

1. **Per-registry custom classes** — Rejected. Too much boilerplate for 13 registries that share identical access patterns.
2. **Plain Map<string, T> per module** — Rejected. No encapsulation, no built-in validation, no freeze semantics.
3. **Schema validation library (Zod)** — **ACCEPTED (revised decision)**. Zod defines schemas as the single source of truth for all content data types. Benefits: (a) runtime validation of JSON data at startup with rich error messages, (b) TypeScript types inferred directly from schemas (no type/validator drift), (c) JSON Schema generation via `zod-to-json-schema` for external tooling and designer editors. Zod is used only at content loading time (startup), not in hot game loops. This is acceptable under the constitution since the game engine's tick-based simulation remains dependency-free; Zod operates at the data boundary.

---

## Research Task 2: JSON Data File Organization

**Question**: How should content data files be organized for maintainability, and how should they be loaded?

### Decision: Categorized JSON Files with Static Imports

**Rationale**: Content data is split into logical files by category (e.g., `materials/raw-resources.json`, `materials/processed-goods.json`) for human readability. Each file contains an array of entries. Files are imported statically by the registry module — no dynamic file system scanning at runtime. This keeps the loading deterministic and works identically in Node.js and browser bundlers.

**File format** (example for materials):

```json
[
    {
        "id": "oak_log",
        "name": "Oak Log",
        "categories": ["wood", "raw"],
        "stackLimit": 20,
        "weight": 8,
        "perishable": false,
        "value": 3
    }
]
```

**Loading approach**: Each registry module imports its data files and feeds them to `Registry.register()` during initialization. A top-level `loadAllContent()` function orchestrates loading order (materials first, then recipes that reference materials, etc.) and runs cross-validation.

**Alternatives Considered**:

1. **Single monolithic data file** — Rejected. Unmanageable at 300+ entries. Merge conflicts when multiple designers edit.
2. **YAML/TOML data files** — Rejected. Requires parser dependency. JSON is native to TypeScript/JavaScript and aligns with the JSON serialization constitution principle.
3. **TypeScript data files (export const)** — Rejected. Blurs the line between code and data. JSON forces clean separation and is directly serializable.
4. **Dynamic file system scanning (glob)** — Rejected. Not deterministic in load order; doesn't work in browser without bundler support.

---

## Research Task 3: Cross-Registry Validation Strategy

**Question**: How should referential integrity across 13 registries be validated?

### Decision: Post-Load Cross-Validation Pass

**Rationale**: After all 13 registries are loaded, a `validateAllContent()` function runs cross-registry checks. Each check verifies that IDs referenced in one registry exist in the target registry. Validation returns a list of errors (not exceptions) so all problems are reported at once.

**Cross-reference map** (what references what):

```
Recipe → Material (inputs, outputs)
Recipe → Furniture (workstation restriction)
Recipe → Skill (skill restriction)
Recipe → ZoneType (room restriction)
Furniture → Material (construction materials)
ZoneType → Furniture (furniture requirements, by tag or type)
ZoneType → Skill (profession affinity, indirectly)
EntityPrototype → Skill (starting skills)
EntityPrototype → Trait (default traits)
EntityPrototype → Material (default equipment)
EntityPrototype → Faction (default faction membership)
EntityPrototype → BehaviorTree (behavior tree reference)
JobType → Skill (skill domain)
JobType → Material (tool requirement)
JobType → ZoneType (zone context)
Faction → Skill (membership criteria)
Faction → ZoneType (associated zones)
Need → Material (satisfaction items, by category)
Need → Furniture (satisfaction furniture)
Trait → Skill (skill aptitude references)
Trait → Need (need modifier references)
BehaviorTree → Need (condition checks)
BehaviorTree → JobType (action references)
```

Each cross-reference check is a simple existence test: `if (!targetRegistry.has(referencedId)) errors.push(...)`.

**Alternatives Considered**:

1. **Validate on register** — Rejected. Registries load in sequence; forward references would fail. All data must be loaded before validation.
2. **No validation (trust the data)** — Rejected. Silent failures at runtime when a recipe references a nonexistent material are hard to debug. Fail-fast at startup is critical.

---

## Research Task 4: Behavior Tree Serialization Format

**Question**: How should behavior trees be represented in JSON data files?

### Decision: Nested Node Objects with Type Discriminator

**Rationale**: Behavior trees have a natural recursive structure. Each node has a `type` (sequence, selector, condition, action), optional `children` (for composite nodes), and type-specific parameters. This maps cleanly to JSON and is readable by designers.

**Format**:

```json
{
    "id": "daily_routine",
    "name": "Daily Routine",
    "root": {
        "type": "selector",
        "children": [
            {
                "type": "sequence",
                "name": "Critical Needs",
                "children": [
                    { "type": "condition", "check": "anyNeedBelowCritical" },
                    {
                        "type": "action",
                        "action": "satisfyCriticalNeed",
                        "scoring": "utility"
                    }
                ]
            },
            {
                "type": "sequence",
                "name": "Work Cycle",
                "children": [
                    { "type": "condition", "check": "jobAvailable" },
                    { "type": "action", "action": "travelToWorksite" },
                    { "type": "action", "action": "gatherMaterials" },
                    { "type": "action", "action": "performWork" }
                ]
            }
        ]
    }
}
```

Node types:

- `selector` — try children in order, succeed on first success
- `sequence` — run children in order, fail on first failure
- `condition` — evaluate a named predicate
- `action` — execute a named action

Action and condition names are strings that map to registered handler functions in the engine. The behavior tree data defines _structure_; the engine provides _implementation_ for each action/condition name.

**Alternatives Considered**:

1. **Flat array with parent IDs** — Rejected. Less readable for designers; harder to reason about tree structure.
2. **DSL string parsed at runtime** — Rejected. Requires a parser; not JSON-native; harder to validate.
3. **TypeScript builder pattern** — Rejected. Mixes code and data; violates the JSON-data principle.

---

## Research Task 5: TypeScript Project Setup Best Practices

**Question**: What is the minimal, clean TypeScript project setup for a game engine with minimal dependencies?

### Decision: Minimal Toolchain — TypeScript + Zod + Vitest + tsconfig strict

**Rationale**: The constitution demands headless-first operation and minimal coupling. The toolchain is: TypeScript for compilation, Zod for content schema validation at startup, Vitest for testing, and nothing else. No bundler needed for the engine (it's a library consumed by other layers). JSON imports use TypeScript's `resolveJsonModule`.

**Setup**:

- `package.json`: type = module, runtime dependency = zod, dev dependencies = typescript + vitest + zod-to-json-schema
- `tsconfig.json`: strict = true, resolveJsonModule = true, target = ES2022, module = NodeNext, outDir = dist
- `vitest.config.ts`: minimal, no special plugins
- No linter/formatter configured in this feature (can be added later)

**Alternatives Considered**:

1. **Bun runtime** — Rejected. Less mature; Node.js is the safer headless target.
2. **Jest** — Rejected. Slower, heavier configuration, less TypeScript-native than Vitest.
3. **esbuild/swc for compilation** — Rejected for now. TypeScript's own `tsc` is sufficient; bundling is a concern for the renderer layer, not the engine.

---

## Research Task 6: Immutability and Freeze Semantics

**Question**: How should content registry entries be protected from accidental mutation at runtime?

### Decision: Object.freeze at Registration + Readonly Types

**Rationale**: Content entries are reference data — they must never change at runtime. Two layers of protection:

1. **TypeScript `Readonly<T>` types** — compile-time enforcement. Registry getters return `Readonly<T>`.
2. **`Object.freeze()` at registration time** — runtime enforcement. Each entry is deep-frozen when registered. Any accidental mutation throws in strict mode.

This is lightweight (no proxy objects, no immutability library) and provides both compile-time and runtime safety.

**Alternatives Considered**:

1. **Immer or Immutable.js** — Rejected. External dependency; overkill for read-only reference data.
2. **Readonly types only (no freeze)** — Rejected. TypeScript types are erased at runtime; a bug could still mutate data.
3. **Defensive cloning on every get()** — Rejected. Wasteful for read-only data accessed frequently in hot loops.

---

## Research Task 7: Category Tag System Design

**Question**: How should material categories, furniture tags, and other open-set tag systems be represented?

### Decision: Plain String Arrays + Category Constants

**Rationale**: Categories are an open set (per spec). Representing them as string arrays (`categories: string[]`) keeps the data simple and extensible. A `Categories` constants object in code provides autocompletion and typo prevention for known categories, but new categories can be added to data files without code changes.

```typescript
// Known categories as constants (not an enum — open set)
export const MaterialCategory = {
    WOOD: "wood",
    STONE: "stone",
    METAL: "metal",
    RAW: "raw",
    PROCESSED: "processed",
    FOOD: "food",
    // ...
} as const;
```

Validation ensures every category string used in data files is either a known constant or explicitly documented as an extension.

**Alternatives Considered**:

1. **TypeScript enums** — Rejected. Enums are closed sets; adding a new category requires a code change, violating the data-driven extensibility goal.
2. **Separate Category registry** — Rejected. Over-engineering for a flat list of strings. Categories have no properties beyond their name.
3. **No constants, pure strings everywhere** — Rejected. Too easy to typo 'metl' instead of 'metal' with no compile-time help.
