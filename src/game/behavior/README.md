# src/game/behavior

The behavior-tree core of the entity AI (spec 013 FR-012/013/015, DECISIONS D-15 and D-25). Leaf logic for real game actions arrives with task 2.4; this folder is the JSON DSL, the loader checks, the interpreter and the hook for utility scoring.

- `behaviorTypes.ts` - the DSL types: `selector`, `sequence`, `condition`, `action` nodes (`BehaviorNodeType`), `NodeStatus` (`success | failure | running`), `BehaviorContext`, `maxBehaviorDepth` (5), `runTreeActionId`.
- `behaviorTreeSchema.ts` - the Zod schema of a tree (`behaviorTreeSchema`) and `measureTreeDepth`. Ids are lowercase snake_case, composites need at least one child, depth is at most 5 with the root at depth 1.
- `BehaviorHandlerRegistry.ts` - per-engine registry of conditions and actions by id (separate namespaces); each is `(context) => NodeStatus`. `run_tree` is reserved.
- `BehaviorTreeRegistry.ts` - loads trees atomically (`registerAll`): validates shape and depth, that every handler id is registered, that every `run_tree` reference resolves, and rejects reference cycles and chains deeper than `maxSubTreeNesting`. Duplicate tree ids are an error.
- `aiStateComponent.ts` - the `AiState` component `{ treeId, currentNode, running, lastActionTick }`: where the running node of an entity is.
- `BehaviorInterpreter.ts` - `setTree` and `tick`. A leaf returning `Running` stores the child-index path from the root; the next tick resumes at that leaf. Sub-trees (`{ "type": "action", "id": "run_tree", "params": { "treeId": "..." } }`) are expanded on the fly and the path continues into them through index 0.
- `UtilityScoring.ts` - the hook for utility AI: `UtilityFactor`, `BehaviorCandidate` and `pickBestCandidate` (`score = base + sum(factors)`, ties go to the lowest index). The actual factors and numerics come with task 2.4.
- `BehaviorError.ts` - `BehaviorError` with a `BehaviorErrorKind`.

Everything saved is in the `AiState` component, so a behavior that is `Running` survives a save and load. Conditions and actions keep their own progress in components (typically an enqueued task) and report `Running` until it is finished.
