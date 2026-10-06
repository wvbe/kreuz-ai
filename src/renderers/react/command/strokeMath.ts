import type { GroundPoint } from "../map/cameraMath";

/**
 * How a drag on the map turns into cells.
 */
export enum StrokeMode {
  /**
   * Every cell the pointer passes over (zone painting).
   */
  Paint = "paint",
  /**
   * Every cell inside the rectangle spanned by the start and the current cell (walls).
   */
  Rectangle = "rectangle",
}

/**
 * Adds a cell to a paint stroke: the stroke keeps each cell once, in the order it was first
 * touched. Returns the same array when nothing changes, so callers can skip a re-render.
 *
 * @param stroke - The cells painted so far.
 * @param cell - The cell under the pointer, or null off the map.
 * @returns The stroke including the cell.
 */
export function appendStrokeCell(
  stroke: readonly number[],
  cell: number | null,
): readonly number[] {
  return cell === null || stroke.includes(cell) ? stroke : [...stroke, cell];
}

/**
 * The cells whose centre lies inside the axis-aligned rectangle spanned by two cells (in ground
 * units, so it also works on a voronoi map). The two corner cells are always included.
 *
 * @param centers - Cell centres of the map scene, indexed by cell.
 * @param fromCell - The cell where the drag started.
 * @param toCell - The cell the pointer is on now.
 * @returns The cell indexes in ascending order; empty when a corner is unknown.
 */
export function cellsInRect(
  centers: readonly GroundPoint[],
  fromCell: number,
  toCell: number,
): readonly number[] {
  const first = centers[fromCell];
  const second = centers[toCell];
  if (first === undefined || second === undefined) {
    return [];
  }
  const minX = Math.min(first.x, second.x);
  const maxX = Math.max(first.x, second.x);
  const minZ = Math.min(first.z, second.z);
  const maxZ = Math.max(first.z, second.z);
  const cells: number[] = [];
  centers.forEach((center, index) => {
    const inside = center.x >= minX && center.x <= maxX && center.z >= minZ && center.z <= maxZ;
    if (inside || index === fromCell || index === toCell) {
      cells.push(index);
    }
  });
  return cells;
}

/**
 * The cells of a stroke after the pointer moved to a new cell.
 *
 * @param mode - Paint or rectangle.
 * @param start - The cell where the stroke began.
 * @param stroke - The cells so far.
 * @param centers - Cell centres of the scene.
 * @param cell - The cell under the pointer, or null off the map.
 * @returns The new cells; `stroke` itself when nothing changed.
 */
export function extendStroke(
  mode: StrokeMode,
  start: number,
  stroke: readonly number[],
  centers: readonly GroundPoint[],
  cell: number | null,
): readonly number[] {
  if (mode === StrokeMode.Paint) {
    return appendStrokeCell(stroke, cell);
  }
  return cell === null ? stroke : cellsInRect(centers, start, cell);
}
