# Playing a Hamlet in the terminal

A short guide to the opening moves. Everything here is a player command: zones, construction and production orders. Nobody gets a job by magic; settlers claim postings at the village board, so you decide what exists and the settlers do the work. The opening below is the script of `scenarios/checkpoint-c.json` (seed 42, small map) and keeps six settlers fed for at least 14 days. The full verb list is in [CLI.md](CLI.md).

```sh
npm run cli        # interactive shell; commands are applied on the next tick
```

## What you start with

Six settlers (two farmers, a carpenter, a baker, two peasants; one peasant is the Town Crier), the village board (#2) in the middle, and a storehouse chest (#9) holding 24 planks, 30 nails, 16 stone blocks and 12 bread. Bread is the only food. Hunger runs from full to empty in about four days and a settler who stays hungry loses health, so the first harvest has to be baked into bread by about day 4. Without any command everybody starves (tested).

## The chain

wheat (`farm_field`) -> `grind_flour` at a grinding mill -> `bake_bread` at an oven inside a walled `bakery` zone -> bread in a chest -> settlers eat it when they are hungry. Settlers sow, harvest, haul, build and craft on their own once the thing exists; you place the things and create the orders.

## Opening moves (seed 42, map 1)

```text
new 42 steady small

# 1. look around: where is soil, where are the neighbors of a room
find fertile_soil 10
cell 1 326

# 2. storage and fields (farm fields only grow on fertile soil; a zone needs 4 tiles)
zone designate stockpile 1 257
zone designate farm_field 1 229 230 255 256 258 279 280
zone designate farm_field 1 370 421 397 440
build chest 1 335
build chest 1 338

# 3. the workshops
build workbench 1 283
build grinding_mill 1 306

# 4. the bakery: a room is enclosed by walls and a door on every neighbor of its tiles
build wall 1 297 298 329 353 355 385
build door 1 325
build oven 1 326
zone designate bakery 1 326 327 328 354

# 5. stone: the kit has 16 of the 20 blocks the walls, oven and mill need
step 100
order create cut_stone_block 4

# 6. once the mill and the oven stand (about tick 800) start the food chain
step 700
sites
order create grind_flour 60
order create bake_bread 120

# 7. let it run, and watch
step 2080
flow bread
stock bread
idle
```

Things to know:

- Construction is queued at once, but sites wait until their materials exist (`sites` shows `MissingInput`). Production orders need their workstation to exist (a `bake_bread` order before the oven stands is refused), so orders come in two rounds.
- `fields` shows the crop cells of your fields, `zones` whether the bakery is `active` (enclosed, oven inside), `orders` how the orders progress and what blocks them.
- On another seed the cell numbers differ: use `find fertile_soil`, `map` and `cell <mapId> <cell>` (its `neighbors:` line is the ring your walls and door must cover) to plan the fields and the bakery room.
- Background gathering (felling, ore, stone) is automatic and lower priority than food work. Iron ore is for trading: see "Trading" below.

## Trading

A travelling trader arrives about day 3, stays two days, and comes back every six. It walks to the village board, buys raw goods (iron ore, limestone, logs, wheat) and sells nails, coal and hammers. It also pays for ore in **credit for iron ingots** (one ingot per two ore): the settlement can later buy exactly that many ingots, no more, and the credit never expires.

```
traders                              # is a trader here? what does it sell and buy?
trade quote sell 50 iron_ore 8       # what it pays for 8 ore
trade sell 50 iron_ore 8             # settlers fetch the ore from the chests (mining is automatic) and sell it
trade orders                         # progress: order #1 sell iron_ore 8/8 ... Done
ledger                               # trader_caravan: 4 iron_ingot may still be bought, credit 4 (iron_ore x 0.5)
trade buy 50 iron_ingot 4            # five would be refused (trade.order.refused: RefinedCreditExhausted)
treasury                             # coins: wages are paid from here, sales fill it, purchases empty it
```

The ids are those of your game (`traders` shows the trader's). A settler carries the goods or the coins, so trips take time and each costs the 1 coin wage. Bought goods are hauled into the chests. If the trader leaves before an order is done, the order waits for the next visit; unspent credit and the stock the trader keeps for you wait too. `scenarios/trade-ore-for-iron.json` plays this with the commands above (seed 42: ids 50 and 59).

## Neighbours (diplomacy)

Three factions live beyond the map edge: the travelling merchants, the Barony of Ashford (wary and quarrelsome) and the Abbey of St Wulfric (friendly). Each has a leader; your messages travel by envoy, so a gift or an agreement needs a few hundred ticks to arrive. Standing runs from -100 to 100 and is read in bands (hostile below -30, wary, neutral, friendly from 20, allied from 70); below -30 a faction will not trade and its members will not take your jobs. It drifts back toward neutral by a point every second day.

```
diplomacy                            # who they are, how they see you and you them, how far an envoy walks
gift 13 400                          # 400 coins from the treasury to the Barony: +25 in its eyes when it arrives
directives                           # your envoys: arrival tick, cargo, the tick it gives up (576 after sending)
envoy 13 agreement                   # a trade agreement: accepted once the Barony's standing toward you is 20 or more
agreements                           # 10 % off at that faction's traders
proposals                            # what they offer you (they send overtures and agreements too)
respond 1 accept                     # reject costs 3 standing; counter just closes it
```

A refused act shows `command.rejected` on the next step, and `diplomacy.act.refused` says why: `HostileGate`, `TargetLeaderless`, `InsufficientFunds`. An envoy that cannot reach anyone gives up after 576 ticks and the gift comes back to the treasury. `scenarios/diplomacy.json` plays gifts to the Barony and the agreement that follows (faction ids 10, 13 and 16 for seed 42; `diplomacy` shows yours).

## When something is wrong

- `why <entityId>` explains a settler, `why order <id>` a production order, `why posting <id>` a posting; every idle citizen has a reason (`NoJobsAvailable`, `AwaitingDecision`, ...).
- `idle` lists everything that has been stuck for a while, oldest first. `flow` shows what is produced and eaten per day and how many days the stock lasts.
- `jobs` shows the board; `post` / `unpost` edit it through the Town Crier (`pending` shows the crier on its way).

## Same game over JSONL

The CLI speaks JSON lines for other front-ends (`npm run cli:jsonl`). The opening is the same commands, for example:

```json
{"kind":"new-game","options":{"seed":42,"difficulty":"steady","mapSize":0}}
{"kind":"DesignateZone","zoneTypeId":"farm_field","mapId":1,"cells":[229,230,255,256,258,279,280]}
{"kind":"PlaceFurniture","furnitureId":"grinding_mill","mapId":1,"cell":306}
{"kind":"PlaceWall","mapId":1,"cells":[297,298,329,353,355,385]}
{"kind":"step","ticks":600}
{"kind":"CreateProductionOrder","recipeId":"bake_bread","quantity":120}
{"query":"flow-of","args":{"materialId":"bread"}}
```
