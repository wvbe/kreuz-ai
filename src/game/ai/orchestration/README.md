# src/game/ai/orchestration

Slot 5 of the tick pipeline (DECISIONS section 2).

- `runAiDecisions.ts` - `isDueForDecision` and `runAiDecisions`. Per entity in ascending id: an entity with a behavior tree and a task queue is **due** when its queue is empty, or when all its tasks are below need priority (100) while a need is critical. A task at need priority or above makes the entity committed and it is left alone. A due entity gets one `engine.behavior.tick`; leaves enqueue tasks, the task system runs them at slot 6.

## Plugging in work (jobs)

Job-board claims (task 3.1) enqueue their tasks at a priority above `AiTaskPriority.Idle` and below `AiTaskPriority.Need` (for example 50): the arrival interrupts wandering at once, the tree does not run while the job task is the only thing the settler has and no need is critical, and a critical need (100) interrupts the job gracefully. A claim made at slot 7 is picked up by the task system at slot 6 of the next tick. A tree such as `basic_needs` can later get a branch before `idle_wander` that asks the job board; nothing here changes.
