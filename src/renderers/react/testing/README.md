# testing

Helpers for the renderer's tests (production code never imports them).

- `fakeScheduler.ts` - a hand-driven `Scheduler`: no real time passes in a test.
- `testScenes.ts` - square and voronoi scenes for the map math.
- `renderApp.tsx` - renders the whole app in jsdom over a real `GameSession` with a stub in place of the WebGL canvas.
- `playScenarioOnHost.tsx` - plays a scenario file through a host (toast host mounted) and through the in-process runner, memoised; its test is the plan 6.6 smoke test of the views.
- `runScenarioThroughHost.ts` - plays a scenario's commands and steps through `EngineHost`, to compare its state hash with the CLI path.
- `mapGestures.ts` - hover, click and drag on a cell of the rendered map (screen position from the camera the stub canvas got).
