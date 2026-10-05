# src/game

The headless, deterministic game engine (Constitution I-III). Also home of all shared utility code.

Rules enforced by lint and `tsc -b`: no DOM lib, no imports from `src/renderers`, no `Date`, `Math.random`,
timers or `fetch`. All state is JSON-serializable with integer numbers.

- [engine](engine/README.md) - kernel pieces: seeded PRNG, event bus, tick pipeline, auto runner, ID counters.
- [time](time/README.md) - the simulation clock and calendar helpers.
- [ecs](ecs/README.md) - entities, components, prototypes, queries, relationships.
- [task](task/README.md) - serializable task step machines: queue, priorities, interrupts, waits.
- [behavior](behavior/README.md) - JSON behavior trees: DSL schema, loader checks, interpreter with serialized running node.

Design decisions and the command/event catalogues live in [docs/DECISIONS.md](../../docs/DECISIONS.md).
