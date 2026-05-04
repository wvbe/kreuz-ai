# Tasks: Game World Content — 13th-Century European Setting

**Input**: Design documents from `specs/022-game-world-content/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped into phases with quality gates between them. Each phase must pass its gate before the next phase begins. Within phases, [P] tasks can run in parallel.

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Create the TypeScript project from scratch with all tooling configured.

- [x] T001 Create `package.json` with type=module, runtime dep=zod, dev deps=typescript+vitest+zod-to-json-schema in `package.json`
- [x] T002 Create `tsconfig.json` with strict=true, resolveJsonModule=true, target=ES2022, module=NodeNext in `tsconfig.json`
- [x] T003 Create `vitest.config.ts` with minimal configuration in `vitest.config.ts`
- [x] T004 Install all dependencies via `npm install`
- [x] T005 [P] Create directory structure: `src/engine/`, `src/registries/`, `src/schemas/`, `src/data/`, `test/`

**🚧 QUALITY GATE 1**: `npx tsc --noEmit` succeeds with zero errors. `npx vitest run` executes (even if no tests exist yet).

---

## Phase 2: Foundational (Registry Engine + Schemas)

**Purpose**: Implement the generic Registry<T> base class and all 12 Zod schemas. These are blocking prerequisites for all content data.

### Engine Infrastructure

- [x] T006 Implement generic `Registry<T>` class with get/tryGet/has/getAll/filter/size and Object.freeze in `src/engine/Registry.ts`
- [x] T007 Implement `ContentLoader` orchestrator with loadAllContent() and cross-validation in `src/engine/ContentLoader.ts`
- [x] T008 [P] Write Registry unit test verifying register, get, has, freeze, duplicate rejection in `test/registries/Registry.test.ts`

### Zod Schemas (all parallelizable — no inter-dependencies)

- [x] T009 [P] Define MaterialSchema with all fields, refine for perishTicks constraint in `src/schemas/materials.ts`
- [x] T010 [P] Define SkillSchema with growth params, diminishing returns, outcome effects in `src/schemas/skills.ts`
- [x] T011 [P] Define NeedSchema with decay rate, critical threshold, satisfaction methods in `src/schemas/needs.ts`
- [x] T012 [P] Define TerrainTypeSchema with traversable, buildable, harvestable, clearResult in `src/schemas/terrain.ts`
- [x] T013 [P] Define TraitSchema with discriminated union for modifier types (skillAptitude/performance/need) in `src/schemas/traits.ts`
- [x] T014 [P] Define FurnitureSchema with constructionCost, inventoryFilter, effects in `src/schemas/furniture.ts`
- [x] T015 [P] Define ZoneTypeSchema with furnitureRequirements, effects, professionAffinity in `src/schemas/zones.ts`
- [x] T016 [P] Define FactionSchema with membershipCriteria, associatedZones, mechanics in `src/schemas/factions.ts`
- [x] T017 [P] Define BehaviorTreeSchema with recursive BehaviorNode, depth validation in `src/schemas/behavior-trees.ts`
- [x] T018 [P] Define JobTypeSchema with skillDomain, toolRequired, zoneContext in `src/schemas/jobs.ts`
- [x] T019 [P] Define RecipeSchema with inputs, outputs, restrictions, skillExperienceAwarded in `src/schemas/recipes.ts`
- [x] T020 [P] Define EntityPrototypeSchema with startingSkills, products, drops, habitat in `src/schemas/entities.ts`
- [x] T021 Create schema index re-exporting all schemas and inferred types in `src/schemas/index.ts`

**🚧 QUALITY GATE 2**: `npx tsc --noEmit` passes. Unit test for Registry passes. Each schema can parse a minimal valid JSON object and reject an invalid one (verified manually or via a simple smoke test in T008).

---

## Phase 3: Leaf Content — Materials, Skills, Needs, Terrain (Priority: P1) 🎯 MVP

**Goal**: Populate the four registries that have zero cross-references to other registries. These are the leaves of the dependency graph.

**Independent Test**: Each registry loads its data, validates via Zod, and all entries pass. No cross-registry validation needed for these four.

### Registry Modules

- [x] T022 [P] [US1] Implement MaterialRegistry loading from 5 JSON files in `src/registries/MaterialRegistry.ts`
- [x] T023 [P] [US6] Implement SkillRegistry loading from JSON in `src/registries/SkillRegistry.ts`
- [x] T024 [P] [US8] Implement NeedRegistry loading from JSON in `src/registries/NeedRegistry.ts`
- [x] T025 [P] [US10] Implement TerrainTypeRegistry loading from JSON in `src/registries/TerrainTypeRegistry.ts`

### Data Files — Materials (US1)

- [x] T026 [P] [US1] Create raw resources data (29 entries) in `src/data/materials/raw-resources.json`
- [x] T027 [P] [US1] Create processed goods data (22 entries) in `src/data/materials/processed-goods.json`
- [x] T028 [P] [US1] Create finished goods data (20 entries) in `src/data/materials/finished-goods.json`
- [x] T029 [P] [US1] Create food and drink data (15 entries) in `src/data/materials/food-and-drink.json`
- [x] T030 [P] [US1] Create currency data (1 entry) in `src/data/materials/currency.json`

### Data Files — Skills, Needs, Terrain (US6, US8, US10)

- [x] T031 [P] [US6] Create skill registry data (21 entries) in `src/data/skills.json`
- [x] T032 [P] [US8] Create need registry data (6 entries) in `src/data/needs.json`
- [x] T033 [P] [US10] Create terrain type data (21 entries) in `src/data/terrain.json`

### Tests

- [x] T034 [P] [US1] Write MaterialRegistry test: loads all files, validates count ≥ 70, no duplicate IDs, Zod parse passes in `test/registries/MaterialRegistry.test.ts`
- [x] T035 [P] [US6] Write SkillRegistry test: loads, count ≥ 20, all fields valid in `test/registries/SkillRegistry.test.ts`
- [x] T036 [P] [US8] Write NeedRegistry test: loads, count = 6, satisfaction methods present in `test/registries/NeedRegistry.test.ts`
- [x] T037 [P] [US10] Write TerrainTypeRegistry test: loads, count ≥ 15, harvestable refs valid in `test/registries/TerrainTypeRegistry.test.ts`

**🚧 QUALITY GATE 3**: `npx vitest run` — all 4 registry tests pass. Material count ≥ 70. Skill count ≥ 20. Need count = 6. Terrain count ≥ 15. Zero Zod validation errors.

---

## Phase 4: Mid-Tier Content — Traits, Furniture, Zones, Factions, Jobs (Priority: P1)

**Goal**: Populate registries that reference the Phase 3 registries (Materials, Skills, Needs, Terrain).

**Independent Test**: Each registry loads and validates internally. Cross-references to Phase 3 registries are checked.

### Registry Modules

- [ ] T038 [P] [US7] Implement TraitRegistry loading from JSON in `src/registries/TraitRegistry.ts`
- [ ] T039 [P] [US3] Implement FurnitureRegistry loading from 5 JSON files in `src/registries/FurnitureRegistry.ts`
- [ ] T040 [P] [US4] Implement ZoneTypeRegistry loading from 6 JSON files in `src/registries/ZoneTypeRegistry.ts`
- [ ] T041 [P] [US12/13] Implement FactionRegistry loading from 2 JSON files in `src/registries/FactionRegistry.ts`
- [ ] T042 [P] [US9] Implement JobTypeRegistry loading from JSON in `src/registries/JobTypeRegistry.ts`

### Data Files — Traits (US7)

- [ ] T043 [P] [US7] Create trait registry data (31 entries: 12 aptitude + 7 performance + 12 need) in `src/data/traits.json`

### Data Files — Furniture (US3)

- [ ] T044 [P] [US3] Create workstation furniture data (27 entries) in `src/data/furniture/workstations.json`
- [ ] T045 [P] [US3] Create storage furniture data (12 entries) in `src/data/furniture/storage.json`
- [ ] T046 [P] [US3] Create comfort and living furniture data (9 entries) in `src/data/furniture/comfort-and-living.json`
- [ ] T047 [P] [US3] Create religious furniture data (6 entries) in `src/data/furniture/religious.json`
- [ ] T048 [P] [US3] Create utility and decorative furniture data (9 entries) in `src/data/furniture/utility-and-decorative.json`

### Data Files — Zones (US4)

- [ ] T049 [P] [US4] Create production zone data (11 entries) in `src/data/zones/production.json`
- [ ] T050 [P] [US4] Create storage and utility zone data (4 entries) in `src/data/zones/storage-and-utility.json`
- [ ] T051 [P] [US4] Create living and social zone data (5 entries) in `src/data/zones/living-and-social.json`
- [ ] T052 [P] [US4] Create religious zone data (3 entries) in `src/data/zones/religious.json`
- [ ] T053 [P] [US4] Create military zone data (2 entries) in `src/data/zones/military.json`
- [ ] T054 [P] [US4] Create open-air zone data (12 entries) in `src/data/zones/open-air.json`

### Data Files — Factions (US12, US13)

- [ ] T055 [P] [US12] Create guild faction data (9 entries) in `src/data/factions/guilds.json`
- [ ] T056 [P] [US13] Create religious faction data (3 entries) in `src/data/factions/religious.json`

### Data Files — Jobs (US9)

- [ ] T057 [P] [US9] Create job type data (22 entries) in `src/data/jobs.json`

### Tests

- [ ] T058 [P] [US7] Write TraitRegistry test: count ≥ 24, skill/need refs valid in `test/registries/TraitRegistry.test.ts`
- [ ] T059 [P] [US3] Write FurnitureRegistry test: count ≥ 50, construction material refs valid in `test/registries/FurnitureRegistry.test.ts`
- [ ] T060 [P] [US4] Write ZoneTypeRegistry test: count ≥ 25, furniture refs valid in `test/registries/ZoneTypeRegistry.test.ts`
- [ ] T061 [P] [US12/13] Write FactionRegistry test: count ≥ 11, skill/zone refs valid in `test/registries/FactionRegistry.test.ts`
- [ ] T062 [P] [US9] Write JobTypeRegistry test: count ≥ 20, skill/material/zone refs valid in `test/registries/JobTypeRegistry.test.ts`

**🚧 QUALITY GATE 4**: `npx vitest run` — all Phase 3 + Phase 4 tests pass. Trait count ≥ 24. Furniture count ≥ 50. Zone count ≥ 25. Faction count ≥ 11. Job count ≥ 20. All cross-references to Materials/Skills/Needs/Terrain are valid.

---

## Phase 5: Top-Tier Content — Recipes, Behavior Trees, Entity Prototypes (Priority: P1/P2)

**Goal**: Populate registries that reference multiple other registries (the top of the dependency graph).

**Independent Test**: Each registry loads and validates. Cross-references to all lower-tier registries are checked.

### Registry Modules

- [ ] T063 [P] [US2] Implement RecipeRegistry loading from 9 JSON files in `src/registries/RecipeRegistry.ts`
- [ ] T064 [P] [US14] Implement BehaviorTreeRegistry loading from 7 JSON files in `src/registries/BehaviorTreeRegistry.ts`
- [ ] T065 [P] [US5/11] Implement EntityPrototypeRegistry loading from 3 JSON files in `src/registries/EntityPrototypeRegistry.ts`

### Data Files — Recipes (US2)

- [ ] T066 [P] [US2] Create wood processing recipes (4 entries) in `src/data/recipes/wood-processing.json`
- [ ] T067 [P] [US2] Create metal processing recipes (4 entries) in `src/data/recipes/metal-processing.json`
- [ ] T068 [P] [US2] Create tools and equipment recipes (9 entries) in `src/data/recipes/tools-and-equipment.json`
- [ ] T069 [P] [US2] Create weapons and armor recipes (8 entries) in `src/data/recipes/weapons-and-armor.json`
- [ ] T070 [P] [US2] Create textile recipes (7 entries) in `src/data/recipes/textiles.json`
- [ ] T071 [P] [US2] Create leather processing recipes (2 entries) in `src/data/recipes/leather-processing.json`
- [ ] T072 [P] [US2] Create stonework recipes (5 entries) in `src/data/recipes/stonework.json`
- [ ] T073 [P] [US2] Create food and drink recipes (17 entries) in `src/data/recipes/food-and-drink.json`
- [ ] T074 [P] [US2] Create miscellaneous recipes (2 entries) in `src/data/recipes/miscellaneous.json`

### Data Files — Behavior Trees (US14)

- [ ] T075 [P] [US14] Create daily routine behavior tree in `src/data/behavior-trees/daily-routine.json`
- [ ] T076 [P] [US14] Create worker cycle behavior tree in `src/data/behavior-trees/worker-cycle.json`
- [ ] T077 [P] [US14] Create guard patrol behavior tree in `src/data/behavior-trees/guard-patrol.json`
- [ ] T078 [P] [US14] Create merchant routine behavior tree in `src/data/behavior-trees/merchant-routine.json`
- [ ] T079 [P] [US14] Create priest routine behavior tree in `src/data/behavior-trees/priest-routine.json`
- [ ] T080 [P] [US14] Create livestock behavior tree in `src/data/behavior-trees/livestock-behavior.json`
- [ ] T081 [P] [US14] Create predator behavior tree in `src/data/behavior-trees/predator-behavior.json`

### Data Files — Entity Prototypes (US5, US11)

- [ ] T082 [P] [US5] Create humanoid entity prototypes (23 entries) in `src/data/entities/humanoids.json`
- [ ] T083 [P] [US11] Create livestock entity prototypes (7 entries) in `src/data/entities/livestock.json`
- [ ] T084 [P] [US11] Create wild animal entity prototypes (6 entries) in `src/data/entities/wild-animals.json`

### Tests

- [ ] T085 [P] [US2] Write RecipeRegistry test: count ≥ 55, material/furniture/skill refs valid, no circular deps in `test/registries/RecipeRegistry.test.ts`
- [ ] T086 [P] [US14] Write BehaviorTreeRegistry test: count ≥ 6, depth ≤ 5, valid node structure in `test/registries/BehaviorTreeRegistry.test.ts`
- [ ] T087 [P] [US5/11] Write EntityPrototypeRegistry test: count ≥ 30, all refs valid in `test/registries/EntityPrototypeRegistry.test.ts`

**🚧 QUALITY GATE 5**: `npx vitest run` — all tests through Phase 5 pass. Recipe count ≥ 55. Behavior tree count ≥ 6, all within depth limit. Entity prototype count ≥ 30. All cross-references valid across all tiers.

---

## Phase 6: Integration — Cross-Registry Validation & Completeness (Priority: P1)

**Goal**: Wire up the full ContentLoader, run cross-registry validation, and verify FR-001 through FR-017.

### Integration

- [ ] T088 [US1] Create registries index re-exporting all registries in `src/registries/index.ts`
- [ ] T089 [US1] Wire ContentLoader to load all 12 registries in dependency order and run cross-validation in `src/engine/ContentLoader.ts`

### Cross-Registry Validation Tests

- [ ] T090 [US1] Write cross-registry validation test: all recipe material refs exist, all furniture construction material refs exist, all zone furniture refs exist, all entity prototype refs valid in `test/validation/cross-registry.test.ts`

### Completeness Tests

- [ ] T091 [US1] Write FR completeness test: verify FR-001 to FR-017 minimum counts and constraints in `test/content/completeness.test.ts`

**🚧 QUALITY GATE 6**: `npx vitest run` — ALL tests pass including cross-registry and completeness. `loadAllContent()` returns `{ success: true, errors: [] }`. Zero validation errors across all 300+ content entries. FR-001 through FR-017 all verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final quality pass — documentation, consistency, thematic review.

- [ ] T092 [P] Verify all material IDs use snake_case, all JSON files use kebab-case naming per quickstart convention
- [ ] T093 [P] Verify no anachronistic content (no gunpowder, printing press, New World crops) per FR-017
- [ ] T094 [P] Verify at least 3 complete production chains of depth ≥ 3 exist (SC-002)
- [ ] T095 [P] Verify ≥ 70% of materials participate in at least one recipe (SC-006)
- [ ] T096 Run `loadAllContent()` and verify execution time < 100ms (Performance Goal)

**🚧 QUALITY GATE 7 (FINAL)**: All tests pass. All success criteria SC-001 through SC-008 met. Content loads in < 100ms. Zero warnings. Feature is complete.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (Leaf Content) → Phase 4 (Mid-Tier) → Phase 5 (Top-Tier) → Phase 6 (Integration) → Phase 7 (Polish)
```

Each phase MUST pass its quality gate before the next phase begins.

### Within Each Phase

- All tasks marked [P] can run in parallel
- Tasks without [P] must be sequential within their group
- Tests should be written alongside or immediately after the code they test

### Parallel Opportunities Per Phase

| Phase | Parallelizable Tasks | Sequential Tasks |
|-------|---------------------|-----------------|
| 1 | T005 | T001→T002→T003→T004 |
| 2 | T009–T020 (all schemas) | T006→T007→T008, T021 |
| 3 | T022–T037 (all) | None |
| 4 | T038–T062 (all) | None |
| 5 | T063–T087 (all) | None |
| 6 | T090–T091 | T088→T089 |
| 7 | T092–T095 | T096 |

### Critical Path

T001 → T002 → T003 → T004 → T006 → T007 → T009 (any schema) → T022 (any leaf registry) → T026 (any data file) → T034 (test) → Gate 3 → T038 (mid-tier registry) → T043 (mid-tier data) → T058 (test) → Gate 4 → T063 (top-tier registry) → T066 (top-tier data) → T085 (test) → Gate 5 → T088 → T089 → T090 → T091 → Gate 6

---

## Implementation Strategy

**MVP** = Phase 1 + Phase 2 + Phase 3. At Gate 3, you have a working project with 4 fully loaded registries (Materials, Skills, Needs, Terrain) validating ~130 content entries. This proves the architecture end-to-end.

**Incremental delivery**: Each subsequent phase adds more registries and content while maintaining all existing tests. No phase breaks what was built before.

**Quality gates enforce**: You cannot add Recipes (Phase 5) until Materials and Furniture (which Recipes reference) are loaded and validated (Phases 3 and 4). This mirrors the data model's dependency graph and prevents forward-reference errors.
