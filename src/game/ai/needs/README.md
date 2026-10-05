# src/game/ai/needs

Needs and health (spec 013 FR-001/002/023, DECISIONS D-25).

- `needsComponent.ts` - the `Needs` component `{ values: [{ needId, valueMilli }] }`, ascending by need id, milli-percent `0..100000`. Humanoid prototypes list every need of the pack at `needStartValue`.
- `healthComponent.ts` - the `Health` component `{ valueMilli }`, full by default.
- `needMath.ts` - pure helpers: `clampMeter`, `decayAmountMilli` (authored decay combined with the difficulty multiplier and the trait `decayRateMultiplier`, never below 1), `satisfactionAmountMilli` (trait `satisfactionBonusMultiplier`), `isCritical` (at or below the threshold).
- `needAccess.ts` - `initialNeedValues`, `getNeedValue`, `adjustNeed`, `criticalNeedsOf`.
- `consumeNeedItem.ts` - takes one item out of an inventory, raises the need, adds a short mood boost and emits `need.item.consumed {entityId, needId, materialId, quantity}`.
- `runNeeds.ts` - `runNeedsTick` (the slot-4 system body) and `applyHealthConsequences`.

## Rules

- Decay is linear per tick. Thresholds and satisfaction are not scaled by difficulty.
- Hunger at zero: health falls by `starvationHealthPerTick` per tick; at zero health `entity.died {cause: "Starvation"}` is emitted and the entity is deleted at slot 17 (`entity.deleted` carries its styled name). While no need is zero, health recovers by `healthRegenPerTick`.
- A need at zero that can be satisfied by sleeping makes the settler collapse: the sleep task gets priority `Collapse`.
