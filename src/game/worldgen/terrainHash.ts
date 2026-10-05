import { hashText } from "../save/stateHash";
import type { GameMap } from "../map/GameMap";

/**
 * Fingerprint of the terrain of a map (16 hex characters), for golden tests and cross-engine
 * equality checks. Depends only on the cell count and the terrain id of every cell in order.
 *
 * @param map - The map.
 * @returns The hash of `count:id,id,...`.
 */
export function terrainHash(map: GameMap): string {
  const ids: string[] = [];
  for (let cell = 0; cell < map.cellCount; cell += 1) {
    ids.push(map.terrainAt(cell));
  }
  return hashText(`${map.cellCount}:${ids.join(",")}`);
}
