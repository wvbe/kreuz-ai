# src/renderers/cli

The terminal renderer: play and test Kreuzvibe with no browser (plan task 1.10, full reference in [docs/CLI.md](../../../docs/CLI.md)). Node only (its own `tsconfig.json` has no DOM lib). It drives the game solely through `GameSession` and the `src/game/api` view/command/scenario types; ESLint rejects value imports from the rest of `src/game`.

Run: `npm run cli` (interactive), `npm run cli -- --jsonl`, `npm run cli -- --script scenarios/kernel-smoke.json`.

- `main.ts` - entry run by `vite-node`; wires stdin/stdout/files to `runCli`.
- `runCli.ts` - `parseCliArgs`, `runCli(argv, host)` (mode selection, exit codes `CliExit`), injected `CliIo` so it runs in-process under test.
- `runJsonl.ts` - the JSONL protocol: `handleJsonlLine`, `runJsonl`.
- `runRepl.ts` - `executeReplLine`, `runRepl` (readline-driven loop, no timers).
- `renderAsciiMap.ts` - pure ASCII rendering of square and Voronoi maps (deterministic nearest-site rasterization), terrain glyph table.
- `collectEntityMarkers.ts` - finds entity cells through the query facade.
- `formatViews.ts` - pure text formatting of views and events. `formatJobs.ts` - the `jobs` verb output. `formatStock.ts` - the `stock` verb output. `formatZones.ts` - the `zones` / `zone` verb output. `formatProduction.ts` - the `orders` / `order` verb output. `formatStatus.ts` - the `why` / `idle` / `flow` verb output. `formatCrops.ts` - the `fields` verb output. `collectZoneMarks.ts` - the zone overlay of the `map` verb (`renderAsciiMap` option `zones`).
- [verbs](verbs/README.md) - the REPL verbs and how to add one.

Formatting and rendering are pure functions, so they are unit-tested without a process; `tests/e2e/cli.test.ts` spawns the real CLI.
