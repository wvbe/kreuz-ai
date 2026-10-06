# views

The status, flow, chronicle and settlement views (plan 6.5), each a screen registered in `screens/screenRegistry.tsx`.

- `IdleBlockedScreen.tsx`, `groupIdleBlocked.ts` - the Idle and Blocked list grouped by reason kind, oldest first.
- `blockedReasonText.ts` - the reason kinds and their modern-English sentences.
- `FlowScreen.tsx`, `flowFormat.ts` - the production flow table, per-day formatting, trend arrows, deficit sort, FlowSource totals.
- `ChronicleScreen.tsx`, `chronicleRequests.ts` - the chronicle and journal screen and the store other panels use to open it filtered.
- `SettlementProgressPanel.tsx`, `SettlementScreen.tsx` - tier, next-tier checklist, unlocks preview and milestones (side panel and screen).
- `focusSubject.ts` - find a status subject on a map, select it and ask the camera to centre on it.
- `SubjectLabel.tsx` - styled name of a citizen or kind and id of another subject.
- `standingOrderRequests.ts` - the hook that opens the "Keep in stock..." form for a material (no-op until the standing-orders panel registers one).
- `views.css` - styles of these views.
- `uiSmoke.test.tsx` - plan 6.6: scenario files through `EngineHost` with the in-process state hash, and the screens against the result.
