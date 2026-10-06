# The browser UI

A React and three.js renderer over the headless engine (spec 024, plan phase 6). It is a view layer: state comes out of queries, changes go in as commands, exactly as in the CLI (`docs/CLI.md`). Desktop only; the GUI uses generated primitives, no external models.

## Run it

```sh
npm install
npm run dev      # vite dev server, open the printed URL
npm run build    # type-check and build the app into dist/
npm test         # unit and jsdom tests (WebGL is stubbed)
```

Start a game on the New game screen (difficulty with a one-line description, seed, map size, starting tier). The game starts paused; use the time bar to resume, change speed (1/4x to 4x) or step. Drag the map to pan, wheel to zoom, Q and E (or the buttons) to rotate, click to select. Settings has the autosave interval, toast limit, badge and zone toggles and save to file, load from file, load autosave.

## Architecture

```
main.tsx -> App -> EngineProvider(host) + AppServices -> ErrorBoundary -> AppShell
EngineHost  owns GameSession + the clock (AutoRunner behind a Scheduler: the only timer)
  store     GameStore (version, cached queries, recent events, epoch)
  selection SelectionStore   tools ToolStore   navigation NavigationStore   toasts ToastStore
  commands  typed wrappers over session.dispatch
```

- The React layer imports only `src/game/api` for values (eslint enforces it); other game modules type-only.
- Everything the player does is a command through `host.dispatch` or `host.commands`; everything shown is a query through `useQuery`. No game state lives in React.
- `GameStore` bumps a version after every tick, command, step, new or loaded game. Hooks re-evaluate per version; each distinct query runs once per version.
- The map: `MapScreen` reads `maps`, `map`, `map-geometry`, `map-entities`, `zones`, `crops`, `idle-blocked`, `validate-placement`, `identity-of`; `MapViewport` owns the camera and input; `MapCanvas` (three.js) draws. Details in `src/renderers/react/map/README.md`.

## Status, flow, chronicle and settlement views (plan 6.5)

- **Idle and blocked** (`views/IdleBlockedScreen.tsx`): subjects grouped by the kind of their primary reason, oldest stall first; a row selects the subject and centres the camera (`selection.requestFocus`). The reason line is modern English (`views/blockedReasonText.ts`).
- **Flow** (`views/FlowScreen.tsx`): per material produced, consumed and net per day, stock, days of supply and a trend arrow, largest deficit first; a row expands into the FlowSource totals and the producers and consumers (links to the subjects). "Keep in stock..." calls `openStandingOrderForm(materialId)` (`views/standingOrderRequests.ts`); the standing-orders panel registers its form with `setStandingOrderFormOpener`.
- **Chronicle** (`views/ChronicleScreen.tsx`): Major moments newest first, filter by kind or citizen id, full journal of a citizen. Other panels open it with `openCitizenJournal(host, id)` or `openChronicle(host)` from `views/chronicleRequests.ts`; `CitizenJournal` is the component for a citizen panel's Journal tab.
- **Settlement** (`views/SettlementProgressPanel.tsx`): tier and noun, the next tier's requirement checklist with a progress bar each, what the next tier unlocks and the seven milestones. It is a side panel beside the map and the body of the Settlement screen.
- **Toasts** (`notifications/`): tier and milestone reached, Major moments, housing and Steward tidings (over `toastBurstLimit` per game hour they fold into "N more tidings"), grouped `status.blocked` toasts with one switch per reason kind in Settings. A toast with a subject is a button that focuses it. Push your own with `host.toasts.push(kind, text, expiresAtTick, onActivate)`.

## Hooks and stores for panels

```tsx
const host = useEngineHost(); // dispatch, commands, selection, tools, navigation, toasts
const time = useGameState((state) => state.time); // slice of the `state` view
const maps = useQuery("maps"); // typed kernel view: {ok, data} or {ok: false, error}
const orders = useQuery<MyView>("standing-orders"); // any registered query; import the view type type-only
const events = useEvents("command.*"); // recent events by topic pattern
const selection = useStore(host.selection); // { activeMapId, entityId, cell, hoverCell, hoverEntityId, focus }
```

- Select: `host.selection.selectEntity(id, cell)`, `selectCell(cell)`, `clear()`; centre the camera and switch map: `host.selection.requestFocus(mapId, cell)`.
- Tools: `host.tools.enterPlacement("oven")` shows the ghost (red unless `validate-placement` accepts) and a click places; `host.tools.cancel()`.
- Commands: `host.commands.send({ kind: "PauseJobBoard", boardId })` for any registered command (catalogue in `docs/CLI.md`), or add a typed wrapper to `engine/gameCommands.ts`. Failures raise an error toast and return the structured result; queued commands the engine rejects show as a toast too.
- Toasts: `host.toasts.push(ToastKind.Info, "text", expiresAtTick?)`.
- Navigate: `host.navigation.navigate(Screen.Flow)`.

## Adding a panel or screen

1. Write the component (PascalCase `.tsx`, named export, TSDoc, a co-located test, a line in the folder README).
2. A screen of the shell: replace its `PlaceholderScreen` entry in `screens/screenRegistry.tsx`. A panel beside the map: append `{ id, title, component }` to `screens/sidePanels.ts`.
3. Test with `renderApp()` from `testing/renderApp.tsx` (the whole app over a real `GameSession`, a stub canvas and a hand-driven scheduler): `app.start()` starts the standard game (seed 42, Small), `app.host` drives it, `app.fake.fireMany(n)` runs n clock ticks.

## Inspection and content browser (plan 6.3)

The first side panel is the inspection panel (`panels/InspectionPanel.tsx`). Click something on the map: an entity shows its name, kind and position, then a status line (the primary reason of `explain`, or what it does while active) with a "why?" button. The popover lists every reason and the chain of causes; each cause is a link that selects it and centres the map. Characters have tabs for Overview (action, need bars, mood and health, skills, traits, factions and offices), Inventory (stacks, weights, slots) and Journal (the newest lines and a link to the chronicle). Zones show a requirement checklist with its gaps and the goods stored inside; dwellings show level, residents, streaks and what is needed to keep or reach a level. Workstations, build sites and storage have their own views. A tile shows terrain, move cost, buildable, zone and occupants; a tile with several entities has a "Next on this tile" button.

The Content screen searches live across every content registry (`content-registries`, `content-entry`): a recipe links to its inputs, outputs and workstation, a material to the recipes that use it, furniture to the recipes it enables. Locked content shows `Unlocks at <Tier>` from the `unlocks` query.

Building blocks for other panels (`src/renderers/react/ui`): `NeedBar` (labelled meter), `StackList` (stacks with quantity, weight, capacity), `KeyValueList`, `Checklist`, `Tabs`, `Link` and `EntityLink` (select and focus). `panels/PrimaryStatus` and `panels/WhyPopover` take an entity id (or a posting or order id with its kind) and can be dropped into any list; `panels/reasonText.ts` turns reasons into sentences.

## Command interface (plan 6.4)

Side panels beside the map (`src/renderers/react/command/`):
- **Build**: the `build-menu` query grouped by category (Structure, Workstations, Storage, Comfort and beds, Religion, Utility), a search box, locked entries greyed with "Unlocks at <Tier>". Choose an entry to place it: the map shows the ghost, the panel lists why the hovered cell is refused (`validate-placement`), a click sends `PlaceFurniture` or `PlaceDoor`. The Wall entry starts the rectangle tool: drag a box, release, `QueueWalls` is sent for the cells of the box that accept a wall. Escape or Cancel leaves the tool.
- **Zones**: pick a zone type (locked ones greyed), drag over cells, release: `DesignateZone`. Click a zone's cell to see its status and gaps, then Add tiles or Remove tiles (drag again), Delete zone, or set its material filter (`SetZoneMaterialFilter`; comma-separated categories and material ids). Merge offers (`zone-merge-offers`) show Merge and Keep apart (`ConfirmZoneMerge`).
- **Construction**: the `construction-queue` with pause, priority, to front and cancel per job. Select a built piece on the map and press Deconstruct (`QueueDeconstruction`).
- **Pending commands**: the `pending-updates` a Town Crier still carries, with ETA, progress and Cancel (`CancelPendingBoardUpdate`).

The **Government** screen (menu entry "Government") has tabs: Job boards (pause or resume, postings with change priority and remove, post a custom job), Pending commands, Production orders (create from the recipes of a workstation, pause, priority, cancel), Standing orders (list, edit, pause, delete, and the "Keep in stock..." form; `StandingOrderForm` takes `initialMaterialId` so other screens can offer a prefilled form), Steward and Town Crier, Diplomacy (factions with both attitudes, gift and envoy forms, directives with cancel, proposals with Accept, Reject, Counter) and Trade (treasury, traders present, sell or buy with a live `trade-quote`, orders, refined credit). There is no trade-policy screen.

Rules for these panels: every command goes through `host.commands.send` (the host raises the error toast; the form also shows the structured error beside the field, `useSender`); commands are queued and applied on the next tick, so a result appears after the next step; locked content cannot be chosen.

Map tools: `ToolStore` modes `Place`, `Paint` (`PaintAction.Designate|AddTiles|RemoveTiles`) and `Walls`; a tool that strokes passes a `stroke` prop (`MapStrokeTool`) to `MapViewport`, which collects cells (`command/strokeMath.ts`) and calls `onCommit`; `MapScreen` sends them with `commitStroke`.

## Testing

- Pure map math (camera, picking, buffers, layout, colours) is plain vitest.
- Stores, `EngineHost` (fake scheduler), hooks and screens run in jsdom (`// @vitest-environment jsdom` at the top of the file) with Testing Library.
- The three.js layers run under `@react-three/test-renderer`; `MapCanvas` itself needs WebGL and is replaced by a stub through `AppServices.mapCanvas`.
- `testing/mapGestures.ts` hovers, clicks and drags cells of the rendered map; the command panels are tested by driving the UI and asserting the queries after `host.step(1)`.
- `testing/runScenarioThroughHost.test.ts` runs the checkpoint C command list through the host and requires the CLI's state hash.

## Models, indicators and links added by the audit (D-233)

- Dwelling zones are drawn with the model of their level and a red pennant while the downgrade streak runs; a Bell Tower has its model and a ring for a moment after it rang; doors swing open while an entity stands in them; wild animals have their own shape; the Notice Post has a model (`map/README.md`).
- The citizen overview shows the behavior tree and its running node, the zone the citizen stands in and the title, and offers "Appoint as Steward" or "Dismiss".
- "Keep in stock..." is on material records and recipe cards of the content browser and on inventory rows; it opens the Government screen on Standing orders with the material filled in. Material and recipe names of the Flow view and the workstation panel open the content browser on that entry.
- The content browser lists 14 categories (humanoid prototypes and name lists were added to the 12 of D-152).
- Pending updates name the other routes that can deliver them: the Notice Post and the next bell ring (query `pending-routes`).
