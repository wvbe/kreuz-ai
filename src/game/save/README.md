# src/game/save

Save format, validation, migrations and the determinism helpers (spec 006, DECISIONS D-05 and D-36). The engine does no file I/O: `saveGame` returns text, `loadGame` takes text or a parsed object.

- `saveTypes.ts` - `currentSaveVersion`, `CoreSaveKey` (root keys), `GameSnapshotParts` (the live objects a save reads and a load overwrites), options and result types.
- `saveGame.ts` - `serializeGame` (root object, read-only) and `saveGame` (canonical text). Same state gives the same string; only `timestamp` (host-injected) differs.
- `stableStringify.ts` - canonical JSON: sorted keys, integers only, `-0`/fractions/NaN rejected.
- `parseSave.ts` - parse, reject newer versions, migrate, validate strictly. Touches no game state; this is the fast rejection path.
- `loadGame.ts` - `parseSave` then apply in dependency order; on failure the previous state is restored and `InvalidSaveFormatError` is thrown.
- `SaveSectionRegistry.ts` - how systems add their own root keys (`statuses`, `productionLedger`, `stewardship`) or `systems.<key>` entries without editing the save module.
- `initOptions.ts` - `Difficulty`, the `initOptions` schema (unknown fields ignored).
- `InvalidSaveFormatError.ts`, `UnsupportedSaveVersionError.ts` - typed errors (corrupt or invalid; newer than supported).
- `stateHash.ts` - `hashText`, `hashSaveText`, `hashGameState` for "same state" assertions in determinism tests.
- `testSaveWorld.ts` - a populated world (clock, PRNG, bus, entities with tasks and behavior trees, two maps, inventories, two sections) used by the unit and integration tests.
- `migrations/` - `MigrationRegistry` (one step per version), `createDefaultMigrations`, `migrateV0ToV1`.

## Rules

- Unknown root keys, unknown `systems` entries and unknown component fields reject the load; `initOptions` alone ignores unknown fields.
- A registered section must be present in current-version saves; `defaultForOlderSaves` fills it only for migrated ones.
- To add a version: bump `currentSaveVersion`, add `migrateVnToVn+1` and register it in `createDefaultMigrations.ts`, add a fixture test.
- All numbers are safe integers; authored decimals go through `engine/fixedPoint.ts` at content load.
