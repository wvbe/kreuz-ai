# src/game/ai/movement

Movement (spec 013, DECISIONS D-04 and D-41).

- `moveTask.ts` - the `move` task. Enqueue it with `{ type: "move", data: moveTaskData(mapId, targetCell), priority }`. It plans an A* path with the pathfinding service, then each tick adds `moveSpeed` to its `progress`; whenever the progress covers the move cost of the next cell (5 fastest .. 25 very slow) the entity enters that cell, updates `Position` and the occupant index. A next cell that became non-traversable triggers a re-plan from the current cell (at most 3 times, then `blocked`); no path fails with `unreachable`. Events: `entity.movement.started` with the first step and `entity.movement.completed` on arrival. Targets on another map fail with `unreachable` (routes across map links are not followed yet).
- `movementSpeed.ts` - `moveSpeedOf`: 10 per tick (one normal cell per tick) times the `speed_multiplier` traits that cover unskilled work.

Progress, the remaining path and the re-plan counter live in the task record, so a save resumes mid-walk.
