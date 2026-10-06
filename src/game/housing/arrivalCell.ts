import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { activeZonesOfType } from "../zones/zoneQueries";
import { zoneComponent } from "../zones/zoneComponent";
import { isBorderCell } from "../zones/zoneEvaluation";
import { ImmigrationBlockedReason } from "./housingTypes";
import { multiSourceCosts } from "./multiSourceCosts";

/**
 * Zone type id of the seat of government (spec 017 FR-011): the throne room.
 */
export const seatZoneTypeId = "throne_room";

/**
 * Where settlers arrive, or why they cannot: exactly one of `cell` and `blocked` is set.
 */
export type ArrivalCell = {
  cell: { mapId: number; cellIndex: number } | null;
  blocked: ImmigrationBlockedReason | null;
};

/**
 * The arrival cell of spec 029 FR-015 (recomputed at every evaluation, DECISIONS D-28): the
 * traversable cell on the border of the seat's map with the smallest path cost to the seat of
 * government (the lowest active throne room), ties broken by the lowest cell index. With no
 * active throne room the reason is `NoSeatOfGovernment`; with no border cell that reaches it,
 * `NoArrivalCell`.
 *
 * @param engine - The engine.
 * @returns The cell or the reason.
 */
export function findArrivalCell(engine: GameEngine): ArrivalCell {
  const seatId = activeZonesOfType(engine, seatZoneTypeId)[0];
  const seat =
    seatId === undefined ? undefined : getComponent(engine.store.require(seatId), zoneComponent);
  if (seat === undefined) {
    return { cell: null, blocked: ImmigrationBlockedReason.NoSeatOfGovernment };
  }
  const map = engine.maps.require(seat.mapId);
  const costs = multiSourceCosts(map, seat.tiles);
  let best = -1;
  let bestCost = Number.MAX_SAFE_INTEGER;
  for (let cell = 0; cell < map.cellCount; cell += 1) {
    const cost = costs[cell] ?? -1;
    if (cost >= 0 && cost < bestCost && map.isTraversable(cell) && isBorderCell(map, cell)) {
      best = cell;
      bestCost = cost;
    }
  }
  return best < 0
    ? { cell: null, blocked: ImmigrationBlockedReason.NoArrivalCell }
    : { cell: { mapId: seat.mapId, cellIndex: best }, blocked: null };
}
