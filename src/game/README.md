# src/game

The headless, deterministic game engine (Constitution I-III). Also home of all shared utility code.

Rules enforced by lint and `tsc -b`: no DOM lib, no imports from `src/renderers`, no `Date`, `Math.random`,
timers or `fetch`. All state is JSON-serializable with integer numbers.

- [engine](engine/README.md) - kernel pieces: seeded PRNG and the event bus (more to come: time, tick pipeline).

Design decisions and the command/event catalogues live in [docs/DECISIONS.md](../../docs/DECISIONS.md).
