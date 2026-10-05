# src/game/content/schemas

Zod schemas of the authored content files (spec 022 FR-018). Each schema is the authored shape; its output type (`z.infer`, exported as `XxxContent`) is what the registries hold after decimals were converted to fixed point.

- `fieldSchemas.ts` - ids (`contentIdSchema`, `dottedIdSchema`), fixed-point fields (`milliSchema`, `signedMilliSchema`, `percentSchema`, `permilleSchema`, `fractionSchema`), counts, levels and `materialAmountSchema`.
- `economySchemas.ts` - material (wraps the inventory module's `materialDefinitionSchema`), terrain (wraps the map module's `terrainDefinitionSchema`), category, furniture, zone type, recipe, job type.
- `characterSchemas.ts` - need, skill, trait, humanoid and animal prototypes, faction, name list.
- `tableSchemas.ts` - content constants, settlement tiers, difficulty modes, dwelling levels, moment templates, name formats (the fixed-key tables).

Behavior trees (`behaviorTreeSchema`) and engine prototypes (`prototypeSchema`) are reused from `behavior/` and `ecs/` and are not redefined here. All objects are strict: unknown fields are errors.
