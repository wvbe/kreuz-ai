# src/game/ai/behavior

The leaves of the v0 behavior trees (`src/game/content/data/behavior-trees.json`), registered by `registerAiHandlers`.

- `aiHandlers.ts` - the condition `any_need_below_critical`, the action `satisfy_critical_need` (utility choice among the critical needs that have a plan, then an `ai.satisfy` task at priority `Need`, or `Collapse` for a zero need that is slept off) and the action `idle_wander` (stand still or walk somewhere, at idle priority, only when the entity has no task). A leaf that only enqueues a task returns `Success` at once; progress lives in the task, not in the tree.
- `pickWanderCell.ts` - `pickWanderCell`: uniform among the cells reachable within `wanderRadiusCost`, one draw from the `ai.wander` stream.

When `satisfy_critical_need` fails (nothing can satisfy the critical needs), the selector falls through to `idle_wander`, so a starving settler keeps moving instead of freezing.
