# ui

Small shared components.

- `TimeControls.tsx` - day and hour, pause or resume, step, the five speeds.
- `ToastHost.tsx` - the toast stack (a toast with an action is a button); mounts the `NotificationBridge`.
- `SaveLoadMenu.tsx`, `downloadTextFile.ts` - save as a JSON file download, load from a file, load the autosave.
- `ErrorBoundary.tsx` - message and retry instead of a blank page.
- `NeedBar.tsx`, `StackList.tsx`, `KeyValueList.tsx`, `Checklist.tsx`, `Tabs.tsx` - building blocks for panels (props documented in TSDoc; styles in `widgets.css`).
- `EntityLink.tsx` - `Link` (text button) and `EntityLink` (selects an entity and centres the map), `selectAndFocus(host, id)`.
- `KeepInStockButton.tsx` - the "Keep in stock..." action of material records, inventory rows and recipe cards.
- `placeOfEntity.ts`, `formatMilli.ts` - where an entity is (from its `entity` view); thousandths as one-decimal text.
