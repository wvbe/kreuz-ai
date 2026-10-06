import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { takenNames } from "../identity/assignIdentity";
import { ordinalFor } from "../identity/drawName";
import { identityComponent } from "../identity/identityComponent";
import { identityNamedEvent } from "../identity/identityTypes";
import type { IdentityNamed } from "../identity/identityTypes";
import { fullName, sameName } from "../identity/nameText";

/**
 * Checks a citizen's name against the living settlement members when it becomes one (spec 028
 * FR-004, DECISIONS D-17): a citizen named before it joined (a visitor, an envoy) may now share
 * its full name and ordinal with another member. Then, without a redraw, it gets the lowest free
 * ordinal `>= 2` and `identity.named` is queued.
 *
 * @param engine - The engine.
 * @param entityId - The citizen that just joined the player government.
 * @returns True when the ordinal changed.
 */
export function recheckName(engine: GameEngine, entityId: EntityId): boolean {
  const entity = engine.store.get(entityId);
  const identity = entity === undefined ? undefined : getComponent(entity, identityComponent);
  if (identity === undefined || identity.givenName === "") {
    return false;
  }
  const name = fullName(identity.givenName, identity.byname);
  const taken = takenNames(engine, entityId);
  const collides = taken.some(
    (other) =>
      sameName(fullName(other.givenName, other.byname), name) &&
      other.nameOrdinal === identity.nameOrdinal,
  );
  if (!collides) {
    return false;
  }
  identity.nameOrdinal = ordinalFor(identity.givenName, identity.byname, taken);
  const payload: IdentityNamed = {
    entityId,
    givenName: identity.givenName,
    byname: identity.byname,
    nameOrdinal: identity.nameOrdinal,
  };
  engine.bus.emit(identityNamedEvent, payload);
  return true;
}
