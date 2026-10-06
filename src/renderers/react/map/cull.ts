import type { GroundPoint } from "./cameraMath";

/**
 * An axis-aligned box on the ground plane.
 */
export type GroundBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/**
 * Whether a ground point lies in the box grown by a margin (spec 024 FR-003 culling: what is
 * outside the visible ground is not laid out or drawn).
 *
 * @param point - The point.
 * @param bounds - The visible ground, or null for "everything".
 * @param margin - Extra world units around the box (an object's radius).
 * @returns True when the point should be drawn.
 */
export function isInBounds(
  point: GroundPoint,
  bounds: GroundBounds | null,
  margin: number,
): boolean {
  return (
    bounds === null ||
    (point.x >= bounds.minX - margin &&
      point.x <= bounds.maxX + margin &&
      point.z >= bounds.minZ - margin &&
      point.z <= bounds.maxZ + margin)
  );
}

/**
 * The indices of the points inside the box.
 *
 * @param points - Points by index (for example cell centres).
 * @param bounds - The visible ground, or null for all.
 * @param margin - Extra world units around the box.
 * @returns Ascending indices of the visible points.
 */
export function visibleIndices(
  points: readonly GroundPoint[],
  bounds: GroundBounds | null,
  margin: number,
): number[] {
  const visible: number[] = [];
  for (const [index, point] of points.entries()) {
    if (isInBounds(point, bounds, margin)) {
      visible.push(index);
    }
  }
  return visible;
}
