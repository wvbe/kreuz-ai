# src/game/identity

Citizen identity (spec 028 identity part, DECISIONS D-17, D-44): period names drawn from the content name lists, derived skill titles, offices and the styled name. The journal, chronicle, finest tracking and `renameCitizen` belong to task 4.6.

- `identityTypes.ts` - `IdentityData`, `Title` / `TitleRank` (`Practitioner`, `Master`; no title is `null`), `Office`, the stream name `identity.names`, event names and payloads (`identity.named`, `identity.title.changed`).
- `identityComponent.ts` - the `Identity` component (given name, byname|null, `nameOrdinal`, `nameListId`, `titleSnapshot`, sorted `seenSkills`) with a strict schema; lives in the entities save section.
- `nameText.ts` - `fullName`, `sameName` (case-insensitive), `romanNumeral`, `lowestFreeOrdinal`.
- `drawName.ts` - `drawName` (weighted given name, byname with `bynameChance`, redraws up to `nameRedrawLimit`, then the lowest free ordinal) and `ordinalFor` (also used for fixed names).
- `assignIdentity.ts` - `assignIdentity(engine, entityId)` names a new humanoid citizen (call after it joined the government, `spawnSettlers` does) and queues `identity.named`; `takenNames` is the uniqueness scope (living government members).
- `deriveTitle.ts` - `deriveTitle(content, entity, current)`: Practitioner from `titleThreshold`, Master from the lowest `masterSkillThreshold` of the guilds that use the skill, hysteresis `titleSwitchMargin`. `updateTitle.ts` - `updateTitle(engine, id)` compares with the snapshot and queues `identity.title.changed`.
- `styledName.ts` - `formatStyledName` (pure, from the `name-formats` templates), `officesOf`, `stylePartsOf`, `styledName(engine, entity)`.
- `identityViews.ts` - `buildIdentityView` (query `identity-of`). `registerIdentity.ts` - `registerIdentity(engine)` (the engine does it for itself): component, the before-delete hook, the `skill.increased` subscription, load validation and the query. `IdentityError.ts` - `IdentityError` / `IdentityErrorKind`.

## Rules

- Names are drawn only from the `identity.names` stream, once per new citizen: given name, then byname with probability `bynameChance` (850 permille). A prototype with `givenName` draws nothing.
- Uniqueness is among the living members of the government faction: a colliding full name is redrawn, and after `nameRedrawLimit` redraws the last draw keeps the lowest free ordinal `>= 2` (shown as a roman numeral, "Ansel atte Brook II"; with a title it follows the given name, "Ansel II the Baker").
- The title is derived, never authoritative; the snapshot only detects change. It is set silently at creation and recomputed on `skill.increased`.
- Styled name: plain `{given} {byname}`, Practitioner `{given} the {noun}`, Master `{given}, Master {noun}`, then one suffix per faction led (`Reeve of the Settlement`, `Master Baker of the Bakers' guild`).
- `entity.deleted.name` is the styled name at deletion. The identity hook is registered before the factions hook so the offices of a deleted leader are still readable.
