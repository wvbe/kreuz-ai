# src/game/ai

Settlers live autonomously (spec 013, DECISIONS D-25 and D-45): needs that decay and are satisfied by consuming items or sleeping, a mood model, a utility score that picks which critical need to serve, the behavior trees `basic_needs` and `idle_wander` wired to real handlers, and the movement task. The engine registers all of it for itself (`registerAi` in the `GameEngine` constructor), so every game has it.

- `aiTypes.ts` - ids, enums and data types: `AiStream` (`ai.decide`, `ai.wander`, `ai.risk`), `AiTaskType` (`move`, `ai.satisfy`, `ai.idle`), `AiTaskPriority` (`Idle` 10, `Need` 100, `Collapse` 200), `KnownNeed`, the component data types and the events `need.item.consumed`, `entity.died`, `entity.movement.started/completed`.
- `registerAi.ts` - `registerAi(engine)`: the components `Needs`, `Mood`, `Health`, `Relationships`, the task handlers, the behavior handlers, the slot-4 system `ai.needs`, the slot-5 system `ai.decision` and the query `needs-of {entityId}`. It returns the `AiService`.
- `AiService.ts` / `aiServiceRegistry.ts` - the per-engine hooks other tasks plug into: `registerNeedSource(finder)` (storage, stockpiles, markets), `registerDecisionFactor(factor)`, `setNeedDecayMultiplier(source)` (difficulty hook, default: the `needDecayMultiplier` of the game's difficulty mode), and the pathfinding service. `getAiService(engine)` finds it.
- `aiViews.ts` - the `needs-of` view and `describeCurrentAction` (what the CLI prints in `entities` and `inspect`).
- `testAiWorld.ts` - test helper: an engine with a square map and `spawn`.
- `needs/` - `Needs` and `Health` components, pure need math, access helpers, `consumeNeedItem` and the slot-4 tick `runNeedsTick`. See its README.
- `mood/` - the `Mood` component, the pure mood model, the mood-to-risk mapping and the per-tick update.
- `relationships/` - the minimal `Relationships` component and the summary the decision context reads.
- `decision/` - decision context, role-derived need priorities, utility factors, `chooseAction` and `planNeed`.
- `movement/` - the `move` task and the movement speed.
- `tasks/` - the `ai.satisfy` and `ai.idle` task handlers.
- `behavior/` - the handlers the trees name (`any_need_below_critical`, `satisfy_critical_need`, `idle_wander`) and the wander target.
- `orchestration/` - the slot-5 loop that runs the behavior tree of every entity that is due.

## How it fits together

1. Slot 4 (`ai.needs`): every need falls by its `decayPerTick` combined with the difficulty multiplier and the entity's trait modifiers. Hunger at zero costs health (`starvationHealthPerTick`); at zero health the entity dies (`entity.died` with cause `Starvation`, deletion at slot 17). Mood moves one step towards the mean need level plus its active influences.
2. Slot 5 (`ai.decision`): an entity is **due** when its task queue is empty, or when all its tasks are below need priority and one of its needs is critical (so a critical need redirects a wandering or working settler in the same tick). Due entities run one tick of their behavior tree. `satisfy_critical_need` scores every critical need that has a plan with `score = base + sum(factors)` (base from the role-derived priority order, factors: urgency, emergency at zero, wealth), the highest wins, ties go to the lowest need id, and an `ai.satisfy` task is enqueued. `idle_wander` enqueues a stand or move task at idle priority using the streams `ai.decide` and `ai.wander`.
3. Slot 6 (task system): `ai.satisfy` walks to the source with a `move` child task, then consumes an item (own inventory first, then registered need sources) or sleeps (a bed if one exists, otherwise on the ground at `groundSleepRate`).

Everything the AI keeps is in components and task records, so a save in the middle of a walk or a sleep resumes exactly.
