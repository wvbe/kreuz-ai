# Kreuzvibe: Unspecified Ideas

A backlog of ideas that have no spec yet. Anything already covered by a spec in [specs/](../specs/) is not listed here. Items are unordered and unscheduled, and by owner decision everything below is out of scope for the current plan (`tasks/plan.md`, owner decision 6).

## Government & Policy

- Government types (e.g. autocracy, council, democracy) and government roles (ruler, council).
- Policy system: rules (tax, regulation, incentive) that affect entity behavior; create, modify and repeal policies; compliance tracking and policy history.
- Taxation feeding the treasury (rent from dwellings, spec 029, already pays into it).
- Voting / collective decision-making.
- Stability and unrest: governance outcomes measured (satisfaction, growth, inequality); bad governance can lead to unrest or upheaval.
- Succession of rulers and governments (NPC faction leader succession is covered by spec 021).

## Time Progression

- Seasons and seasonal effects (harvest times). The calendar helpers (day, week, month, year of 336 ticks) exist in `src/game/time`, but no system reads a season: crop growth has an inert `seasonModifier` hook (D-52).
- Aging of entities and generational change over multi-year play.

## History & Narrative

- A complete event log preserved across saves (bounded per-citizen journals and the settlement chronicle are covered by spec 028; the event log kept by a session is a convenience buffer, not game state).
- Replay of past events.
- Narrative generation from simulation events.

## Metrics & Visualizations

- Metrics time series (economy, satisfaction, inequality, ...).
- Graphs and timeline/history views.
- Heatmaps (density, satisfaction, ...).
- Per-day production/consumption flow is covered by spec 025; wider metrics remain here.

## Other

- Generate a user manual and marketing texts (`docs/PLAYING.md` is a hand-written opening guide, not a manual).
- Further renderers beyond the terminal and the React client (both exist under `src/renderers/`).

## Descoped for now

Decided by the owner and recorded in `docs/DECISIONS.md` section 7; these are cuts from specs that do exist, not new ideas.

| Item | Spec | What it means |
| --- | --- | --- |
| Envoy combat | 021 | Envoys fail only by timeout (`unreachable`); no hostiles, raids or destruction rules beyond entity deletion. |
| Touch support | 024 FR-001 | The browser client is desktop only: mouse and trackpad. |
| Trade-policy screen and command | 024 FR-010 | No `SetTradePolicy` command and no trade priorities screen; trade is driven by explicit sell and buy orders. |
| External 3D models | 024 | The map and its entities use generated primitive geometry only (no model files, no asset pipeline). |

Further items that exist in a spec but are knowingly not built are listed as "Known gaps and follow-ups" at the top of `tasks/plan.md` and in the Gaps sections of `docs/audit/`.
