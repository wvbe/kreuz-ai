# Quickstart: Adding Game Content

**Feature**: 022-game-world-content
**Date**: 2026-05-04

## Overview

All game content is defined in JSON data files under `src/data/`. No TypeScript code changes are needed to add new materials, recipes, furniture, zones, entities, skills, traits, needs, jobs, terrain types, factions, or behavior trees.

Schemas are defined in `src/schemas/` using **Zod**. Each schema is the single source of truth for both the TypeScript type and the runtime validation. JSON data is validated against these Zod schemas at startup, providing detailed error messages if content is malformed. JSON Schemas can also be generated from the Zod schemas for use in external editors (VS Code JSON schema validation, designer tools).

## Adding a New Material

1. Choose the appropriate data file in `src/data/materials/` based on category:
   - `raw-resources.json` — natural resources
   - `processed-goods.json` — refined/crafted intermediates
   - `finished-goods.json` — tools, weapons, armor, clothing
   - `food-and-drink.json` — consumables
   - `currency.json` — monetary items

2. Add a new entry to the array:

```json
{
  "id": "wax_seal",
  "name": "Wax Seal",
  "categories": ["processed", "writing"],
  "stackLimit": 20,
  "weight": 1,
  "perishable": false,
  "value": 5
}
```

3. Run tests: `npm test` — cross-validation will confirm all references are valid.

## Adding a New Recipe

1. Add to the appropriate file in `src/data/recipes/`.

2. Reference only material IDs and furniture IDs that already exist:

```json
{
  "id": "make_wax_seal",
  "name": "Make Wax Seal",
  "inputs": [{ "materialId": "beeswax", "quantity": 1 }],
  "outputs": [{ "materialId": "wax_seal", "quantity": 3 }],
  "durationTicks": 12,
  "restrictions": {
    "workstation": "candle_mold"
  },
  "outputDestination": "crafter",
  "skillExperienceAwarded": {
    "skillId": "leatherworking",
    "amount": 1.5
  }
}
```

3. Run tests to verify all references are valid.

## Adding a New Furniture Prototype

1. Add to the appropriate file in `src/data/furniture/`.

2. List construction materials using valid material IDs:

```json
{
  "id": "lectern_ornate",
  "name": "Ornate Lectern",
  "categories": ["religious", "furniture", "luxury"],
  "hasInventory": false,
  "constructionCost": [
    { "materialId": "oak_plank", "quantity": 6 },
    { "materialId": "nails", "quantity": 4 },
    { "materialId": "glass_pane", "quantity": 1 }
  ],
  "effects": [
    { "type": "entity.modifier", "modifier": "faith.bonus", "value": 5 }
  ]
}
```

## Adding a New Zone Type

1. Add to the appropriate file in `src/data/zones/`.

2. Reference furniture by ID or tag:

```json
{
  "id": "scriptorium",
  "name": "Scriptorium",
  "requiresRoom": true,
  "minTiles": 6,
  "furnitureRequirements": [
    { "furnitureId": "bookcase", "count": 1 },
    { "furnitureId": "lectern", "count": 1 }
  ],
  "effects": [{ "type": "activity.unlock", "activityId": "scholarship" }],
  "professionAffinity": "preaching"
}
```

## Adding a New Entity Prototype

1. Add to `src/data/entities/humanoids.json`, `livestock.json`, or `wild-animals.json`.

2. Reference skills, traits, materials, factions, and behavior trees by ID:

```json
{
  "id": "apothecary",
  "name": "Apothecary",
  "entityType": "humanoid",
  "startingSkills": [
    { "skillId": "herbalism", "level": 25 },
    { "skillId": "cooking", "level": 15 }
  ],
  "traitSlots": 2,
  "defaultEquipment": [
    { "materialId": "herbs", "quantity": 5 },
    { "materialId": "peasant_clothing" }
  ],
  "behaviorTree": "daily_routine",
  "sellsItems": true
}
```

## Validation Rules

After adding content, run `npm test`. The test suite checks:

- **Schema validation (Zod)** — each entry is parsed against its Zod schema; type mismatches, missing fields, and constraint violations are reported with path and message
- **No duplicate IDs** within any registry
- **All cross-references valid** — every referenced ID exists in the target registry
- **Numeric constraints met** — encoded in Zod schemas (`.min()`, `.max()`, `.int()`, `.positive()`, etc.)
- **Conditional requirements** — enforced via Zod `.refine()` (e.g., `perishTicks` required when `perishable: true`)
- **No circular recipe chains** — inputs cannot transitively require their own outputs
- **Behavior tree depth** — no tree exceeds 5 levels of nesting
- **Minimum counts** — each registry meets its FR minimum (e.g., ≥ 70 materials, ≥ 55 recipes)

If validation fails, Zod's error output identifies the exact path (`entries[12].inputs[0].materialId`), expected type, and received value.

## File Naming Convention

- All IDs use `snake_case`
- All JSON files use `kebab-case` for filenames
- Categories use `lowercase` single words
- Entries within a JSON file are sorted alphabetically by `id`
