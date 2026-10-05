# src/game/ai/decision

The utility half of the hybrid AI (spec 013 FR-003/011/012/014/017/022, DECISIONS D-25 and D-45). The behavior tree gives the structure; this folder decides which critical need to serve.

- `decisionContext.ts` - `buildDecisionContext`: needs (with critical flag and rank in the priority order), mood and risk chance, relationship summary, coins and `WealthClass` (`poorCoins` / `wealthyCoins` of the content constants). `wealthClassOf`.
- `rolePriority.ts` - `roleOf` (Merchant if the prototype `sellsItems`, Guard if the dominant skill is `combat`, else Worker; nothing is stored) and `needPriorityOrder` (the prototype's `needPriority`, else the role's leading needs, then the rest in registry order).
- `decisionFactors.ts` - the default scoring: `needBaseScore` (`(needCount - rank) * 1000`), factors `urgency` (0..999), `emergency` (+10000 at a need of zero) and `wealth_luxury` (+-300 on comfort, faith, social).
- `chooseAction.ts` - `scoreCandidates` and `chooseAction`: `score = base + sum(factors)`, integers only, highest wins, ties go to the lowest candidate id. No randomness. `DecisionFactor` is the plugin interface (`AiService.registerDecisionFactor`).
- `planNeed.ts` / `needPlanTypes.ts` - `planNeed` finds a concrete way to satisfy a need: own inventory first, then the registered need sources (`AiService.registerNeedSource`), then the nearest reachable bed, then the ground (reduced by `groundSleepRate`). A `NeedPlan` is plain JSON and is stored in the `ai.satisfy` task.

## Plugging in a need source

A later task (stockpiles, market, kitchen) registers a `NeedSourceFinder` with `getAiService(engine).registerNeedSource(finder)`. It receives the engine, the entity, the need and the authored method and returns a `NeedPlan` (`kind: Consume`, `sourceId` = the entity whose inventory holds the item, `cellIndex` = where to stand, `materialId`, `amountMilli`) or null. The settler walks there with a `move` task and takes the item out of the source's inventory.
