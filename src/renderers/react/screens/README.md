# screens

- `screenRegistry.tsx` - the screens of the shell in menu order; later tasks replace a `PlaceholderScreen` entry with the real component.
- `sidePanels.ts` - the panels docked beside the map; later tasks append theirs.
- `MapScreen.tsx` - gathers the map's data from queries and turns clicks into selection or placement commands.
- `NewGameScreen.tsx`, `newGameOptions.ts` - difficulty (with one-line texts), seed, map size, starting tier.
- `SettingsScreen.tsx` - preferences and save or load.
- `SelectionDock.tsx`, `SelectionSummary.tsx` - the side dock and its minimal first panel.
- `PlaceholderScreen.tsx` - stand-in for screens of tasks 6.3 to 6.5.
