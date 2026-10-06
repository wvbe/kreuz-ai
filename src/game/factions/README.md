# src/game/factions

Factions and membership (spec 021 data model, DECISIONS D-14, D-44). Factions are entities with a `Faction` component; membership lives only on the members' `Citizen.factions`, so a faction's members are always derived by scanning. The rules of diplomacy (acts, envoys, NPC factions, succession, decay) are in [diplomacy](../diplomacy/README.md); this folder keeps the data and the primitives they use.

- `factionTypes.ts` - component data types (`FactionData`, `FactionSeat`, `CitizenData`, `StandingEntry`), constants (`factionsSystemId`, `factionPrototypeId`, standing bounds) and the event names and payloads (`faction.membership.changed`, `faction.leader.changed`, `diplomacy.standing.changed`, `diplomacy.attitude.changed`).
- `attitudeBands.ts` - the `Attitude` enum (Hostile below -30, Wary below 0, Neutral below 20, Friendly below 70, Allied) and `attitudeOfValue`. `standingAttitude.ts` - `getAttitude` and `isHostilePair`, the derived hostile status that the trade gate and the labour gate read.
- `factionComponent.ts` / `citizenComponent.ts` - the `Faction` component (`contentId|null`, name, `factionType`, `leaderTitle`, `disposition`, `leaderId|null`, `standing[]` ascending by faction id) and the `Citizen` component (`factions[]` ascending and unique, `homeDwellingId`, `homeAssignedTick`) with strict Zod schemas. They live in the entities save section, so there is no section of their own.
- `factionMembership.ts` - the only writers of `Citizen.factions`: `joinFaction`, `leaveFaction` (both queue `faction.membership.changed`), plus `factionsOf`, `membersOf`, `isMember`.
- `factionLeader.ts` - `setFactionLeader` (leader must be a member, queues `faction.leader.changed`) and `pickLeaderCandidate` (D-14 succession rule: greatest total skill, ties lowest id; used for the starting government leader).
- `factionStanding.ts` - `getStanding`, `setStanding` (clamped `-100..100`, asymmetric, queues `diplomacy.standing.changed` and, when the band changes, `diplomacy.attitude.changed`), `clampStanding`. The deltas of acts, incidents and decay are in `diplomacy/standingRules.ts`.
- `factionRegistry.ts` - `governmentFactionId`, `listFactions`, `findFactionByContentId`, `spawnContentFaction`, `ensureContentFaction` (faction entities bound to `factions.json`).
- `cleanUpFactionReferences.ts` - the dangling-reference clean-up run by the entity store's before-delete hook: a deleted faction leaves every member list and standing list, a deleted leader empties `leaderId`; both queue their events.
- `registerFactions.ts` - `registerFactions(engine)` (the engine does it for itself): components, relationships (`factions`/`members`, `leader`), the hook, load validation (dangling ids are a `FactionError`), the command `SetFactionLeader` and the queries `factions`, `faction-of {entityId}`, `members-of {factionId}`.
- `factionViews.ts` - the JSON views behind the queries. `FactionError.ts` - `FactionError` / `FactionErrorKind`.

## Rules

- The government faction is the entity of prototype `government_faction` (id 1 in a new game); it is political with leader title `Reeve`. Starting settlers join it in `spawnSettlers`, and the settler with the greatest total skill becomes its leader.
- Membership is never stored on the faction. Every write goes through `joinFaction` / `leaveFaction`, so the event cannot be skipped.
- A faction is not deleted by this module; when it is (or its leader), the before-delete hook repairs every reference, so `Citizen.factions`, `leaderId` and standing never point at a missing entity.
- Standing entries equal to the default (0, no agreement) are not stored.
- The leader of a faction is set by `setFactionLeader` / the command `SetFactionLeader`; when it becomes null (deleted or cleared) the diplomacy succession pass names the next one (D-14). `Faction.seat` is the cell of an NPC faction's seat (null for the government and guilds).
