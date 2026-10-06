import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { seatZoneTypeId } from "../housing/arrivalCell";
import { zoneComponent } from "../zones/zoneComponent";
import { activeZonesOfType } from "../zones/zoneQueries";

/**
 * The seat of government as the Steward sees it: the lowest active throne room.
 */
export type Seat = {
  zoneId: EntityId;
  mapId: number;
  /**
   * The tile the Steward walks to (the lowest cell index of the zone).
   */
  cellIndex: number;
  tiles: readonly number[];
};

/**
 * The seat of government (spec 026 FR-008, spec 017 FR-011): the lowest active throne room zone.
 *
 * @param engine - The engine.
 * @returns The seat, or null when no throne room is active (reviews are skipped).
 */
export function findSeat(engine: GameEngine): Seat | null {
  const zoneId = activeZonesOfType(engine, seatZoneTypeId)[0];
  const zone =
    zoneId === undefined ? undefined : getComponent(engine.store.require(zoneId), zoneComponent);
  const cellIndex = zone === undefined ? undefined : Math.min(...zone.tiles);
  if (zoneId === undefined || zone === undefined || cellIndex === undefined) {
    return null;
  }
  return { zoneId, mapId: zone.mapId, cellIndex, tiles: zone.tiles };
}
