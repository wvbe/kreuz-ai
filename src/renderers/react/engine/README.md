# engine

The bridge between React and the `GameSession` (plan 6.1).

- `EngineHost.ts` - owns the session and the clock (an `AutoRunner` behind an injectable `Scheduler`: the only timer of the renderer). Exposes `dispatch`, `step`, `commands`, `store`, `selection`, `tools`, `navigation`, `toasts`, preferences, autosave, `saveText`/`loadText`.
- `GameStore.ts` - external store whose state is a version number; runs each distinct query once per version; keeps recent events and the game epoch.
- `StoreBase.ts` - base of the small immutable-state stores (`subscribe`/`getSnapshot`).
- `ToastStore.ts` - toasts; they expire with game ticks, never a real timer.
- `gameCommands.ts` - the typed command surface (`pause`, `resume`, `setSpeed`, `step`, `placeBuild`, `newGame`, generic `send`) and `speedOptions`.
- `engineContext.ts`, `EngineProvider.tsx`, `useEngineHost.ts` - the React context.
- `useGameState.ts` - `useGameState(selector)`, `useQuery(name, args)`, `useEvents(pattern)`, `useGameVersion()`.
- `useStaticQuery.ts` - a query cached per game epoch (map geometry).
- `useStore.ts` - subscribe a component to any store.
- `matchEventPattern.ts` - event topic patterns (`command.*`, `**`).
