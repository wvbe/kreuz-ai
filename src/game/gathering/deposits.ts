import type { GameEngine } from "../engine/GameEngine";
import { getGatheringService } from "./gatheringServiceRegistry";
import { depositDepletedEvent, oreTerrainId, stoneTerrainId } from "./gatheringTypes";

/**
 * How many times a deposit of a terrain can be worked before it is exhausted: `oreDepositCharges`
 * for iron ore deposits, `stoneDepositCharges` for stone deposits (content constants).
 *
 * @param engine - The engine.
 * @param terrainId - Terrain id of the cell.
 * @returns The charges of a fresh deposit, or null when the terrain is no deposit.
 */
export function depositCharges(engine: GameEngine, terrainId: string): number | null {
  if (terrainId === oreTerrainId) {
    return engine.content.constants.oreDepositCharges;
  }
  if (terrainId === stoneTerrainId) {
    return engine.content.constants.stoneDepositCharges;
  }
  return null;
}

/**
 * The charges left in a deposit cell.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The charges left, or 0 when the cell is no deposit (any more).
 */
export function chargesLeft(engine: GameEngine, mapId: number, cellIndex: number): number {
  const map = engine.maps.get(mapId);
  const full = map === undefined ? null : depositCharges(engine, map.terrainAt(cellIndex));
  if (full === null) {
    return 0;
  }
  return getGatheringService(engine).remainingAt(mapId, cellIndex) ?? full;
}

/**
 * Takes one charge from a deposit cell. When the last charge goes, the cell becomes the terrain
 * its deposit `clearsTo` and `gathering.deposit.depleted` is emitted, so mining is finite.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns True when a charge was taken, false when the cell is no deposit.
 */
export function takeCharge(engine: GameEngine, mapId: number, cellIndex: number): boolean {
  const left = chargesLeft(engine, mapId, cellIndex);
  const map = engine.maps.get(mapId);
  if (left === 0 || map === undefined) {
    return false;
  }
  const service = getGatheringService(engine);
  if (left > 1) {
    service.setRemaining(mapId, cellIndex, left - 1);
    return true;
  }
  service.clearRemaining(mapId, cellIndex);
  const clearsTo = engine.content.terrainContent.find(map.terrainAt(cellIndex))?.clearsTo;
  if (clearsTo !== undefined && clearsTo !== null) {
    map.setTerrain(cellIndex, clearsTo);
    engine.bus.emit(depositDepletedEvent, { mapId, cellIndex, terrainId: clearsTo });
  }
  return true;
}
