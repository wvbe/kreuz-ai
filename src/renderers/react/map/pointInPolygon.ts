import type { GroundPoint } from "./cameraMath";

/**
 * Whether a point lies inside a polygon (even-odd rule); a point on an edge may count either way.
 *
 * @param point - The point.
 * @param polygon - Corners in order.
 * @returns True when inside.
 */
export function pointInPolygon(point: GroundPoint, polygon: readonly GroundPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index] as GroundPoint;
    const before = polygon[previous] as GroundPoint;
    const crosses =
      current.z > point.z !== before.z > point.z &&
      point.x <
        ((before.x - current.x) * (point.z - current.z)) / (before.z - current.z) + current.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}
