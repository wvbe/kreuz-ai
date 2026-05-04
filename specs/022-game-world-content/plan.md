# Implementation Plan: Game World Content — 13th-Century European Setting

**Branch**: `023-game-world-content` | **Date**: 2026-05-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/022-game-world-content/spec.md`

## Summary

Define and implement the complete game content data layer for a 13th-century European colony simulation. This includes ~87 materials, ~55 crafting recipes, ~55 furniture prototypes, ~28 zone types, 23 humanoid entity prototypes, 21 skills, 31 traits, 6 needs, 22 job types, 21 terrain types, 13 animal prototypes, 12 factions, and 7 behavior tree templates — all expressed as typed, validated, JSON-serializable data files loaded at startup through a unified content registry system.

The implementation establishes the project's foundational architecture: TypeScript project scaffolding, the content registry pattern, validation pipeline, and data file structure that all future game systems depend on.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), targeting ES2022+

**Primary Dependencies**: Zod (schema definition & validation of content data at startup; enables JSON Schema generation). Vitest for testing.

**Storage**: JSON data files for content definitions; JSON for game state serialization (spec 006)

**Testing**: Vitest (fast, TypeScript-native, compatible with headless-first mandate)

**Target Platform**: Node.js 20+ (headless-first); browser as secondary rendering consumer

**Project Type**: Game engine library (headless simulation core) + content data layer

**Performance Goals**: All content registries loaded and cross-validated in < 100ms at startup; registry lookups are O(1) by ID

**Constraints**: Minimal runtime dependencies (Zod for content schema validation only — not used in hot game loops); all content data is JSON-serializable; deterministic (no system randomness in content loading)

**Scale/Scope**: ~300+ content entries across 13 registries; single-player simulation; content files authored by designers without code changes

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                          | Status  | Notes                                                                                                                                                                             |
| -------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Engine-Renderer Decoupling**                  | ✅ PASS | Content registries are pure data + types. No rendering code. All content is consumed by engine systems; rendering layer reads from registries.                                    |
| **II. Deterministic State & JSON Serialization**   | ✅ PASS | All content definitions are JSON files. Registry entries are immutable reference data, not runtime state. Entity instances derived from prototypes are serializable via spec 006. |
| **III. Headless-First Development**                | ✅ PASS | Content registries load and validate in Node.js without any browser API. All tests run headless.                                                                                  |
| **IV. Integration Testing via Scenario Snapshots** | ✅ PASS | Cross-registry validation tests serve as integration tests. Scenario snapshots will use content from these registries.                                                            |
| **V. Modular Game Systems**                        | ✅ PASS | Each content registry is an independent module with a typed contract. Registries interact only through ID references, not object references.                                      |

No violations. All five constitutional principles are satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/022-game-world-content/
├── plan.md              # This file
├── research.md          # Phase 0: Architecture research
├── data-model.md        # Phase 1: Registry schemas and relationships
├── quickstart.md        # Phase 1: How to add content
├── contracts/           # Phase 1: Registry public interfaces
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
package.json
tsconfig.json
vitest.config.ts

src/
└── game/
    ├── tsconfig.json                # Project reference (engine)
    ├── README.md
    ├── engine/
    │   ├── README.md
    │   ├── Registry.ts              # Generic typed registry base class
    │   ├── Registry.test.ts
    │   ├── ContentLoader.ts         # Loads and validates all data files
    │   └── ContentLoader.test.ts
    │
    ├── registries/
    │   ├── README.md
    │   ├── MaterialRegistry.ts      # Material definitions + types
    │   ├── MaterialRegistry.test.ts
    │   ├── RecipeRegistry.ts        # Crafting recipe definitions + types
    │   ├── RecipeRegistry.test.ts
    │   ├── FurnitureRegistry.ts     # Furniture prototype definitions + types
    │   ├── FurnitureRegistry.test.ts
    │   ├── ZoneTypeRegistry.ts      # Zone type definitions + types
    │   ├── ZoneTypeRegistry.test.ts
    │   ├── EntityPrototypeRegistry.ts # Humanoid + animal prototype definitions + types
    │   ├── EntityPrototypeRegistry.test.ts
    │   ├── SkillRegistry.ts         # Skill definitions + types
    │   ├── SkillRegistry.test.ts
    │   ├── TraitRegistry.ts         # Trait definitions + types
    │   ├── TraitRegistry.test.ts
    │   ├── NeedRegistry.ts          # Need definitions + types
    │   ├── NeedRegistry.test.ts
    │   ├── JobTypeRegistry.ts       # Job type definitions + types
    │   ├── JobTypeRegistry.test.ts
    │   ├── TerrainTypeRegistry.ts   # Terrain type definitions + types
    │   ├── TerrainTypeRegistry.test.ts
    │   ├── FactionRegistry.ts       # Faction prototype definitions + types
    │   ├── FactionRegistry.test.ts
    │   ├── BehaviorTreeRegistry.ts  # Behavior tree template definitions + types
    │   └── BehaviorTreeRegistry.test.ts
    │
    ├── schemas/
    │   ├── README.md
    │   ├── materials.ts             # Zod schema + inferred type for Material
    │   ├── recipes.ts               # Zod schema + inferred type for Recipe
    │   ├── furniture.ts             # Zod schema + inferred type for Furniture
    │   ├── zones.ts                 # Zod schema + inferred type for ZoneType
    │   ├── entities.ts              # Zod schema + inferred type for EntityPrototype
    │   ├── skills.ts                # Zod schema + inferred type for Skill
    │   ├── traits.ts                # Zod schema + inferred type for Trait
    │   ├── needs.ts                 # Zod schema + inferred type for Need
    │   ├── jobs.ts                  # Zod schema + inferred type for JobType
    │   ├── terrain.ts               # Zod schema + inferred type for TerrainType
    │   ├── factions.ts              # Zod schema + inferred type for Faction
    │   └── behavior-trees.ts        # Zod schema + inferred type for BehaviorTree
    │
    ├── data/
    │   ├── README.md
    │   ├── materials/
    │   │   ├── raw-resources.json
    │   │   ├── processed-goods.json
    │   │   ├── finished-goods.json
    │   │   ├── food-and-drink.json
    │   │   └── currency.json
    │   ├── recipes/
    │   │   ├── wood-processing.json
    │   │   ├── metal-processing.json
    │   │   ├── tools-and-equipment.json
    │   │   ├── weapons-and-armor.json
    │   │   ├── textiles.json
    │   │   ├── leather-processing.json
    │   │   ├── stonework.json
    │   │   ├── food-and-drink.json
    │   │   └── miscellaneous.json
    │   ├── furniture/
    │   │   ├── workstations.json
    │   │   ├── storage.json
    │   │   ├── comfort-and-living.json
    │   │   ├── religious.json
    │   │   └── utility-and-decorative.json
    │   ├── zones/
    │   │   ├── production.json
    │   │   ├── storage-and-utility.json
    │   │   ├── living-and-social.json
    │   │   ├── religious.json
    │   │   ├── military.json
    │   │   └── open-air.json
    │   ├── entities/
    │   │   ├── humanoids.json
    │   │   ├── livestock.json
    │   │   └── wild-animals.json
    │   ├── skills.json
    │   ├── traits.json
    │   ├── needs.json
    │   ├── jobs.json
    │   ├── terrain.json
    │   ├── factions/
    │   │   ├── guilds.json
    │   │   └── religious.json
    │   └── behavior-trees/
    │       ├── daily-routine.json
    │       ├── worker-cycle.json
    │       ├── guard-patrol.json
    │       ├── merchant-routine.json
    │       ├── priest-routine.json
    │       ├── livestock-behavior.json
    │       └── predator-behavior.json
    │
    └── validation/
        ├── README.md
        ├── cross-registry.test.ts   # Cross-reference integrity tests
        └── completeness.test.ts     # FR-001 through FR-017 verification
```

**Structure Decision**: All game engine code lives under `src/game/` per spec 023 FR-017. Clear separation between engine infrastructure (`src/game/engine/`), typed registry modules (`src/game/registries/`), Zod schemas (`src/game/schemas/`), and content data files (`src/game/data/`). No barrel files (FR-002). Tests are co-located next to source files (FR-013). Content data is pure JSON — no TypeScript in the data layer. Schemas define both types and validation using Zod. Registry modules provide typed loading, validation, and O(1) lookup.

## Complexity Tracking

No violations. No complexity justification needed.
