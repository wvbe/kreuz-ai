import { SeatSide } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import { ceilDiv } from "../engine/fixedPoint";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { governmentFactionId } from "../factions/factionRegistry";
import type { FactionSeat } from "../factions/factionTypes";
import { marketCell } from "../trade/traderVisits";
import { distanceSquared } from "../worldgen/distanceSquared";
import { integerSqrt } from "../worldgen/integerSqrt";

/**
 * The cell on a map edge where an NPC faction has its seat (D-14, D-56): the cell whose centre is
 * the most extreme one on that side (north = lowest y, east = highest x, south = highest y,
 * west = lowest x), ties to the lowest cell index. Pure: no PRNG.
 *
 * @param engine - The engine that owns the maps.
 * @param mapId - The map.
 * @param side - The edge.
 * @returns The cell index.
 */
export function pickSeatCell(engine: GameEngine, mapId: number, side: SeatSide): number {
  const map = engine.maps.require(mapId);
  let best = 0;
  for (let cell = 1; cell < map.cellCount; cell += 1) {
    const point = map.centroid(cell);
    const current = map.centroid(best);
    const better =
      side === SeatSide.North
        ? point.y < current.y
        : side === SeatSide.South
          ? point.y > current.y
          : side === SeatSide.West
            ? point.x < current.x
            : point.x > current.x;
    if (better) {
      best = cell;
    }
  }
  return best;
}

/**
 * Where a faction has its seat: the stored seat of an NPC faction; for the player government the
 * market cell (the village centre; there is no Throne Room yet, D-56).
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The faction entity.
 * @returns The seat, or null for a faction without one (a guild, or a settlement without a board).
 */
export function seatOf(engine: GameEngine, factionId: EntityId): FactionSeat | null {
  const entity = engine.store.get(factionId);
  const faction = entity === undefined ? undefined : getComponent(entity, factionComponent);
  if (faction === undefined) {
    return null;
  }
  if (faction.seat !== null) {
    return { ...faction.seat };
  }
  return governmentFactionId(engine) === factionId ? marketCell(engine) : null;
}

/**
 * How many ticks an envoy needs from one faction's seat to another's (D-56): the straight-line
 * distance of the two cell centres divided by `envoyUnitsPerTick`, rounded up, at least 1.
 *
 * @param engine - The engine that owns the maps.
 * @param fromId - The sending faction.
 * @param toId - The receiving faction.
 * @returns The ticks one way, or null when a faction has no seat or the seats are on other maps.
 */
export function travelTicks(engine: GameEngine, fromId: EntityId, toId: EntityId): number | null {
  const origin = seatOf(engine, fromId);
  const goal = seatOf(engine, toId);
  if (origin === null || goal === null || origin.mapId !== goal.mapId) {
    return null;
  }
  const map = engine.maps.require(origin.mapId);
  const distance = integerSqrt(
    distanceSquared(map.centroid(origin.cellIndex), map.centroid(goal.cellIndex)),
  );
  return Math.max(1, ceilDiv(distance, engine.content.constants.envoyUnitsPerTick));
}
