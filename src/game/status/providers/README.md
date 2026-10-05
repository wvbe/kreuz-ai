# src/game/status/providers

The built-in status providers (spec 025 FR-005, DECISIONS D-51). Each one maps what the owning system already derives into `Reason` values; none stores anything.

- `citizenProvider.ts` - subject `Citizen` (adult humanoid with `Citizen` and a task queue). Active with an activity when the top-level task is a claimed job (`Working`), `ai.satisfy` (`Eating` / `Sleeping`) or `jobboard.visit` (`WalkingToBoard`); Idle otherwise with the way the claim would fail: `NoReachableJobBoard`, `Paused` (every reachable board), `AwaitingDecision` (a claimable posting exists, the citizen has not walked yet), `NoJobsAvailable {jobBoardId}`, and per posting `NoQualifiedWorker {skillId, requiredLevel}`, `Unreachable {entityId}` or (back-off) `NoJobsAvailable`.
- `workstationProvider.ts` - subject `Workstation`: `explainWorkstation` of production (`NoOrders` = Idle, otherwise the reasons of the first order that cannot start), plus `AwaitingWorker` while its craft job waits on the board; Active (activity `Crafting`) while it crafts.
- `orderProvider.ts` - subject `ProductionOrder` (unfinished orders): `explainOrder` plus `AwaitingWorker`.
- `siteProvider.ts` - subject `ConstructionSite`: `siteBlockers` of construction; a missing material gets `noProducer` and the producer chain of FR-009 (`inputProducer`), plus `AwaitingWorker`.
- `zoneProvider.ts` - subject `Zone`: Blocked with `ZoneRequirementsUnmet {zoneTypeId, gaps}` (the `ZoneGapKind` gaps) until the zone is active. A dwelling zone is a Zone like any other (D-18: the Dwelling subject of 4.5 is separate).
- `boardProvider.ts` - subject `JobBoard`: `Paused {jobBoardId}` for the player pause, `ZoneInactive {zoneId}` (cause: the zone) for the system pause.
- `postingProvider.ts` - subject `JobPosting`: claimed = Active; open = `Paused` (cause: the board), `NoQualifiedWorker`, `Unreachable` or `AwaitingWorker`.
- `loosePileProvider.ts` - subject `LoosePile` (a `loose_pile` that holds goods): `NoStorageDestination {materialId}` per material no storage accepts, `AwaitingWorker` while its haul posting is open.
- `awaitingWorker.ts` - `awaitingWorker(engine, postingId)`: the shared `AwaitingWorker {postingId}` reason with the posting as cause. `productionReasons.ts` - `fromProductionReasons` / `fromProductionCause`: production's `{kind, params, causeRef}` (the 025 names) to status reasons.

Adding a provider for a new subject: write `xProvider.ts` exporting a `StatusProvider`, add a test with a synthetic world (`../testStatusWorld.ts`), and register it in `registerStatus.ts` (or call `getStatusService(engine).registerProvider` from your own `register*` function).
