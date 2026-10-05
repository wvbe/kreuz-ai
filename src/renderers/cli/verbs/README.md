# src/renderers/cli/verbs

The REPL commands, one file per verb group. A verb is `{name, usage, summary, run(args, context)}` (`Verb.ts`); `run` returns `verbDone(lines)` or `verbFailed(message)` and reaches the game only through `context.session` (a `GameSession`).

- `Verb.ts` - `Verb`, `VerbContext`, `VerbOutput`, `FileIo`, helpers `verbDone`, `verbFailed`, `parseCount`.
- `kernelVerbs.ts` - `new, step, run-until, pause, resume, speed, status, save, load`.
- `inspectVerbs.ts` - `map, entities, inspect, events`.
- `jobVerbs.ts` - `jobs [boardId]` (boards and postings from the `job-boards` and `jobs-on` queries, formatted by `../formatJobs.ts`).
- `storageVerbs.ts` - `stock [materialId]` (the `stock` and `stockpiles` queries, formatted by `../formatStock.ts`).
- `zoneVerbs.ts` - `zones [mapId]`, `zone <id>`, `zone designate <type> <mapId> <cell>...`, `zone delete <id>` (the `zones` and `zone` queries, formatted by `../formatZones.ts`).
- `productionVerbs.ts` - `orders [workstationId]`, `order <id>`, `order create <recipeId> <quantity> [workstationId] [priority]`, `order cancel|pause|resume <id>`, `order priority <id> <0-100>`, `order interrupt <workstationId>` (the `production-orders` and `order` queries, formatted by `../formatProduction.ts`; the changes queue the commands of D-10).
- `statusVerbs.ts` - `why <entityId>|posting <id>|order <id>`, `idle [all]`, `flow [materialId]` (the `explain`, `idle-blocked`, `flow` and `flow-of` queries, formatted by `../formatStatus.ts`).
- `metaVerbs.ts` - `help, quit`.
- `verbRegistry.ts` - `verbGroups` (the list of groups) and `createVerbRegistry` (flattens, rejects duplicate names).

## Adding a verb (later phases)

1. Create `verbs/<group>Verbs.ts` exporting `export const <group>Verbs: readonly Verb[] = [ ... ]` (for example `economyVerbs.ts` with `why`, `zone`, `build`). Send game actions with `context.session.dispatch({kind: "...", ...})` and read with `context.session.query.run("name", args)`; keep text formatting in pure functions next to the verb so it can be unit-tested.
2. Add the array to `verbGroups` in `verbRegistry.ts`.
3. Add a test that runs the verb through `executeReplLine` (see `../runRepl.test.ts`), and a line in `docs/CLI.md`.

Verbs must not import from `src/game` outside `src/game/api` (type-only imports excepted).
