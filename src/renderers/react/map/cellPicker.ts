import type { GroundPoint } from "./cameraMath";
import type { MapScene } from "./mapScene";
import { pointInPolygon } from "./pointInPolygon";

/**
 * Answers which cell lies under a ground point (spec 024 FR-005). Built once per map from the
 * polygons; the lookup is a bucket grid plus an exact point-in-polygon test, so it is exact for
 * square tiles and voronoi cells alike and costs a handful of polygon tests per pick.
 */
export type CellPicker = {
  /**
   * The cell under the point, or null off the map.
   */
  pick: (point: GroundPoint) => number | null;
};

/**
 * Builds the picker of a map.
 *
 * @param scene - The map in world coordinates.
 * @returns The picker.
 */
export function createCellPicker(scene: MapScene): CellPicker {
  const bucketsPerSide = Math.max(1, Math.ceil(Math.sqrt(scene.cellCount)));
  const bucketX = scene.worldSize.x / bucketsPerSide;
  const bucketZ = scene.worldSize.z / bucketsPerSide;
  const buckets = new Map<number, number[]>();
  const columnOf = (value: number): number =>
    Math.min(bucketsPerSide - 1, Math.max(0, Math.floor(value / bucketX)));
  const rowOf = (value: number): number =>
    Math.min(bucketsPerSide - 1, Math.max(0, Math.floor(value / bucketZ)));
  for (const [cell, polygon] of scene.polygons.entries()) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const corner of polygon) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minZ = Math.min(minZ, corner.z);
      maxZ = Math.max(maxZ, corner.z);
    }
    for (let row = rowOf(minZ); row <= rowOf(maxZ); row += 1) {
      for (let column = columnOf(minX); column <= columnOf(maxX); column += 1) {
        const key = row * bucketsPerSide + column;
        const bucket = buckets.get(key);
        if (bucket === undefined) {
          buckets.set(key, [cell]);
        } else {
          bucket.push(cell);
        }
      }
    }
  }
  return {
    pick: (point) => {
      if (
        point.x < 0 ||
        point.z < 0 ||
        point.x > scene.worldSize.x ||
        point.z > scene.worldSize.z
      ) {
        return null;
      }
      const candidates = buckets.get(rowOf(point.z) * bucketsPerSide + columnOf(point.x)) ?? [];
      let nearest: number | null = null;
      let nearestDistance = Infinity;
      for (const cell of candidates) {
        if (pointInPolygon(point, scene.polygons[cell] ?? [])) {
          return cell;
        }
        const center = scene.centers[cell] as GroundPoint;
        const distance = (center.x - point.x) ** 2 + (center.z - point.z) ** 2;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = cell;
        }
      }
      // A point exactly on a shared edge can miss every even-odd test; the nearest centre of the
      // bucket is the cell it belongs to.
      return nearest;
    },
  };
}
