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

Design decisions and the command/event catalogues live in [docs/DECISIONS.md](../../docs/DECISIONS.md).
