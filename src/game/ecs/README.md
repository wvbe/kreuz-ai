# src/game/ecs

Entities, components, prototypes, queries and relationships (specs 003 part A and 002).

Everything is per engine: the registries are plain objects the engine constructs and passes around; there are no global singletons. All data is JSON with integer-only numbers.

- `ComponentRegistry.ts` - `defineComponent(name, zodSchema, defaults)` (PascalCase names, defaults checked against the schema) and the per-engine `ComponentRegistry`. Use `.strict()` schemas.
- `PrototypeRegistry.ts` - declarative prototypes `{ id, components: { Name: overrides } }` (ids lowercase snake_case, loaded from content JSON via `registerAll`). `instantiate` merges defaults, prototype overrides, spawn overrides and validates; instances never share state. Prototypes are not serialized.
- `Entity.ts` - the `Entity` type (`{ id, prototype, components }`) and `hasComponent` (O(1), narrows the type), `getComponent`, `requireComponent`.
- `EntityStore.ts` - the entity collection: `spawn`, `addComponent`/`removeComponent` at runtime, runtime-only `version`, two-phase deletion (`requestDelete` then `flushDeletions` at pipeline slot 17), `serialize`/`restore` (root key `entities`). Entity ids come from `engine/IdCounters` (persisted, start at 1, never reused). Iteration is always ascending id.
- `EntityQuery.ts` - `getEntitiesByComponent`, `getEntitiesByProperty`, `getEntitiesByProperties` (AND) with equality, `{min,max}` ranges and `{contains}` for list fields, plus the chainable `EntityQuery`. Full scans; 1000 entities answer in well under 5 ms.
- `RelationshipRegistry.ts` / `relationshipQueries.ts` - named relationships backed by an id field of a component, read forward or inverse (derived by scanning), `getRelatedEntities`/`getRelatedEntity` (lowest id wins), depth-limited `traverseRelated`, and `clearReferencesTo` for slot 17 cleanup.
- `jsonData.ts` - JSON helpers (`cloneJson`, `jsonEquals`, `readJsonPath`, `jsonValueSchema`).
- `EcsError.ts` - `EcsError` with an `EcsErrorKind`.

Events emitted when a bus is given: `entity.spawned`, `entity.component.added`, `entity.component.removed`, `entity.deleted` (see DECISIONS section 4.2).
