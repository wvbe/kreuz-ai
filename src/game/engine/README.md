# src/game/engine

Engine kernel building blocks.

- `Prng.ts` - PCG32 generator with named, persisted streams (spec 011). Integer-only API.
- `EventBus.ts` - typed pub/sub with a FIFO queue drained at the tick boundary (spec 010).

Used by every other folder under `src/game`; depends on nothing else in the project.
