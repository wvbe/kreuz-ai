import type { GameMap } from "../map/GameMap";

/**
 * The hop distance of spec 026 FR-021/022 (D-19): the fewest steps between two cells on the map's
 * cell adjacency graph (spec 004), whatever the terrain or the obstacles on the way. It is not a
 * path cost: Notice Posts and Bell Towers reach "so many cells away", walls or not. A breadth
 * first search that stops after `limit` steps, so a far cell costs no more than a near one.
 *
 * @param map - The map both cells are on.
 * @param from - Start cell index.
 * @param target - Target cell index.
 * @param limit - Largest distance of interest.
 * @returns The number of hops, or null when the target is more than `limit` hops away.
 */
export function hopDistance(
  map: GameMap,
  from: number,
  target: number,
  limit: number,
): number | null {
  if (from === target) {
    return 0;
  }
  const seen = new Set<number>([from]);
  let frontier = [from];
  for (let hops = 1; hops <= limit && frontier.length > 0; hops += 1) {
    const next: number[] = [];
    for (const cell of frontier) {
      for (const neighbour of map.neighbors(cell)) {
        if (neighbour === target) {
          return hops;
        }
        if (!seen.has(neighbour)) {
          seen.add(neighbour);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  return null;
}
