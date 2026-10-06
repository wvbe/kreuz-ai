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
| `find <terrainId> [limit]` | The cells of a terrain nearest to the village board with their distance: `find fertile_soil 8` shows where fields can go, `find stone_deposit` where to quarry. |
| `cell <mapId> <cell>` | One cell: terrain, walk cost, occupants and its neighbor cells. A zone that needs a room is enclosed by walls and a door on every neighbor of its cells that is not part of the zone. |
| `map [mapId]` | ASCII map (default: first map): one glyph per terrain (`.` grassland, `,` fertile soil, `T` forest, `~` water, `^` mountain, `#` rock wall, `_` wood floor, `=` road, `o` stone deposit; unknown terrains show their first letter), `@` for entities, zones drawn over the terrain (uppercase glyph while active, lowercase while not: `S` stockpile, `P` pantry, `F` farm field, `B` bakery, `R` bedroom, `D` dwelling, `H` throne room) with a `zones:` legend line, and a legend. Square maps draw one character per tile; Voronoi maps are rasterized onto 72x36 characters, each taking the terrain of the nearest cell site (deterministic). |
| `entities [prototype] [limit]` | List entities. |
| `inspect <id>` | One entity and its components; characters also get a `skills:` and a `traits:` line. |
| `events [n]` | The last n events (default 20). |
| `jobs [boardId]` | Every job board (or one) with mode, pause state, open and claimed counts, its postings (`#id jobType status [by #worker] prio wage at cell`) and the last finished ones. |
| `post <boardId> <jobTypeId> <mapId> <cell> [priority]`, `unpost <boardId> <postingId>` | Edit the user-managed village board: queue `PostJob` / `RemovePosting`. The board does not change until a Town Crier walks there and delivers it (`pending` shows the crier, ETA and progress). System postings (construction, production orders, field work, hauling) never wait for a crier. |
| `pending [cancel <updateId>]` | The board updates a crier has not delivered yet: `update #1 for board #2: post fell.trees at cell 296; carried by #7, eta 12 ticks, 45% of the way` or `waiting for a crier (NoTownCrier)`. `pending cancel <id>` queues `CancelPendingBoardUpdate`. |
| `crier [appoint\|dismiss <entityId>]` | The Town Crier fleet (`crier #7 available at map 1 cell 9`); `appoint` / `dismiss` queue `AppointTownCrier` / `DismissTownCrier`. A fresh game has one crier (the first peasant). |
| `stock [materialId]` | What the storages hold: storage and slot counts, one line per material (total, reserved, available, room for more) and the stockpiles (`#id chest at cell prio accepts filter, free slots: contents`); with a material, its totals and which storage holds it. Carried goods and construction sites are not counted. |
| `zones [mapId]` | The zones: `#id type on map N: status, tiles[, room][ (first gap)]`. |
| `zone <id>` | One zone: status, tiles, storage filter, workers with the affinity bucket and every gap. `zone designate <type> <mapId> <cell>...` and `zone delete <id>` queue the commands `DesignateZone` / `DeleteZone` (applied on the next tick). |
| `orders [workstationId]` | The production orders: `#id recipe done/quantity at workstation #N: status, priority[, crafting progress/duration by #crafter]`, each unfinished order followed by its first blocked reason. |
| `order <id>` | One order with its posting and every blocked reason (`MissingInput materialId=flour required=1 available=0 noProducer=true`). `order create <recipeId> <quantity> [workstationId] [priority]`, `order cancel <id>`, `order pause <id>`, `order resume <id>`, `order priority <id> <0-100>` and `order interrupt <workstationId>` queue `CreateProductionOrder`, `CancelProductionOrder`, `SetProductionOrderPaused`, `SetProductionOrderPriority` and `CancelCraft` (applied on the next tick). |
| `sites [mapId]` | The construction jobs in claim order: `#id kind prototype at map:cell: status, priority[, urgent][, paused], material delivered/required[, progress/duration by #builder][, supplier #N]`, each followed by its blocked reasons, then the jobs that finished in the last game day. |
| `build <id> <mapId> <cell>...` | Places a blueprint: `wall` takes many cells (`PlaceWall`), `door` one (`PlaceDoor`), anything else one cell (`PlaceFurniture`); the placement is checked first and a refusal is printed (`TierLocked (Unlocks at Village)`). `build check <id> <mapId> <cell>` only checks. `build menu` lists the definitions with materials, ticks and lock text. `build cancel <jobId>`, `build remove <entityId>` (take a building down), `build pause|resume <jobId>`, `build priority <jobId> <0-100>` and `build front <jobId>` queue `CancelConstructionJob`, `QueueDeconstruction`, `SetConstructionJobPaused`, `SetConstructionPriority` and `MoveConstructionJobToFront` (applied on the next tick). |
| `fields [zoneId]` | The crop cells of the `farm_field` zones: `field #id: N cells, a fallow, b sown, c ripe` and a line per fertile cell (`map:cell crop stage[, growth%, ripe in N ticks]`). Cells of the field that are not fertile soil are not listed; designate the field with `zone designate farm_field <mapId> <cell>...`. |
| `animals [wild\|livestock]` | The animals (task 5.3): `N animals: a wild, b livestock` and a line per animal (`#id species (kind) at map:cell, health, hunger[, holds N material]: action`). Wild animals are placed at a new game; hunting one is a `hunt.game` posting (`PostJob` with `entityId`, the hunter takes the drops), `butcher.animal` and `tend.animals` work on livestock. |
| `traders` | The travelling traders: `trader #11 trader_caravan Present at 1:282, leaves at tick 1470: 400 coins, standing 0`, what each sells and buys, and when the next caravan comes (`trader_caravan: next caravan at tick 898`). A caravan arrives about day 3, stays two days and returns every six. |
| `trade sell\|buy <traderId> <materialId> <quantity>` | Order settlers to sell goods to a trader or buy goods from it (`TradeSell` / `TradeBuy`, applied on the next tick; a refused order shows as `command.rejected` together with `trade.order.refused` that names the reason, e.g. `RefinedCreditExhausted: the refined credit for iron_ingot covers 4, 5 asked`). Settlers carry the goods and the coins (a trip costs the 1 coin wage); the order waits while the stock, the coins or the trader are missing and survives the trader's departure. `trade orders` lists the orders (`order #1 sell iron_ore 6/10 with trader_caravan: Open, earned 14 coins, waiting: NoStock`), `trade offers` the open offers, `trade quote sell\|buy <traderId> <materialId> [quantity]` a price, `trade cancel <orderId>` queues `CancelTradeOrder`. |
| `treasury` | The coins of the settlement treasury (wages are paid from it; selling to traders fills it) and the wages that wait for coins. |
| `diplomacy` | The other factions: standing both ways with its band (hostile, wary, neutral, friendly, allied), leader, trip time, agreement and envoys under way; `HOSTILE` is flagged. |
| `gift <factionId> <coins>` / `gift <factionId> <materialId> <quantity>` | Send a gift (coins or goods from the treasury) with an envoy; the standing rises when it arrives (queues `IssueDiplomaticAct`). |
| `envoy <factionId> agreement\|overture\|war\|peace\|neutrality` | Send an envoy with a trade agreement (accepted at 20 or better), an overture or a declaration. `envoy cancel <envoyId>` cancels one on its way and refunds the gift; `envoy` alone lists every envoy. |
| `directives` | Your envoys: act, target, ETA, deadline (576 ticks after the dispatch), cargo. |
| `agreements` | The trade agreements (a 10 % discount at that faction's traders). |
| `proposals` / `respond <proposalId> accept\|reject\|counter` | The overtures and agreements NPC factions offered you, and your answer (reject costs 3 standing). |
| `leader <factionId> <entityId\|none>` | Set the leader of a faction (a member), or none: the next tick the faction picks a successor. |
| `tier` | The settlement tier and its noun, when each tier was reached and the checklist of what the next tier needs (`[x]` met, `[ ]` open: `population 6/8`, `dwellings of level hovel or better 0/4`, `active throne_room zone 1/1`); the tier is checked on the first tick of each day. |
| `unlocks [all\|<tier>\|<kind>]` | Content the tier in force has not unlocked, with the tier that unlocks it and `Unlocks at <Tier>`; `all` lists everything, a tier (`village`) or a kind (`furniture`, `zone_type`, `recipe`, `job_type`, `dwelling_level`) filters. |
| `milestones` | The seven settlement milestones: the tick and subjects of the ones reached, `not yet` for the rest. |
| `homes` | The dwellings: `housing: 4 dwelling(s), 4 active; 8 housed, 0 homeless, 0 free slot(s); hovel 4, cottage 0, ...`, why settlers cannot come (`settlers cannot come: NoSeatOfGovernment`) and one line per dwelling with its level, residents, rent and streaks. A dwelling is a zone: `zone designate dwelling <mapId> <cell>...` around a walled room (four tiles or more, a door, a bed) and it appears here once the room is active. Settlers are housed once a day (06:00) and up to two new ones arrive per day while a free bed remains and a throne room stands. |
| `home <dwellingId>` | One dwelling: level, residents against capacity, the upgrade and downgrade streaks against their grace days (3 and 7 days), what its current level needs to keep (`[x]` met) and what the next level needs to be reached, and the foods eaten lately. |
| `chronicle [n] [citizen <id> \| kind <kind>]` | The settlement chronicle, newest first: the last n (default 20) Major moments (`*`), e.g. `* day 12, tick 3328: Godiva the Hauler hath become the hamlet's finest hauler.`; filter by a citizen id (also one who died) or a kind (`took_office`, `became_finest`, `mastery_achieved`, `died`, `settlement_milestone`, `tier_reached`). |
| `journal <id>` | One citizen's journal, oldest first, up to 16 entries: `journal of #3: 4 of 16 entries`, arrival, firsts, titles, guilds, offices, homes. `inspect <id>` shows its last three lines. |
| `standing` / `standing <id>` | The standing orders ("keep N of a material in stock"): `#1 bread: Restocking, stock 12/20 (restock at 15), settlement, priority 80, runs 2 on the way, 1 open, 1 claimed - MissingInput (materialId flour, ...)`; with an id also the recipe, the board the runs go to, every reason and each run. |
| `standing create <materialId> <target> [recipe=ID] [threshold=N] [priority=N] [zone=ID] [board=ID]` | Queues `CreateStandingOrder`; the threshold defaults to 75 % of the target. `standing edit <orderId> [target=N] [threshold=N] [priority=N] [board=ID\|none]`, `standing pause\|resume\|delete <orderId>` queue `UpdateStandingOrder`, `PauseStandingOrder`, `ResumeStandingOrder`, `DeleteStandingOrder`. |
| `steward` / `steward appoint <entityId>` / `dismiss` / `review` / `board <boardId\|none>` | The Steward: who holds the office, the throne room, his own board, the last and the next review and the Notice Posts; `appoint`, `dismiss`, `review` (one extra review on the next pass) and `board` queue `AppointSteward`, `DismissSteward`, `RequestStewardReview`, `SetStewardBoard`. The Steward reviews once a day at 06:00 and only while a throne room is active. |
| `ledger` | The refined credit: `trader_caravan: 5 iron_ingot may still be bought, credit 5.5 (iron_ore x 0.5)`. Selling raw goods to a trader that refines them adds credit at once; it never expires. |
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
