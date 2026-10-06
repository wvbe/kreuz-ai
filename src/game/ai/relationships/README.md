# src/game/ai/relationships

The minimal relationship model of spec 013 FR-006/007 (DECISIONS D-25).

- `relationshipsComponent.ts` - the `Relationships` component `{ entries: [{ otherId, affinityMilli, lastTick, history: [{ kind, deltaMilli, tick }] }] }`: at most 16 entries ascending by `otherId`, at most 8 history records each, affinity `-100000..100000`. Asymmetric by design; faction standing is a separate baseline.
- `relationshipEvents.ts` - `recordRelationshipEvent` and `effectiveAffinityMilli` (D-210): the writer and the time decay of the affinity.
- `relationshipSummary.ts` - `summarizeRelationships`: count and integer mean affinity, which the `DecisionContext` carries.

Only the data model, persistence and the summary exist. The writers (gifts, conflicts, time decay, eviction of the entry with the oldest `lastTick`) belong to the tasks that cause relationship changes.
