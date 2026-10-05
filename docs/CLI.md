# Terminal renderer, JSONL protocol and scenarios

Everything here runs in Node with no browser. The CLI is a renderer like the React app: it only uses `GameSession` (`src/game/api`). Source: `src/renderers/cli`, `src/game/api/scenario`; example data: `scenarios/`.

```sh
npm run cli                                 # interactive shell (also: npx vite-node src/renderers/cli/main.ts)
npm run cli -- --jsonl                      # machine protocol on stdin/stdout (alias: npm run cli:jsonl)
npm run cli -- --script scenarios/kernel-smoke.json
npm run cli -- --help
```

Exit codes: 0 ok, 1 a scenario step failed, 2 bad arguments / unreadable or invalid scenario file, 70 unexpected crash (message on stderr).

## Interactive verbs

| Verb | Effect |
| --- | --- |
| `new [seed] [difficulty] [mapSize]` | Start a game. `difficulty`: `peaceful`, `steady`, `harsh`. `mapSize`: `0`-`2` or `small`, `medium`, `large` (omit it for no starting map). Without a seed one is drawn from `Math.random` and shown in the output. |
| `step [n]` | Advance n ticks (default 1) and print the events. While paused no tick runs, but queued commands are applied once (D-39). |
| `run-until <path> <op> <value> [maxTicks]` | Step until a path of the `state` view satisfies the comparison, e.g. `run-until time.tick gte 500`. Default limit 10000. |
| `pause`, `resume`, `speed [name\|value]` | Clock control. Speeds: `quarter 250`, `half 500`, `normal 1000`, `double 2000`, `quadruple 4000`. |
| `status` | Tick, day, hour, pause/speed, seed, difficulty, counts. |
| `map [mapId]` | ASCII map (default: first map): one glyph per terrain (`.` grassland, `,` fertile soil, `T` forest, `~` water, `^` mountain, `#` rock wall, `_` wood floor, `=` road, `o` stone deposit; unknown terrains show their first letter), `@` for entities, zones drawn over the terrain (uppercase glyph while active, lowercase while not: `S` stockpile, `P` pantry, `F` farm field, `B` bakery, `R` bedroom, `D` dwelling, `H` throne room) with a `zones:` legend line, and a legend. Square maps draw one character per tile; Voronoi maps are rasterized onto 72x36 characters, each taking the terrain of the nearest cell site (deterministic). |
| `entities [prototype] [limit]` | List entities. |
| `inspect <id>` | One entity and its components; characters also get a `skills:` and a `traits:` line. |
| `events [n]` | The last n events (default 20). |
| `jobs [boardId]` | Every job board (or one) with mode, pause state, open and claimed counts, its postings (`#id jobType status [by #worker] prio wage at cell`) and the last finished ones. |
| `stock [materialId]` | What the storages hold: storage and slot counts, one line per material (total, reserved, available, room for more) and the stockpiles (`#id chest at cell prio accepts filter, free slots: contents`); with a material, its totals and which storage holds it. Carried goods and construction sites are not counted. |
| `zones [mapId]` | The zones: `#id type on map N: status, tiles[, room][ (first gap)]`. |
| `zone <id>` | One zone: status, tiles, storage filter, workers with the affinity bucket and every gap. `zone designate <type> <mapId> <cell>...` and `zone delete <id>` queue the commands `DesignateZone` / `DeleteZone` (applied on the next tick). |
| `orders [workstationId]` | The production orders: `#id recipe done/quantity at workstation #N: status, priority[, crafting progress/duration by #crafter]`, each unfinished order followed by its first blocked reason. |
| `order <id>` | One order with its posting and every blocked reason (`MissingInput materialId=flour required=1 available=0 noProducer=true`). `order create <recipeId> <quantity> [workstationId] [priority]`, `order cancel <id>`, `order pause <id>`, `order resume <id>`, `order priority <id> <0-100>` and `order interrupt <workstationId>` queue `CreateProductionOrder`, `CancelProductionOrder`, `SetProductionOrderPaused`, `SetProductionOrderPriority` and `CancelCraft` (applied on the next tick). |
| `sites [mapId]` | The construction jobs in claim order: `#id kind prototype at map:cell: status, priority[, urgent][, paused], material delivered/required[, progress/duration by #builder][, supplier #N]`, each followed by its blocked reasons, then the jobs that finished in the last game day. |
| `build <id> <mapId> <cell>...` | Places a blueprint: `wall` takes many cells (`PlaceWall`), `door` one (`PlaceDoor`), anything else one cell (`PlaceFurniture`); the placement is checked first and a refusal is printed (`TierLocked (Unlocks at Village)`). `build check <id> <mapId> <cell>` only checks. `build menu` lists the definitions with materials, ticks and lock text. `build cancel <jobId>`, `build remove <entityId>` (take a building down), `build pause|resume <jobId>`, `build priority <jobId> <0-100>` and `build front <jobId>` queue `CancelConstructionJob`, `QueueDeconstruction`, `SetConstructionJobPaused`, `SetConstructionPriority` and `MoveConstructionJobToFront` (applied on the next tick). |
| `why <entityId>`, `why posting <id>`, `why order <id>` | Explains a citizen, workstation, build site, zone, job board, loose pile, posting or production order: its state (`Active (Working jobTypeId=fell.trees postingId=3)`, `Idle`, `Blocked`), every reason (`MissingInput materialId=flour required=1 available=0 noProducer=false cause=Workstation#11`) and below `because (Complete|Cycle|DepthCap|Gone):` the chain of causes, each with its own primary reason. |
| `idle [all]` | The Idle & Blocked list, oldest stall first: `Citizen#4 Idle since 120: NoJobsAvailable jobBoardId=2`. Only subjects that held their state for 12 ticks are listed; `idle all` adds the ones still settling (`(settling)`). |
| `flow [materialId]` | The production flow of the last days, largest deficit first: `bread: +6.0/day -8.0/day net -2.0/day, stock 10, 5.0 days of supply, trend ...` (`surplus` when the net is not negative). With a material: the window totals and who produced and consumed it (`produced by 18 Recipe Workstation#12`). |
| `save <file>`, `load <file>` | Write / read a save file. |
| `help [verb]`, `quit` | Help and exit. |

Blank lines and `#` comments are ignored, so a verb script can be piped in. Adding a verb: see `src/renderers/cli/verbs/README.md`.

## JSONL protocol

One JSON object per input line, one JSON line per response, in order; blank lines are skipped; the process exits 0 at EOF. stderr is used only for fatal crashes.

| Input line | Meaning |
| --- | --- |
| `{"kind":"step","ticks":10}` | A command: any registered `kind` with its payload (kernel kinds: `new-game`, `load-game`, `save-game`, `pause`, `resume`, `set-speed`, `set-tick-interval`, `step`; later phases add more). |
| `{"query":"time","args":{}}` | A query by name (`args` optional). Kernel queries: `state`, `time`, `entities`, `entity`, `maps`, `map`, `cell`, `settlement`, `event-log`, `pending-commands`. |
| `{"hash":true}` | The state hash: `{"hash":"...16 hex...","tick":N}` as result. |

Responses: `{"ok":true,"result":<data>,"events":[{seq,tick,name,payload}...]}` or `{"ok":false,"error":{"kind":"no-game","message":"...","issues":[...]},"events":[]}`. `error.kind` values are the `ApiErrorKind` strings of D-39; a line that is not a JSON object answers `invalid-command`. The session has no entropy source, so a `new-game` needs an explicit `options.seed` (otherwise `missing-entropy`): runs are reproducible by construction. A `save-game` result is the save text; feed it back as `{"kind":"load-game","save":"..."}`.

## Scenario format

A scenario is a JSON file `{ "name": string, "seed": 0..4294967295, "options"?: {...}, "steps": [...] }`. The runner starts a game with `{...options, seed}`, validates every step before running, and stops at the first failure with its step index (`-1` = the initial new-game) and expected/actual values. Same scenario, same result, every run.

| Step | Meaning |
| --- | --- |
| `{"step": n}` | Run n ticks. |
| `{"command": {"kind": ...}, "atTick"?: n, "expectError"?: kind}` | Dispatch a command, first advancing to tick `atTick` (fails if the clock is already past it or paused); `expectError` makes an `ApiErrorKind` the expected outcome. |
| `{"assert": {"query": name, "args"?: {...}, "path": "a.b.0.length", "op": op, "value"?: json}}` | Run a query and compare the value at the dotted path (object keys, array indices, `length`). `op`: `eq` (deep), `gt`, `gte`, `lt`, `lte` (numbers), `exists` (present and not null; no `value`), `includes` (array element, substring, or object key). |
| `{"assertHash": {"label"?: s, "equals"?: hash, "matches"?: label}}` | Check the state hash against a literal and/or an earlier labelled hash; `label` records it. |
| `{"saveLoad": true}` | Save, load the save back, require an identical state hash. |
| `{"replay": true}` | Replay the session's command log into a fresh session and require the identical hash. |
| `{"debugSpawn": {"prototypeId", "mapId", "cells": [..], "overrides"?, "inventory"?: [{"materialId", "quantity"}]}}` | **Scenario and test use only.** Spawn one entity of a prototype on every cell (component overrides, starting items), queued like a command (applied by the next tick, replays). It needs the command `DebugSpawn`, which only `createScenarioSession` (the default of `runScenario`) registers; against a real game session the step fails. Used to build what construction (3.5) will build, such as walls, a door, an oven and a stocked chest. |

Failure output (`--script` prints it on stderr, exit 1):

```
FAIL deliberately-failing: step #1: assertion failed: time.tick eq 6
  expected: 6
  actual:   5
```

Programmatic use: `parseScenario(text)` and `runScenario(scenario, {createSession?, stepTypes?})` from `src/game/api/scenario/`; `tests/e2e/scenarios.test.ts` runs every file in `scenarios/` that way. Adding a step type: `src/game/api/scenario/README.md`.

## Tests

`tests/e2e/scenarios.test.ts` (in-process, plus run-twice determinism), `tests/e2e/cli.test.ts` (spawns the CLI with `process.execPath` and the local `vite-node`: JSONL session, `--script` exit codes, same-seed state-hash determinism across two processes), `tests/e2e/asciiMap.test.ts` (golden maps in `tests/e2e/golden/`; refresh with `vitest run -u` after an intentional rendering change).
