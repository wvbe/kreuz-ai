# src/game

The headless, deterministic game engine (Constitution I-III). Also home of all shared utility code.

Rules enforced by lint and `tsc -b`: no DOM lib, no imports from `src/renderers`, no `Date`, `Math.random`,
timers or `fetch`. All state is JSON-serializable with integer numbers.

- [engine](engine/README.md) - kernel pieces: seeded PRNG, event bus, tick pipeline, auto runner, ID counters.
- [time](time/README.md) - the simulation clock and calendar helpers.
- [ecs](ecs/README.md) - entities, components, prototypes, queries, relationships.
- [task](task/README.md) - serializable task step machines: queue, priorities, interrupts, waits.
- [map](map/README.md) - square and Voronoi maps, terrain registry, sub-maps and links, occupant index.
- [inventory](inventory/README.md) - materials, stacked slots, weight, perishables, equipment, permissions, atomic transfers, money.
- [save](save/README.md) - GameState root, canonical save/load, validation, migrations, state hash.
- [behavior](behavior/README.md) - JSON behavior trees: DSL schema, loader checks, interpreter with serialized running node.
- [content](content/README.md) - content pack loader: Zod schemas, JSON data (vertical-slice pack v0), referential checks, per-engine `ContentRegistries`.
- [skills](skills/README.md) - `Skills` / `Traits` components, growth, work speed, affinity, trait modifier hooks.
- [factions](factions/README.md) - `Faction` / `Citizen` components, derived membership, leaders, standing data, dangling-reference clean-up.
- [identity](identity/README.md) - names from the content lists, derived titles, offices, styled names.
- [ai](ai/README.md) - settler AI: needs, mood, utility decisions, behavior handlers, movement task, starvation.
- [fauna](fauna/README.md) - animals (022 US11): the `Animal` component, 13 prototypes, senses, flee / graze / hunt handlers for the animal trees, hunger and periodic products, the `tend.animals` / `butcher.animal` / `hunt.game` executors, the `animals` query.
- [roles](roles/README.md) - handlers of the role trees of 022 US14 (`go_to_zone`, `zone_available`, `hostile_animal_near`, `engage_threat`).
- [jobs](jobs/README.md) - job boards, postings, claim order, job type executors, `fell.trees`, wages.
- [storage](storage/README.md) - reservations, `Furniture` / `Stockpile`, tiered routing, hauling (`haul.deliver`), stock queries, storage decay.
- [zones](zones/README.md) - zones and rooms: `Zone`, the furniture requirement grammar, status and `zone.*` events, merge and split, skill affinity, board pausing, zone hooks of storage.
- [production](production/README.md) - production and crafting: workstations with `ProductionOrders`, order commands, the `craft.produce` job (fetch, lock, craft, consume), output hauling, cancel semantics and blocked-reason reporting for 025.
- [gathering](gathering/README.md) - farming and gathering (014/022): crop plots on fertile cells of active farm fields, `farm.sow` / `farm.harvest`, `mine.ore` / `quarry.stone` with finite deposits, their auto-posters.
- [construction](construction/README.md) - construction (016): blueprints as `build_site` entities, placement validation, supply and build jobs, walls and doors that obstruct cells, cancel and deconstruction.
- [trade](trade/README.md) - trade and currency (019): the settlement treasury and wages, travelling traders, negotiated atomic trades, the trader refined-credit ledger (D-13) and the player's trade orders.
- [diplomacy](diplomacy/README.md) - diplomacy (021): NPC factions with seats, standing deltas and decay, envoys that carry gifts, trade agreements, declarations and overtures, proposals, incidents, leader succession, the NPC faction AI.
- [chronicle](chronicle/README.md) - moments, journals and the settlement chronicle (028): `MomentRecord` with typed params per kind, `recordMoment` (journal of 16 per citizen, chronicle of 200 Major moments), the sources on the bus, the finest table, the `Died` delete hook, `renameCitizen`, `formatMoment` and the queries `chronicle` / `journal` / `moments-since`.
- [standing](standing/README.md) - standing orders and the Steward (026): "keep N in stock" orders with hysteresis, owned runs delivered by Town Criers, the daily review at slot 14, Notice Post and Bell Tower delivery, the audience task, the status provider and the queries `standing-orders` / `standing-order` / `steward`.
- [housing](housing/README.md) - dwellings and household upgrades (029): the `Dwelling` state, the daily evaluation, requirements and streaks, supplied goods, the fetch chore, rent, arriving settlers, household storage and beds.
- [settlement](settlement/README.md) - settlement tiers (027): `SettlementProgress`, the daily tier check, the unlock table, milestones, the tier source of every gate, the reachability validator.
- [status](status/README.md) - status explanations and production flow (025): derived statuses with structured reasons from per-system providers, `explain` with cause chains, the settle tracker and `status.*` events, the Idle & Blocked list and the per-day flow ledger.

Design decisions and the command/event catalogues live in [docs/DECISIONS.md](../../docs/DECISIONS.md).
