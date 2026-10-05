import type { GameMap } from "../map/GameMap";

/**
 * Validates a stored path against the current map (spec 012 FR-006, US3): every step must be an
 * adjacent, currently traversable cell. A mover calls this before each step (or after a
 * `map.terrain.changed` / `map.cell.obstruction.changed` event) to learn whether to re-plan.
 *
 * @param map - The map the path was planned on.
 * @param from - The cell the mover stands on now.
 * @param cells - The remaining steps of the path (excluding `from`).
 * @returns Index in `cells` of the first step that is not adjacent or not traversable, or null
 * when the path is still valid.
 */
export function findPathBreak(map: GameMap, from: number, cells: readonly number[]): number | null {
  let current = from;
  for (let index = 0; index < cells.length; index += 1) {
    const next = cells[index] as number;
    if (
      !map.inBounds(current) ||
      !map.inBounds(next) ||
      !map.neighbors(current).includes(next) ||
      !map.isTraversable(next)
    ) {
      return index;
    }
    current = next;
  }
  return null;
}
