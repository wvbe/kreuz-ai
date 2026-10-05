import { GridType, squareTilePitch } from "./mapTypes";
import type { CellPoint, MapGeometry } from "./mapTypes";

/**
 * Builds the geometry of a square map: 4-connected adjacency (no diagonals), tile centres and
 * square polygons in milli-tiles. `cellIndex = y * width + x`.
 *
 * @param width - Tiles per row, at least 1.
 * @param height - Tile rows, at least 1.
 * @returns The derived geometry; neighbours ascend by cell index (up, left, right, down).
 */
export function buildSquareGeometry(width: number, height: number): MapGeometry {
  const cellCount = width * height;
  const centroids: CellPoint[] = [];
  const polygons: CellPoint[][] = [];
  const adjacency: number[][] = [];
  const half = squareTilePitch / 2;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const cell = row * width + column;
      const left = column * squareTilePitch;
      const top = row * squareTilePitch;
      const right = left + squareTilePitch;
      const bottom = top + squareTilePitch;
      centroids.push({ x: left + half, y: top + half });
      polygons.push([
        { x: left, y: top },
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
      ]);
      const around: number[] = [];
      if (row > 0) {
        around.push(cell - width);
      }
      if (column > 0) {
        around.push(cell - 1);
      }
      if (column < width - 1) {
        around.push(cell + 1);
      }
      if (row < height - 1) {
        around.push(cell + width);
      }
      adjacency.push(around);
    }
  }
  return {
    gridType: GridType.Square,
    cellCount,
    extent: { x: width * squareTilePitch, y: height * squareTilePitch },
    centroids,
    polygons,
    adjacency,
    stepUnit: squareTilePitch,
  };
}
