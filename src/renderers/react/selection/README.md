# selection

The stores panels share with the map.

- `SelectionStore.ts` - active map, selected entity and cell, hover, and camera focus requests (`requestFocus(mapId, cell)`). Read with `useStore(host.selection)`.
- `ToolStore.ts` - what a map click does (`ToolMode.Inspect`, `ToolMode.Place`); the build menu calls `host.tools.enterPlacement(id)`.
