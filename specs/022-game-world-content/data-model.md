# Data Model: Game World Content

**Feature**: 022-game-world-content
**Date**: 2026-05-04

## Overview

The content data model defines 13 entity types (registry entries) and their relationships. All entries are immutable reference data loaded at startup. Runtime game state (entity instances, inventory contents, etc.) is separate — defined by specs 003-021.

## Entity Relationship Diagram

```
┌──────────────┐     inputs/outputs      ┌──────────┐
│   Material   │◄────────────────────────│  Recipe   │
└──────┬───────┘                         └────┬──────┘
       │ construction                         │ workstation
       │ materials         ┌──────────────────┘
       ▼                   ▼
┌──────────────┐    references    ┌──────────────┐
│  Furniture   │◄────────────────│  Zone Type   │
└──────────────┘  requirements   └──────┬───────┘
       ▲                                │ zone context
       │ default equipment              ▼
┌──────────────┐              ┌──────────────┐
│   Entity     │─────────────►│   Job Type   │
│  Prototype   │  skill domain└──────────────┘
└──┬───┬───┬───┘                     │
   │   │   │                         │ tool
   │   │   │  ┌──────────────┐       │ required
   │   │   └─►│    Skill     │◄──────┘
   │   │      └──────────────┘
   │   │           ▲
   │   │           │ skill aptitude
   │   │      ┌──────────────┐
   │   └─────►│    Trait     │
   │          └──────┬───────┘
   │                 │ need modifier
   │           ┌─────▼────────┐
   │           │    Need      │
   │           └──────────────┘
   │
   │          ┌──────────────┐
   ├─────────►│   Faction    │
   │          └──────────────┘
   │
   │          ┌──────────────┐
   └─────────►│ Behavior Tree│
              └──────────────┘

┌──────────────┐
│ Terrain Type │  (referenced by map generation; harvestable → Material)
└──────────────┘
```

## Registry Entry Schemas

> **Implementation note**: All schemas below are defined using **Zod** as the single source of truth.
> TypeScript types are inferred from Zod schemas via `z.infer<typeof schema>` — no separate interface definitions.
> Validation rules listed below each schema are encoded directly in the Zod schema (`.min()`, `.refine()`, etc.)
> and enforced at content loading time. JSON Schemas can be generated from Zod schemas via `zod-to-json-schema`
> for designer tooling and editor integration.

### 1. Material

```typescript
// Zod schema (source of truth)
const MaterialSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    categories: z.array(z.string()).min(1),
    stackLimit: z.number().int().min(1).max(1000),
    weight: z.number().int().min(1),
    perishable: z.boolean(),
    perishTicks: z.number().int().positive().optional(),
    value: z.number().min(0),
}).refine(
    (m) => !m.perishable || (m.perishTicks !== undefined && m.perishTicks > 0),
    { message: "perishTicks required and > 0 when perishable is true" }
);

// Type inferred from schema — no manual interface needed
type Material = z.infer<typeof MaterialSchema>;
```

**Validation rules**:

- `id` must be unique across all materials
- `stackLimit` must be ≥ 1
- `weight` must be ≥ 1
- `value` must be ≥ 0
- `perishTicks` required and > 0 if `perishable` is true
- `categories` must be non-empty

**Count**: ~75 entries

---

### 2. Recipe

```typescript
interface RecipeInput {
    materialId: string; // References Material.id
    quantity: number; // Integer ≥ 1
}

interface RecipeOutput {
    materialId: string; // References Material.id
    quantity: number; // Integer ≥ 1
}

interface Recipe {
    id: string; // Unique, e.g., "saw_oak_planks"
    name: string; // Human-readable
    inputs: RecipeInput[]; // Non-empty
    outputs: RecipeOutput[]; // Non-empty (may include byproducts)
    durationTicks: number; // Integer > 0
    restrictions: {
        workstation?: string; // References Furniture.id (by tag or specific ID)
        room?: string; // References ZoneType.id
        skill?: {
            skillId: string; // References Skill.id
            minLevel?: number; // Optional minimum level to attempt
        };
    };
    outputDestination: "workstation" | "crafter" | "stockpile";
    skillExperienceAwarded?: {
        skillId: string; // References Skill.id
        amount: number; // Growth amount on completion
    };
}
```

**Validation rules**:

- All `materialId` references must exist in MaterialRegistry
- `workstation` reference must exist in FurnitureRegistry (if present)
- `room` reference must exist in ZoneTypeRegistry (if present)
- `skill.skillId` must exist in SkillRegistry (if present)
- `skillExperienceAwarded.skillId` must exist in SkillRegistry (if present)
- `inputs` and `outputs` must be non-empty
- No circular dependency chains (validated across all recipes)

**Count**: ~55 entries

---

### 3. Furniture

```typescript
interface ConstructionCost {
    materialId: string; // References Material.id
    quantity: number; // Integer ≥ 1
}

interface FurnitureEffect {
    type: "activity.unlock" | "entity.modifier";
    // For activity.unlock:
    activityId?: string;
    // For entity.modifier:
    modifier?: string; // e.g., "mood.bonus", "inventory.decay.rate"
    value?: number;
}

interface Furniture {
    id: string; // Unique, e.g., "sawmill"
    name: string; // Human-readable
    categories: string[]; // e.g., ["workstation", "wood"]
    hasInventory: boolean; // Whether it has storage slots
    inventorySlots?: number; // Slot count (if hasInventory)
    inventoryWeightLimit?: number; // Weight capacity (if hasInventory)
    inventoryFilter?: {
        categories?: string[]; // Accepted material categories
        materialIds?: string[]; // Accepted specific materials
    };
    constructionCost: ConstructionCost[]; // Materials to build it
    effects?: FurnitureEffect[];
}
```

**Validation rules**:

- All `materialId` references in `constructionCost` must exist in MaterialRegistry
- All `materialIds` in `inventoryFilter` must exist in MaterialRegistry
- `inventorySlots` and `inventoryWeightLimit` required if `hasInventory` is true
- `categories` must be non-empty

**Count**: ~55 entries

---

### 4. ZoneType

```typescript
interface FurnitureRequirement {
    furnitureId?: string; // Specific furniture ID
    furnitureTag?: string; // Or furniture category tag
    count: number; // Minimum count required
}

interface ZoneEffect {
    type: "activity.unlock" | "entity.modifier";
    activityId?: string; // For activity.unlock
    modifier?: string; // For entity.modifier
    value?: number;
}

interface ZoneType {
    id: string; // Unique, e.g., "bakery"
    name: string; // Human-readable
    requiresRoom: boolean; // Must be fully enclosed
    minTiles: number; // Minimum tile count ≥ 1
    furnitureRequirements: FurnitureRequirement[];
    effects: ZoneEffect[];
    professionAffinity?: string; // Skill or role name for routing preference
}
```

**Validation rules**:

- `furnitureId` references must exist in FurnitureRegistry (if present)
- `furnitureTag` must match at least one furniture's categories (if present)
- `minTiles` must be ≥ 1
- `effects` array may be empty

**Count**: ~28 entries

---

### 5. EntityPrototype

```typescript
interface StartingSkill {
    skillId: string; // References Skill.id
    level: number; // Integer 0-100
}

interface DefaultEquipment {
    materialId: string; // References Material.id
    quantity?: number; // Default 1
}

interface EntityPrototype {
    id: string; // Unique, e.g., "blacksmith"
    name: string; // Human-readable
    entityType: "humanoid" | "livestock" | "wild_animal";
    startingSkills: StartingSkill[];
    defaultTraits?: string[]; // References Trait.id (for authored prototypes)
    traitSlots?: number; // For procedural generation: how many random traits (1-3)
    defaultEquipment: DefaultEquipment[];
    defaultFactions?: string[]; // References Faction.id
    behaviorTree: string; // References BehaviorTree.id
    sellsItems?: boolean; // Trade flag (spec 019)
    needPriorityOrder?: string[]; // Custom need priority (references Need.id)
    // Livestock-specific:
    products?: {
        materialId: string; // References Material.id
        method: "periodic" | "butcher";
        intervalTicks?: number; // For periodic harvesting
    }[];
    // Wild animal-specific:
    drops?: {
        materialId: string; // References Material.id
        quantity: number;
    }[];
    habitat?: string[]; // References TerrainType.id
    threatLevel?: "none" | "low" | "medium" | "high" | "very_high";
}
```

**Validation rules**:

- All `skillId` references must exist in SkillRegistry
- All `materialId` references must exist in MaterialRegistry
- All `Trait.id` references must exist in TraitRegistry (if present)
- All `Faction.id` references must exist in FactionRegistry (if present)
- `behaviorTree` must exist in BehaviorTreeRegistry
- `needPriorityOrder` entries must all exist in NeedRegistry (if present)
- `habitat` entries must exist in TerrainTypeRegistry (if present)

**Count**: ~36 entries (23 humanoid + 7 livestock + 6 wild)

---

### 6. Skill

```typescript
interface SkillOutcomeEffect {
    type: "speedMultiplier" | "outputBonus" | "custom";
    valueAtMax: number; // Effect value at skill level 100
    description?: string; // For custom effects
}

interface Skill {
    id: string; // Unique, e.g., "smithing"
    name: string; // Human-readable
    baseGrowthPerCompletion: number; // Float > 0
    diminishingReturnsThreshold: number; // Integer 0-100
    diminishingReturnsFactor: number; // Float 0-1
    outcomeEffects: SkillOutcomeEffect[];
}
```

**Validation rules**:

- `baseGrowthPerCompletion` must be > 0
- `diminishingReturnsThreshold` must be 0-100
- `diminishingReturnsFactor` must be 0-1
- `outcomeEffects` must be non-empty

**Count**: 21 entries

---

### 7. Trait

```typescript
interface SkillAptitudeModifier {
    type: "skillAptitude";
    skillId: string | "ALL"; // References Skill.id or ALL
    growthMultiplier: number; // Float, e.g., 1.5 = 50% faster growth
    startingValueBonus?: number; // Integer, added to starting skill
}

interface PerformanceModifier {
    type: "performanceModifier";
    domain: string | "ALL"; // Skill domain or ALL
    multiplier: number; // Float, e.g., 1.3 = 30% faster
    outputBonus?: number; // Float, e.g., 0.5 = 50% chance extra output
}

interface NeedModifier {
    type: "needModifier";
    needId: string; // References Need.id
    decayRateMultiplier?: number; // Float, e.g., 0.7 = 30% slower decay
    satisfactionBonusMultiplier?: number; // Float, e.g., 1.3 = 30% more satisfaction
    flatBonus?: number; // For mood/social event bonuses
    trigger?: string; // Event that triggers the flat bonus
}

type TraitModifier = SkillAptitudeModifier | PerformanceModifier | NeedModifier;

interface Trait {
    id: string; // Unique, e.g., "born_baker"
    name: string; // Human-readable
    description: string; // Tooltip text
    modifiers: TraitModifier[];
}
```

**Validation rules**:

- `skillId` in SkillAptitudeModifier must exist in SkillRegistry or be 'ALL'
- `domain` in PerformanceModifier must exist in SkillRegistry or be 'ALL'
- `needId` in NeedModifier must exist in NeedRegistry
- `modifiers` must be non-empty

**Count**: 31 entries

---

### 8. Need

```typescript
interface NeedSatisfactionMethod {
    type:
        | "consume"
        | "use_furniture"
        | "zone_presence"
        | "social"
        | "proximity";
    // For consume:
    materialCategory?: string; // Material category to consume
    materialId?: string; // Specific material
    satisfactionAmount?: number; // How much need is restored
    // For use_furniture:
    furnitureId?: string; // Furniture to use
    furnitureTag?: string; // Or furniture category
    restorationRate?: number; // Per-tick restoration while using
    // For zone_presence:
    zoneTypeId?: string; // Zone to be in
    passiveBonus?: number; // Per-tick passive restoration
    // For social:
    satisfactionAmount?: number;
    // For proximity:
    entityTag?: string; // Nearby entity type/tag
    radius?: number; // Tile radius
    bonus?: number;
}

interface Need {
    id: string; // Unique, e.g., "hunger"
    name: string; // Human-readable
    decayPerTick: number; // Float > 0
    criticalThreshold: number; // Float 0-1 (e.g., 0.2 = 20%)
    satisfactionMethods: NeedSatisfactionMethod[];
}
```

**Validation rules**:

- `materialId` references must exist in MaterialRegistry (if present)
- `furnitureId` references must exist in FurnitureRegistry (if present)
- `zoneTypeId` references must exist in ZoneTypeRegistry (if present)
- `decayPerTick` must be > 0
- `criticalThreshold` must be 0-1
- `satisfactionMethods` must be non-empty

**Count**: 6 entries

---

### 9. JobType

```typescript
interface JobType {
    id: string; // Unique, e.g., "farm.sow"
    name: string; // Human-readable
    skillDomain?: string; // References Skill.id
    toolRequired?: string; // References Material.id (tool material)
    zoneContext?: string; // References ZoneType.id
    recurrence: "one-time" | "recurring";
    description?: string; // Tooltip text
}
```

**Validation rules**:

- `skillDomain` must exist in SkillRegistry (if present)
- `toolRequired` must exist in MaterialRegistry and have category `tool` (if present)
- `zoneContext` must exist in ZoneTypeRegistry (if present)

**Count**: 22 entries

---

### 10. TerrainType

```typescript
interface TerrainType {
    id: string; // Unique, e.g., "forest_oak"
    name: string; // Human-readable
    traversable: boolean;
    movementModifier?: "slow" | "very_slow" | "fast"; // Omit for normal speed
    buildable: boolean;
    harvestableResources?: {
        materialId: string; // References Material.id
    }[];
    clearResult?: string; // TerrainType.id this becomes when cleared (e.g., forest → grassland)
}
```

**Validation rules**:

- `materialId` in `harvestableResources` must exist in MaterialRegistry (if present)
- `clearResult` must exist in TerrainTypeRegistry (if present)

**Count**: 21 entries

---

### 11. Faction

```typescript
interface FactionMembershipCriteria {
    skillId: string; // References Skill.id
    minLevel: number; // Minimum skill level to qualify
}

interface Faction {
    id: string; // Unique, e.g., "guild_bakers"
    name: string; // Human-readable
    factionType: string; // "occupational", "religious", etc. (open set)
    leaderTitle: string; // Human-readable, e.g., "Master Baker"
    disposition: string; // "mercantile", "isolationist", "aggressive" (open set)
    membershipCriteria?: FactionMembershipCriteria;
    associatedZones?: string[]; // References ZoneType.id
    mechanics?: {
        tradeDiscount?: number; // Price multiplier bonus for members (e.g., 0.85)
        faithBonus?: number; // Extra faith satisfaction for members
        titheRate?: number; // Periodic currency collection rate
    };
    description?: string;
}
```

**Validation rules**:

- `skillId` in membershipCriteria must exist in SkillRegistry (if present)
- `associatedZones` entries must exist in ZoneTypeRegistry (if present)

**Count**: 12 entries (9 guilds + 3 religious)

---

### 12. BehaviorTree

```typescript
type BehaviorNodeType = "selector" | "sequence" | "condition" | "action";

interface BehaviorNode {
    type: BehaviorNodeType;
    name?: string; // Optional label for debugging
    // For condition nodes:
    check?: string; // Named predicate, e.g., "anyNeedBelowCritical"
    // For action nodes:
    action?: string; // Named action, e.g., "satisfyCriticalNeed"
    scoring?: "utility"; // Optional utility scoring mode
    // For composite nodes (selector, sequence):
    children?: BehaviorNode[];
}

interface BehaviorTree {
    id: string; // Unique, e.g., "daily_routine"
    name: string; // Human-readable
    root: BehaviorNode; // Tree root
}
```

**Validation rules**:

- Composite nodes (selector, sequence) must have non-empty `children`
- Leaf nodes (condition, action) must not have `children`
- Condition nodes must have `check`
- Action nodes must have `action`
- Tree depth must not exceed 5 levels

**Count**: 7 entries

---

## Cross-Reference Integrity Matrix

This table summarizes which registries reference which. The validation pass checks all edges.

| Source Registry | References →                      | Target Registry |
| --------------- | --------------------------------- | --------------- |
| Recipe          | materialId (inputs/outputs)       | Material        |
| Recipe          | workstation                       | Furniture       |
| Recipe          | skill.skillId                     | Skill           |
| Recipe          | room                              | ZoneType        |
| Recipe          | skillExperienceAwarded.skillId    | Skill           |
| Furniture       | constructionCost.materialId       | Material        |
| Furniture       | inventoryFilter.materialIds       | Material        |
| ZoneType        | furnitureRequirements.furnitureId | Furniture       |
| EntityPrototype | startingSkills.skillId            | Skill           |
| EntityPrototype | defaultTraits                     | Trait           |
| EntityPrototype | defaultEquipment.materialId       | Material        |
| EntityPrototype | defaultFactions                   | Faction         |
| EntityPrototype | behaviorTree                      | BehaviorTree    |
| EntityPrototype | needPriorityOrder                 | Need            |
| EntityPrototype | products.materialId               | Material        |
| EntityPrototype | drops.materialId                  | Material        |
| EntityPrototype | habitat                           | TerrainType     |
| JobType         | skillDomain                       | Skill           |
| JobType         | toolRequired                      | Material        |
| JobType         | zoneContext                       | ZoneType        |
| TerrainType     | harvestableResources.materialId   | Material        |
| TerrainType     | clearResult                       | TerrainType     |
| Faction         | membershipCriteria.skillId        | Skill           |
| Faction         | associatedZones                   | ZoneType        |
| Trait           | skillAptitude.skillId             | Skill           |
| Trait           | needModifier.needId               | Need            |
| Need            | satisfactionMethods (materialId)  | Material        |
| Need            | satisfactionMethods (furnitureId) | Furniture       |
| Need            | satisfactionMethods (zoneTypeId)  | ZoneType        |

## Loading Order

Registries must be loaded in dependency order (leaf dependencies first):

1. **Material** — no dependencies
2. **Skill** — no dependencies
3. **Need** — references Material, Furniture (deferred validation)
4. **TerrainType** — references Material, self-reference (clearResult)
5. **Trait** — references Skill, Need
6. **Furniture** — references Material
7. **ZoneType** — references Furniture
8. **Faction** — references Skill, ZoneType
9. **BehaviorTree** — no data dependencies (action/condition names are engine-level)
10. **JobType** — references Skill, Material, ZoneType
11. **Recipe** — references Material, Furniture, Skill, ZoneType
12. **EntityPrototype** — references Skill, Trait, Material, Faction, BehaviorTree, Need, TerrainType

**Cross-validation** runs after step 12, checking all forward references (e.g., Need → Furniture which loaded later).
