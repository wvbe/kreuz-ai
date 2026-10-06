# src/game/crier

The Town Crier fleet (spec 017 FR-010 to FR-013, US6, DECISIONS D-12 and D-53, plan task 3.1c). The player edits a user-managed job board only through a crier: the command queues a **pending update**, a citizen with the `TownCrier` component walks to the board and applies it on arrival. Systems (construction, production, zones, auto-posters) post to boards at once and never use a crier. The engine registers the crier for itself (`registerCrier` in the `GameEngine` constructor, after the job boards).

- `crierTypes.ts` - ids and constants (`crierSystemId`, `deliverTaskType`, `deliverTaskPriority` 80, abandon reasons), the enums `CrierStatus`, `BoardChangeKind`, `UpdateOrigin`, `DeliveryMethod`, the types `BoardChange`, `PendingBoardUpdate`, `TownCrierData` and the events `jobboard.update.queued / applied / abandoned`, `towncrier.dispatched`.
- `townCrierComponent.ts` - the `TownCrier` component (`status`, `boardQueue`, `carrying`) with a strict Zod schema; it lives in the entities save section.
- `CrierService.ts` / `crierServiceRegistry.ts` - the pending updates and their id counter, saved in the section `systems.towncrier`. `getCrierService(engine)` finds it.
- `boardUpdates.ts` - `queueBoardUpdate` (validates, queues), `applyBoardUpdate` (applies on arrival), `abandonUpdate`, `cancelBoardUpdate`, `detachFromCrier`.
- `dispatchCriers.ts` - `dispatchCriers` (nearest free crier takes all waiting updates of a board) and `recoverCriers` (keeps crier state and tasks consistent every tick).
- `createDeliverTask.ts` - `createDeliverTask`, the `towncrier.deliver` task: walk to the board with a `move` child, apply on arrival.
- `crierFleet.ts` - `appointCrier`, `dismissCrier`, `loseCrierLoad`.
- `crierQueries.ts` - `listCriers`, `availableCriers`, `deliverTaskOf`, `tripToBoard` (path cost and ticks).
- `crierViews.ts` - `buildPendingUpdateViews` (query `pending-updates`: crier, ETA, progress, waiting reason) and `buildCrierViews` (query `town-criers`).
- `registerCrier.ts` - the component, the task, the save section, the before-delete hook, the slot-7 system `towncrier`, the commands `PostJob`, `RemovePosting`, `ModifyPosting`, `CancelPendingBoardUpdate`, `AppointTownCrier`, `DismissTownCrier` and the two queries. `testCrierWorld.ts` - test helper: a job test world with a user-managed board.

## Rules

- `PostJob`, `RemovePosting` and `ModifyPosting` need a **user-managed** board (`BoardNotUserManaged` otherwise) and are checked when queued (unknown job type, locked tier, cell off the map, posting not on the board). The board keeps its old state until a crier arrives. `PostCustomJob` (jobs folder) still posts at once for tests and scripts.
- Dispatch runs every tick in slot 7. Waiting updates are grouped by board (oldest first); the free crier with the cheapest path takes all of that board's waiting updates, gets a `towncrier.deliver` task at priority 80 (above jobs, below critical needs) and is `Traveling`. A crier that is walking never takes more; further changes wait for the next free crier (finite fleet). With no crier at all, updates wait (`pending-updates` says `NoTownCrier`, the board status says `AwaitingTownCrier`).
- Travel time is the walk itself (path cost at the citizen's move speed), so a far board takes measurably longer. A crier that is interrupted by a critical need keeps its load and gets a fresh task from `recoverCriers`. A crier without a delivery lives like any settler and works jobs.
- Cancelling a pending update (`CancelPendingBoardUpdate`) removes it; a crier that carried only that update is released and its walk cancelled. A deleted board abandons its updates (`board_gone`). A deleted crier loses what it carried (`crier_lost`); waiting updates survive. Dismissing a crier returns its load to the queue.
- Not done here (task 4.3): the Steward origin, Notice Post and Bell Tower delivery (`DeliveryMethod` has the values), the Steward-cannot-be-crier rule and the seat-of-government check (`NoSeatOfGovernment`); there is no Throne Room yet, so a crier starts from wherever it stands.
