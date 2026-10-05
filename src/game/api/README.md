# src/game/api

The ONE facade renderers, the CLI and tests use (spec 024, DECISIONS D-23/D-39, plan "headless contract"). Import `GameSession` and the view types; do not reach into the engine.

- `GameSession.ts` - `new GameSession(content?, {entropy?, errorSink?, migrations?, recentEventLimit?})`. `dispatch(command)` (never throws; returns `CommandResult`), `newGame`, `step(n)`, `runUntil(predicate, maxTicks)`, `save()` / `load(text)`, `stateHash()`, `commandLog`, `replay(log, {expectedHash?})`, `query` (`SessionQuery`), `events` (`subscribe(pattern, handler)`, `recent(n)`), `registerSystem(definition)`. No timers: a host wraps the session in an `AutoRunner`.
- `Command.ts` - `CommandKind` (kebab-case values), payload Zod schemas and the typed `Command` union of the kernel commands: `new-game`, `load-game`, `save-game`, `pause`, `resume`, `set-speed`, `set-tick-interval`, `step`.
- `CommandResult.ts`, `CommandLog.ts` - result/failure types (`{ok:true, commandId, queued, data, events, droppedEvents}` | `{ok:false, error:{kind, message, issues?}}`), `RunStopReason`, `CommandLogEntry` (`{commandId, tick, appliedTick, command}`), `commandLogSchema`, replay types.
- `ApiError.ts`, `toApiError.ts` - `ApiErrorKind` (stable kebab-case strings), the thrown `ApiError`, and the conversion of engine errors (`InvalidOptionsError`, `InvalidSaveFormatError`, ...) into it.
- `defineCommand.ts`, `defineQuery.ts` - typed builders for the registrations a phase passes to `registerSystem`.
- `CommandQueue.ts` - the FIFO of queued commands plus the command id counter; saved as `systems.commandQueue`.
- `kernelSystem.ts` - the system the session registers: slot-1 queue application, the kernel commands and queries, all through the same path later phases use.
- `Views.ts`, `viewBuilders.ts`, `SessionQuery.ts` - the view model (plain readonly JSON built from copies) and the typed query methods; `query.run(name, args)` serves any registered query.
- `EventLog.ts` - bounded recent-event buffer (session convenience, not game state).

## Adding a command and a query (no file in this folder changes)

```ts
session.registerSystem({
  id: "jobs.board",
  commandHandlers: {
    "jobs.pause-board": defineCommand({
      schema: z.object({ boardId: z.number().int() }).strict(), // payload = command without `kind`
      handler: ({ boardId }, engine) => { /* validate, change state; throw to reject */ return null; },
      // mode: CommandMode.Immediate to apply at dispatch instead of queueing
    }),
  },
  queries: {
    "jobs.board": defineQuery({
      schema: z.object({ boardId: z.number().int() }).strict(),
      run: ({ boardId }, engine) => ({ /* readonly JSON built from copies */ }),
    }),
  },
});
session.dispatch({ kind: "jobs.pause-board", boardId: 3 }); // queued, applied at slot 1
session.query.run("jobs.board", { boardId: 3 });
```

Queued commands emit `command.applied` / `command.rejected {commandId, commandKind, code}`. Every accepted command lands in `commandLog`; `replay(log)` into a fresh session gives the identical state hash.
