# src/game/engine

Engine kernel building blocks.

- `Prng.ts` - PCG32 generator with named, persisted streams (spec 011). Integer-only API.
- `EventBus.ts` - typed pub/sub with a FIFO queue drained at the tick boundary (spec 010).
- `TickPipeline.ts` - the single `tick()` primitive. `TickSlot` pins the 21 canonical slots of DECISIONS section 2 (a test compares the enum to that document); systems register with an explicit `{ id, slot, order }`. Slot 0 skips the tick when paused and flushes `tick.begin`, slot 2 advances `GameTime`, slot 20 drains the bus.
- `AutoRunner.ts` - optional real-time driver and the only file in `src/game` allowed to use timers (lint override). All timing goes through an injected `Scheduler`; tests use a fake one.
- `IdCounters.ts` - persisted, never-reused monotonic ID counters (`CounterName` = the root `counters` keys of DECISIONS D-05). IDs start at 1.

Depends on `../time` for the clock. Used by every other folder under `src/game`.
