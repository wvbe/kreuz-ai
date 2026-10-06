# src/game/ai/tasks

Task handlers for settler behavior (DECISIONS D-01 step machines).

- `satisfyTask.ts` - `ai.satisfy`, data `{ plan: NeedPlan }`. Phase `approach` walks to the plan's cell with a `move` child task (`approach_failed` if it fails), then `act`: a `Consume` plan takes one item out of the source's inventory (`source_gone` if it is no longer there) and satisfies the need at once; a `Sleep` plan raises the need every tick until `sleepWakeThreshold` (ground sleep adds the `slept_on_ground` mood influence). A sleeper wakes early (the task completes) when another critical need that can be satisfied now wins the utility decision (`chooseCriticalNeed`), e.g. hunger with food at hand; a collapsed settler (task priority `Collapse`, the need was exactly zero) is never woken (D-180).
- `idleTask.ts` - `ai.idle`, data `{ ticks }`: a serialized `UntilTick` wait, then done.

New task kinds register with `engine.taskHandlers.register(...)`; the behavior tree of an entity decides when they are enqueued.
