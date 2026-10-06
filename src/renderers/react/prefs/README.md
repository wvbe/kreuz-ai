# prefs

Renderer preferences; never part of a save or of the game state.

- `rendererPrefs.ts` - autosave interval (ticks), toast burst limit, badge and zone toggles; load and save through a storage that may be missing or throw.
- `terrainColors.ts` - the colour tables: terrain id to colour, zone type to overlay colour.
