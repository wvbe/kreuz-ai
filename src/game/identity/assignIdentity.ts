import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { membersOf } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { deriveTitle } from "./deriveTitle";
import { drawName, ordinalFor } from "./drawName";
import type { DrawnName, TakenName } from "./drawName";
import { identityComponent } from "./identityComponent";
import { identityNamedEvent, identityStreamName } from "./identityTypes";
import type { IdentityNamed } from "./identityTypes";

/**
 * Names of the living government citizens other than `exceptId` (the uniqueness scope of spec 028
 * FR-004).
 *
 * @param engine - The engine that owns the entities.
 * @param exceptId - The citizen being named, excluded.
 * @returns Their names and ordinals.
 */
export function takenNames(engine: GameEngine, exceptId: EntityId): TakenName[] {
  const government = governmentFactionId(engine);
  if (government === null) {
    return [];
  }
  const taken: TakenName[] = [];
  for (const member of membersOf(engine, government)) {
    const identity = getComponent(member, identityComponent);
    if (member.id !== exceptId && identity !== undefined && identity.givenName !== "") {
      taken.push({
        givenName: identity.givenName,
        byname: identity.byname,
        nameOrdinal: identity.nameOrdinal,
      });
    }
  }
  return taken;
}

/**
 * Names a freshly spawned citizen (spec 028 FR-002, FR-004, FR-005, DECISIONS D-17): call once,
 * after `initializeCharacter` and after the citizen joined its factions. A prototype that fixes
 * `givenName` (and optionally `byname`) draws nothing from the stream and only gets the ordinal
 * rule; otherwise the name is drawn from the prototype's name list on `identity.names`. Sets the
 * title snapshot silently (no `identity.title.changed` at creation) and queues `identity.named`.
 * Entities without `Identity` or that are not humanoids are left untouched.
 *
 * @param engine - The engine that owns the entity.
 * @param entityId - The new citizen.
 */
export function assignIdentity(engine: GameEngine, entityId: EntityId): void {
  const entity = engine.store.require(entityId);
  const identity = getComponent(entity, identityComponent);
  const humanoid = engine.content.humanoids.find(entity.prototype);
  if (identity === undefined || humanoid === undefined) {
    return;
  }
  const taken = takenNames(engine, entityId);
  let name: DrawnName;
  if (humanoid.givenName !== undefined) {
    const byname = humanoid.byname ?? null;
    name = {
      givenName: humanoid.givenName,
      byname,
      nameOrdinal: ordinalFor(humanoid.givenName, byname, taken),
    };
  } else {
    name = drawName({
      list: engine.content.nameLists.require(humanoid.nameListId),
      stream: engine.prng.stream(identityStreamName),
      bynameChancePermille: engine.content.constants.bynameChance,
      redrawLimit: engine.content.constants.nameRedrawLimit,
      taken,
    });
  }
  identity.givenName = name.givenName;
  identity.byname = name.byname;
  identity.nameOrdinal = name.nameOrdinal;
  identity.nameListId = humanoid.nameListId;
  identity.titleSnapshot = deriveTitle(engine.content, entity, null);
  const payload: IdentityNamed = { entityId, ...name };
  engine.bus.emit(identityNamedEvent, payload);
}
