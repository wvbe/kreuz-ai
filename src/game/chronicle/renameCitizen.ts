import { NotableMomentKind } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { isMember } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { takenNames } from "../identity/assignIdentity";
import { ordinalFor } from "../identity/drawName";
import { identityComponent } from "../identity/identityComponent";
import { IdentityError, IdentityErrorKind } from "../identity/IdentityError";
import { identityNamedEvent } from "../identity/identityTypes";
import type { IdentityNamed } from "../identity/identityTypes";
import { styledName } from "../identity/styledName";
import { recordMoment } from "./recordMoment";

/**
 * Longest given name or byname of a rename, in characters (spec 028 FR-020).
 */
export const maxNameLength = 40;

function isPrintable(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || (code >= 127 && code < 160)) {
      return false;
    }
  }
  return true;
}

function fail(kind: IdentityErrorKind, message: string): never {
  throw new IdentityError(kind, `${kind}: ${message}`);
}

/**
 * Renames a settlement citizen (command `RenameCitizen`, spec 028 FR-020, DECISIONS D-17): the
 * given name (1 to 40 characters after trimming) and the byname (0 to 40, empty or null for
 * none) must be printable text without control characters. The collision rule is the ordinal
 * rule of naming without a redraw (the lowest free ordinal `>= 2` when a living member has the
 * full name). Queues `identity.named` and records a `Renamed` moment carrying the previous styled
 * name; the old journal entries keep the names of their time. Renaming to the name it already has
 * changes nothing.
 *
 * @param engine - The engine.
 * @param entityId - The citizen.
 * @param givenName - The new given name.
 * @param byname - The new byname, or null for none.
 * @returns True when the name changed.
 * @throws IdentityError `UnknownEntity` for an entity that is no named member of the player
 *   faction, `InvalidName` for a name that breaks the rules.
 */
export function renameCitizen(
  engine: GameEngine,
  entityId: EntityId,
  givenName: string,
  byname: string | null,
): boolean {
  const entity = engine.store.get(entityId);
  const identity = entity === undefined ? undefined : getComponent(entity, identityComponent);
  const government = governmentFactionId(engine);
  if (
    entity === undefined ||
    identity === undefined ||
    identity.givenName === "" ||
    government === null ||
    !isMember(engine, entityId, government)
  ) {
    fail(IdentityErrorKind.UnknownEntity, `entity ${entityId} is no citizen of the settlement`);
  }
  const given = givenName.trim();
  const surname = byname === null ? "" : byname.trim();
  if (given.length < 1 || given.length > maxNameLength) {
    fail(IdentityErrorKind.InvalidName, `the given name needs 1 to ${maxNameLength} characters`);
  }
  if (surname.length > maxNameLength) {
    fail(IdentityErrorKind.InvalidName, `the byname has at most ${maxNameLength} characters`);
  }
  if (!isPrintable(given) || !isPrintable(surname)) {
    fail(IdentityErrorKind.InvalidName, "names must not contain control characters");
  }
  const newByname = surname === "" ? null : surname;
  const ordinal = ordinalFor(given, newByname, takenNames(engine, entityId));
  if (
    identity.givenName === given &&
    identity.byname === newByname &&
    identity.nameOrdinal === ordinal
  ) {
    return false;
  }
  const previousName = styledName(engine, entity) ?? "";
  identity.givenName = given;
  identity.byname = newByname;
  identity.nameOrdinal = ordinal;
  const payload: IdentityNamed = {
    entityId,
    givenName: given,
    byname: newByname,
    nameOrdinal: ordinal,
  };
  engine.bus.emit(identityNamedEvent, payload);
  recordMoment(engine, {
    kind: NotableMomentKind.Renamed,
    entityId,
    params: { previousName },
  });
  return true;
}
