# command

The player's command interface (plan 6.4, spec 024 FR-010, FR-029 to FR-031, FR-035). Every action is a command through `host.commands.send`; every list is a query through `useView` or `useQuery`. Panels register in `screens/sidePanels.ts`, the government screen in `screens/screenRegistry.tsx`.

Pure, unit-tested:
- `strokeMath.ts` - drag strokes to cells: paint (cells passed over, once each) and rectangle (cells whose centre is inside the box of two cells, so it also works on voronoi maps).
- `commitStroke.ts` - a finished stroke to `DesignateZone`, `AddZoneTiles`, `RemoveZoneTiles` or `QueueWalls` (walls only on cells `validate-placement` accepts).
- `buildMenuModel.ts` - build menu entries to categories, search, "Unlocks at <Tier>" badges.
- `commandPayloads.ts` - forms to command payloads (`CreateStandingOrder`, `CreateProductionOrder`, `PostJob` / `PostCustomJob`, gifts, envoys, `TradeSell` / `TradeBuy`) with field errors, and structured command errors to field errors.

Hooks and form pieces:
- `useView.ts` - a query as a typed view or null. `useSender.ts` - sends through `host.commands.send` and keeps the structured errors of a refusal for the form. `FormField.tsx` - labelled input with its inline error.

Side panels beside the map:
- `BuildMenuPanel.tsx` - furniture, walls and doors, grouped, searchable, locked entries greyed; placement mode with the refusal reasons of the hovered cell.
- `ZonePanel.tsx` - zone type picker (locked greyed), paint to designate, add or remove tiles, delete, material filter, merge offers.
- `ConstructionPanel.tsx` - the construction queue (pause, priority, front, cancel) and deconstruct for the selected built piece.
- `PendingPanel.tsx` - board updates a Town Crier has not delivered (ETA, progress, cancel); also the Pending tab.

The government screen (`GovernmentScreen.tsx`, the "Government" menu entry) with one tab each:
- `JobBoardsTab.tsx` - pause or resume, postings, change priority, remove, post a custom job.
- `ProductionTab.tsx` - orders and the create form from `recipes-for`.
- `StandingOrdersTab.tsx` - orders, edit, pause, delete and the "Keep in stock..." form (`StandingOrderForm`, takes `initialMaterialId` for a prefilled action elsewhere).
- `OfficesTab.tsx` - Steward and Town Criers.
- `DiplomacyTab.tsx` - factions, gifts and envoys, directives, proposals.
- `TradeTab.tsx` - treasury, traders, a sell or buy form with a live quote, orders, refined credit.
