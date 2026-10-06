# src/renderers/react

The browser renderer (spec 024), built by `vite build` from the repo-root `index.html`; `npm run dev` serves it. Full guide: `docs/UI.md`.

It drives the game only through `src/game/api` (`GameSession`, its views and `createSessionRunner`); other `src/game` modules may be imported for types only (eslint enforces it). The renderer holds no game state: state comes out of queries, changes go in as commands, the same path the CLI uses.

- `main.tsx` - browser entry: creates the `EngineHost`, the real services, mounts `App`.
- `App.tsx` - providers, error boundary, `AppShell`.
- `AppShell.tsx` - menu, time bar, the routed screen, toasts.
- `AppServices.ts` - what tests replace: the WebGL `mapCanvas` and `downloadText`.
- `app.css` - the one stylesheet.
- `engine/` - `EngineHost` (owns the clock), stores, hooks, command wrappers.
- `navigation/` - the `Screen` enum and the navigation store.
- `selection/` - selection and tool stores (the API for panels).
- `prefs/` - renderer preferences and the colour tables (not game state).
- `screens/` - the screens, the screen registry and the side-panel registry.
- `map/` - camera math, picking, buffers, the three.js layers and the interactive viewport.
- `ui/` - small shared components (time bar, toasts, save and load, error boundary).
- `testing/` - helpers for tests: fake scheduler, test scenes, `renderApp`, `runScenarioThroughHost`.
