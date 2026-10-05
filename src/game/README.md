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
- [jobs](jobs/README.md) - job boards, postings, claim order, job type executors, `fell.trees`, wages.
- [storage](storage/README.md) - reservations, `Furniture` / `Stockpile`, tiered routing, hauling (`haul.deliver`), stock queries, storage decay.
- [zones](zones/README.md) - zones and rooms: `Zone`, the furniture requirement grammar, status and `zone.*` events, merge and split, skill affinity, board pausing, zone hooks of storage.
- [production](production/README.md) - production and crafting: workstations with `ProductionOrders`, order commands, the `craft.produce` job (fetch, lock, craft, consume), output hauling, cancel semantics and blocked-reason reporting for 025.

Design decisions and the command/event catalogues live in [docs/DECISIONS.md](../../docs/DECISIONS.md).
