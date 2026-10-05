# src/game/task

The task runtime (spec 003 part B, DECISIONS D-01): prioritised, interruptible, serializable step machines. There is no JS `async`/`await` or promise anywhere; a task that takes many ticks is a record that a handler advances one step per tick, so a save taken between ticks resumes exactly.

- `taskTypes.ts` - the data model: `TaskRecord`, `TaskStatus` (`Pending | Running | Waiting | Completed | Cancelled | Failed`), serialized `WaitCondition` (`Event | ChildTask | UntilTick | Predicate`), `CancelToken` (`Graceful | Ungraceful` plus a `CancelReason`), `StepResult`, `TaskHandler`, `TaskContext`.
- `taskQueueComponent.ts` - the `TaskQueue` component `{ tasks, history }` and its strict Zod schema. `tasks` holds pending, running and waiting records ascending by id; `history` keeps the last `taskHistoryCapacity` (8) finished tasks.
- `TaskHandlerRegistry.ts` - per-engine registry of handlers keyed by task type (`map.travel`, `craft.produce` ...). A handler has `start`, `step`, `cancel` and an optional `requires` list of component names.
- `WaitPredicateRegistry.ts` - named pure predicates for `Predicate` waits (`{ predicateId, params }` is the serialized condition).
- `stepResults.ts` - builders `continueStep`, `waitStep`, `doneStep`, `failStep` and the wait builders `eventWait`, `childWait`, `tickWait`, `predicateWait`.
- `TaskSystem.ts` - the scheduler. `registerWith(pipeline)` installs it at `TickSlot.TaskExecution` (slot 6). Public API: `enqueue`, `cancel`, `interrupt`, `setPriority`, `getQueue`, `getRunningTask`, `rebuildWaitIndex` (call after the entity store was restored).
- `TaskError.ts` - `TaskError` with a `TaskErrorKind`.

## Rules

- Each tick, per entity in ascending id: finish pending cancellations, wake tick/predicate waits, run exactly one step of the running task (or start the pending task with the highest priority, ties by lowest id).
- A strictly higher priority arrival (enqueue, wake, or raising a pending task) flags the running task with a graceful `interrupted_by_priority` token. The flagged task and its children are cancelled at the start of the entity's next turn and the arrival starts in that same turn. Changing the priority of the running task never interrupts it. `interrupt(entity)` flags everything; entity deletion cancels ungracefully on the spot.
- Waits are data. `Event` waits are matched by one `**` bus subscription made at construction (so subscription order never depends on a save); a woken task gets `wake` set and steps on its next turn. `ChildTask` waits are same-entity; `ctx.spawnChild` creates the child.
- Handlers keep all progress in `task.phase` and `task.data` (JSON). Never close over state.
- Finished tasks emit `task.finished` and move to the history.
