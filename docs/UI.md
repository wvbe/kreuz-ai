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

## Testing

- Pure map math (camera, picking, buffers, layout, colours) is plain vitest.
- Stores, `EngineHost` (fake scheduler), hooks and screens run in jsdom (`// @vitest-environment jsdom` at the top of the file) with Testing Library.
- The three.js layers run under `@react-three/test-renderer`; `MapCanvas` itself needs WebGL and is replaced by a stub through `AppServices.mapCanvas`.
- `testing/runScenarioThroughHost.test.ts` runs the checkpoint C command list through the host and requires the CLI's state hash.
