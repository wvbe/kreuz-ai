import { BufferAttribute, BufferGeometry } from "three";
import type { CellBuffers } from "./cellBuffers";

/**
 * Wraps triangle buffers into a three.js geometry with vertex colours.
 *
 * @param buffers - Positions, colours and indices from `buildCellBuffers`.
 * @returns The geometry (the caller disposes it).
 */
export function geometryFromBuffers(buffers: CellBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("color", new BufferAttribute(buffers.colors, 3));
  geometry.setIndex(new BufferAttribute(buffers.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Wraps line-segment points into a three.js geometry.
 *
 * @param points - x, y, z per point, two points per segment (see `buildOutlineBuffer`).
 * @returns The geometry (the caller disposes it).
 */
export function lineGeometryFromPoints(points: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(points, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
