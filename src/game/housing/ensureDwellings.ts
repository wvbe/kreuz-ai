import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { zoneComponent } from "../zones/zoneComponent";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { dwellingZoneTypeId } from "../zones/zoneTypes";
import { dwellingComponent } from "./dwellingComponent";

/**
 * Gives an active `dwelling` zone its `Dwelling` component, a Hovel without progress (spec 029
 * US1: the state starts when the base requirements are met). Zones that already have one are left
 * alone.
 *
 * @param engine - The engine.
 * @param zoneId - A zone entity id.
 * @returns True when the component was added.
 */
export function ensureDwelling(engine: GameEngine, zoneId: EntityId): boolean {
  const entity = engine.store.get(zoneId);
  const zone = entity === undefined ? undefined : getComponent(entity, zoneComponent);
  if (
    entity === undefined ||
    zone === undefined ||
    zone.zoneTypeId !== dwellingZoneTypeId ||
    !zone.active ||
    engine.store.isPendingDelete(zoneId) ||
    getComponent(entity, dwellingComponent) !== undefined
  ) {
    return false;
  }
  engine.store.addComponent(zoneId, dwellingComponent);
  return true;
}

/**
 * Runs {@link ensureDwelling} over every dwelling zone (a safety net for zones that became active
 * while the event was not seen, and for saves).
 *
 * @param engine - The engine.
 * @returns The ids of the zones that became dwellings, ascending.
 */
export function ensureDwellings(engine: GameEngine): EntityId[] {
  return getZoneService(engine)
    .zones()
    .filter((entity) => ensureDwelling(engine, entity.id))
    .map((entity) => entity.id);
}
