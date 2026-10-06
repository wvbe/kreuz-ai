# src/game/content

Content pack loading (spec 022 FR-015/018/019, DECISIONS AD8, D-15, D-37): JSON data files, Zod validation, referential integrity and the per-engine `ContentRegistries`.

- `ContentLoader.ts` - `loadContent(options?)` (the bundled pack: static `.json` imports in the fixed order of `ContentFile`, no filesystem access) and `loadContentPack(files, options?)` (already parsed JSON, so tests can load alternative or invalid packs). Both return a **new** `ContentRegistries`; nothing is shared between loads. `options.handlers` additionally checks behavior-tree handler names.
- `ContentRegistries.ts` - the loaded content: `materials` (a filled `MaterialRegistry`), `terrain` (a filled `TerrainRegistry`), frozen `ContentTable`s for every other category, `constants` and `nameFormats`. `createPrototypeRegistry(components)` and `createBehaviorTreeRegistry(handlers)` build a fresh `PrototypeRegistry` / `BehaviorTreeRegistry` for one engine. `governmentFactionPrototypeId` names the bootstrap prototype.
- `ContentTable.ts` - read-only lookup table (`has/find/require/all/ids`), `UnknownContentError`, `deepFreeze`.
- `parseContentPack.ts` - per-file Zod validation in fixed order, decimals to fixed point, duplicate ids; collects every issue.
- `checkReferences.ts` - referential integrity: every referenced id exists, enum-complete tables have every key, currency material exists, bynames differ from title nouns, starting equipment fits the inventory.
- `ContentValidationError.ts` - thrown with all issues; each names file, record id and field.
- `contentTypes.ts` - `ContentFile`, `ContentPackFiles`, `ContentIssue` and the closed vocabularies (enums) of the schemas.
- `animalPrototypeDefinition.ts` - turns an animal record into an entity prototype (`Position`, a 4-slot `Inventory`, `TaskQueue`, `AiState`, `Health`, `Animal`; no citizen components; `ContentRegistries.registerPrototypes` registers it next to the humanoids).
- `humanoidPrototypeDefinition.ts` - turns a humanoid record into an entity prototype (`Position`, `Inventory`, `TaskQueue`, `AiState`, `Skills` from `startingSkills`, `Traits` from `defaultTraitIds`, `Needs` at `needStartValue`, `Mood`, `Health`, `Relationships`; `../skills` finishes a spawned character).
- [schemas](schemas/README.md) - Zod schemas of every category. [data](data/README.md) - the JSON files (pack v0).

## Rules

- Count minima (spec 022 FR-001..014), tier reachability (D-16) and corpus checks are content-conformance tests (task 5.4), not loader errors.
- References are checked only after every file is schema-valid, so one bad record does not produce a cascade of dangling-reference errors.
- Authored decimals become fixed point at load: percent points and 0..100 levels as milli-percent, ratios as permille, weights and prices as milli.
