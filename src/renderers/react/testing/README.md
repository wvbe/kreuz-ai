# testing

Helpers for the renderer's tests (production code never imports them).

- `fakeScheduler.ts` - a hand-driven `Scheduler`: no real time passes in a test.
- `testScenes.ts` - square and voronoi scenes for the map math.
- `renderApp.tsx` - renders the whole app in jsdom over a real `GameSession` with a stub in place of the WebGL canvas.
- `runScenarioThroughHost.ts` - plays a scenario's commands and steps through `EngineHost`, to compare its state hash with the CLI path.
