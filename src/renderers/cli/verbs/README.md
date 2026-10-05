# src/renderers/cli/verbs

The REPL commands, one file per verb group. A verb is `{name, usage, summary, run(args, context)}` (`Verb.ts`); `run` returns `verbDone(lines)` or `verbFailed(message)` and reaches the game only through `context.session` (a `GameSession`).

- `Verb.ts` - `Verb`, `VerbContext`, `VerbOutput`, `FileIo`, helpers `verbDone`, `verbFailed`, `parseCount`.
- `kernelVerbs.ts` - `new, step, run-until, pause, resume, speed, status, save, load`.
- `inspectVerbs.ts` - `map, entities, inspect, events`.
- `metaVerbs.ts` - `help, quit`.
- `verbRegistry.ts` - `verbGroups` (the list of groups) and `createVerbRegistry` (flattens, rejects duplicate names).

## Adding a verb (later phases)

1. Create `verbs/<group>Verbs.ts` exporting `export const <group>Verbs: readonly Verb[] = [ ... ]` (for example `economyVerbs.ts` with `why`, `zone`, `build`). Send game actions with `context.session.dispatch({kind: "...", ...})` and read with `context.session.query.run("name", args)`; keep text formatting in pure functions next to the verb so it can be unit-tested.
2. Add the array to `verbGroups` in `verbRegistry.ts`.
3. Add a test that runs the verb through `executeReplLine` (see `../runRepl.test.ts`), and a line in `docs/CLI.md`.

Verbs must not import from `src/game` outside `src/game/api` (type-only imports excepted).
