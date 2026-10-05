# src/game/save/migrations

Save version upgrades (spec 006 FR-012, DECISIONS D-05 and D-36). Each step upgrades raw JSON from version `n` to `n + 1`; older saves run through the whole chain before validation.

- `migrationTypes.ts` - `JsonObject` and `SaveMigration { fromVersion, description, migrate }`.
- `MigrationRegistry.ts` - one step per `fromVersion`; `migrate(root, from, to)` works on a copy, stamps the new version and reports a gap as `InvalidSaveFormatError`; `covers(from, to)` checks the chain.
- `createDefaultMigrations.ts` - `createDefaultMigrations()`, the built-in chain. Register new steps here.
- `migrateV0ToV1.ts` - difficulty rename `normal/hard` to `steady/harsh`, `counters` derived from the highest entity, map and task ids, empty `systems`.

## Adding a version

1. Raise `currentSaveVersion` in `../saveTypes.ts`.
2. Add `migrateVnToVn+1.ts` with a test built from a saved fixture of the old version.
3. Register it in `createDefaultMigrations.ts`. `createDefaultMigrations.test.ts` fails if the chain does not reach the current version.
