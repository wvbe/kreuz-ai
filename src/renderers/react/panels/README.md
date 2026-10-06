# panels

The inspection panels of the side dock (spec 024, plan 6.3), driven by the selection store.

- `InspectionPanel.tsx` - the registered side panel: the selected entity, else the selected tile, else "Nothing selected."
- `EntityInspection.tsx` - picks the view by what the entity is: character, zone, dwelling, workstation, build site, stockpile or anything else (name, kind, position, tabs).
- `CitizenOverview.tsx`, `InventoryTab.tsx`, `JournalTab.tsx` - a character's overview (action, the workstation it works at and the recipe it crafts as links, need bars, mood, skills, traits, factions and offices), the Inventory tab (stacks, weights, slots) and the Journal tab with a link to the chronicle.
- `describeActiveNode.ts` - names the behavior tree node a citizen runs, for the overview.
- `ZoneInspection.tsx`, `zoneChecklist.ts` - zone type, status, requirement checklist built from the zone type and the zone's gaps, workers, aggregated stored goods.
- `DwellingInspection.tsx` - level, residents, streaks against the grace days, checklists to keep and to reach a level; an inactive room falls back to the zone view.
- `WorkstationInspection.tsx`, `BuildSiteInspection.tsx`, `StockpileInspection.tsx` - workstation, build site and storage views.
- `TileInspection.tsx`, `OccupantCycler.tsx` - terrain, move cost, buildable, zone, occupants and the "Next on this tile" cycle button.
- `PrimaryStatus.tsx`, `WhyPopover.tsx` - the first line of every inspection (state and primary reason) and the "why?" popover that runs `explain` and draws the cause chain (subjects are links; a repeated subject is drawn once; at most 12 links).
- `reasonText.ts`, `statusViews.ts` - reason and activity sentences, id to words, and the string-typed views of `explain`.
- `EntityNameLink.tsx`, `entityViews.ts` - entity display names and links, component and material lookups.
- `panels.css` - styles of the panels and the content browser.

Reusable building blocks live in `../ui` (`NeedBar`, `StackList`, `KeyValueList`, `Checklist`, `Link`, `EntityLink`, `Tabs`).
