# screens

- `screenRegistry.tsx` - the screens of the shell in menu order; later tasks replace a `PlaceholderScreen` entry with the real component.
- `sidePanels.ts` - the panels docked beside the map (selection, build menu, zones, construction, pending commands); later tasks append theirs.
- `MapScreen.tsx` - gathers the map's data from queries and turns clicks into selection or placement commands.
- `NewGameScreen.tsx`, `newGameOptions.ts` - difficulty (with one-line texts), seed, map size, starting tier.
- `SettingsScreen.tsx` - preferences and save or load.
- `SelectionDock.tsx` - the side dock; its first panel is the inspection panel (`../panels`).
- `ContentScreen.tsx` - the content browser: live search over the `content-registries` query, interlinked entries, `Unlocks at <Tier>` from `unlocks`.
- `contentRequests.ts` - `openContentEntry(host, kind, id)`: other screens link a material or recipe to the content browser, which opens on it.
- `PlaceholderScreen.tsx` - stand-in for screens of task 6.4 not yet built.
