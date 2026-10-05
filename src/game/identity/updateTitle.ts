import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { deriveTitle } from "./deriveTitle";
import { identityComponent } from "./identityComponent";
import { identityTitleChangedEvent } from "./identityTypes";
import type { IdentityTitleChanged } from "./identityTypes";

/**
 * Recomputes a citizen's title and compares it with the stored snapshot (spec 028 FR-010): when
 * it differs the snapshot is replaced and `identity.title.changed` is queued, once per call.
 * Entities that do not exist or have no `Identity` are ignored.
 *
 * @param engine - The engine that owns the entity.
 * @param entityId - The citizen.
 * @returns True when the title changed.
 */
export function updateTitle(engine: GameEngine, entityId: EntityId): boolean {
  const entity = engine.store.get(entityId);
  const identity = entity === undefined ? undefined : getComponent(entity, identityComponent);
  if (entity === undefined || identity === undefined) {
    return false;
  }
  const oldTitle = identity.titleSnapshot;
  const newTitle = deriveTitle(engine.content, entity, oldTitle);
  if (JSON.stringify(oldTitle) === JSON.stringify(newTitle)) {
    return false;
  }
  identity.titleSnapshot = newTitle;
  const payload: IdentityTitleChanged = { entityId, oldTitle, newTitle };
  engine.bus.emit(identityTitleChangedEvent, payload);
  return true;
}
