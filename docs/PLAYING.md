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

## Growing (settlement tiers)

The settlement starts as a Hamlet. Once a day (at the start of the day) the game checks what the next tier needs and promotes at most one tier; nothing is ever lost again. Village needs 8 settlers, 4 dwellings and an active throne room (a walled zone of at least 9 cells with a table, designated as `throne_room`).

```
tier                                 # the tier, when each was reached, the next tier's checklist ([x] met)
unlocks                              # what is still locked and where it opens ("Unlocks at Village")
unlocks village                      # what Village will open
milestones                           # seven firsts: throne room, worship space, market, guild, master craftsman, trade agreement, dwelling upgrade
```

Locked buildings, zones, recipes and jobs are listed and can be looked at, but placing, designating, ordering or posting them is refused until the tier is reached.

## Homes and settlers (the way to Village)

A **dwelling** is a `dwelling` zone: a walled room of at least four cells with a door and a bed. Once it is active it is a Hovel with room for as many residents as it has beds (at most two). Every morning (06:00) the homeless settlers move into the best dwelling with a free bed, and then, if the settlement has a throne room and beds are still free, up to two new settlers walk in from the edge of the map. Beds are the limit: six founders and two beds too many make two newcomers, and eight settlers in four Hovels make a Village.

```
homes                                # housed, homeless, free slots, one line per dwelling
home 63                              # one dwelling: residents, streaks, what its level and the next level need
zone designate dwelling 1 196 217 218 219     # a 2x2 room (walls on the cells around it, a door, beds on its cells)
build wooden_bed 1 196               # a bed on a cell of the room: capacity is the number of beds, at most two for a Hovel
build wooden_bed 1 217
```

Households also keep goods (bread for a Cottage) in a chest inside the dwelling and the residents fetch them from the settlement's storage; that chest and the beds belong to the residents. A Cottage needs the Village tier, six cells, two beds, two kinds of food eaten lately and bread in its chest; it pays rent into the treasury.

`scenarios/hamlet-to-village.json` plays the whole way with player commands only (seed 42, small map), and the settlement is a Village on **day 32**:

1. **Day 0** - the opening above (stockpile, fields, chest, workbench, mill, bakery) and a sawmill.
2. **Day 3** - the food comes first: `order create grind_flour 200 <mill> 60`, `order create bake_bread 400 <oven> 60` (priority 60), 24 `saw_oak_planks` at priority 38, and from the trader (`traders`) `trade buy <traderId> nails 40`.
3. **Day 5** - the throne room (ten walls, a door and a table, designated `throne_room`), 60 `cut_stone_block` at priority 36 and four 2x2 dwellings, each with a door, two beds and its own walls (most walls are shared). The rooms are queued with priorities 46 down to 43 so that they finish one after the other.
4. **Days 5-30** - settlers quarry, saw, cut and build; a room is active when its walls, door and a bed stand (the first on day 25, the throne room on day 26, the second room that day and the third on day 29, the fourth on day 30). `homes` shows the founders moving in at 06:00 of the next day.
5. **Day 31** - 06:00: the fourth room has two free beds and two settlers arrive; **day 32** - the tier check at the start of the day: `tier` says Village.

Two rules of thumb that the script follows: food orders come before everything else (a hungry settler does nothing useful), and a job that feeds another must not have the lower priority (stone and planks are cut at 36-38, the rooms that need them at 43-46; quarrying is 40 and felling 30 by default). Walls cost one stone block and a quarry trip brings four limestone (D-58); the layout of the rooms is the cheapest one the map allows (see `docs/DECISIONS.md` D-58).

## Standing orders and the Steward

Instead of `order create bake_bread 400 ...` you can say what you want in the pantry and let the Steward keep it there. A **standing order** is "keep N of this material in stock": the Steward, a citizen you appoint, counts the stock once a day at 06:00 (in the throne room's name, so one must stand: ten walls, a door and a table) and, once the stock has fallen to the restock threshold (75 % of the target by default), asks for as many single crafts as the gap needs (at most five per order and day). The Town Crier carries each ask to the village board like any posting, a baker takes it, and the order stays *Restocking* until the stock reaches the target.

```
steward appoint 3                    # a citizen of yours who is no Town Crier
standing create bread 20 priority=80 # keep 20 bread (restock at 15); the recipe is found from the material
standing create flour 12 priority=70 # bread needs flour: `why`/`standing 1` points at this order
standing                             # state, counted stock, runs on the way / open / claimed, why blocked
steward review                       # do not wait for 06:00
standing pause 1                     # runs nobody has taken are withdrawn at the next review
```

A Notice Post (Village tier) makes the crier walk to the post instead of to every board near it, and a Bell Tower (Market Town) delivers at the five bell hours without a crier at all. `scenarios/standing-orders.json` is the whole thing with player commands only: the Checkpoint C opening with the throne room first, the two standing orders and the Steward; from day 2 every loaf is ordered by the Steward and the bread stock stays above 8 for ten days. Play it on `peaceful`: on `steady` the starting bread is eaten before a throne room can stand.

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
