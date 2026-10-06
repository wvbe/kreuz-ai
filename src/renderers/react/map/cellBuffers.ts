import type { MapScene } from "./mapScene";

/**
 * Triangle buffers of a set of cells, ready for a three.js `BufferGeometry`.
 */
export type CellBuffers = {
  /**
   * x, y, z per vertex.
   */
  positions: Float32Array;
  /**
   * r, g, b per vertex, 0..1.
   */
  colors: Float32Array;
  /**
   * Three vertex indices per triangle.
   */
  indices: Uint32Array;
};

/**
 * Splits a 0xRRGGBB colour into 0..1 components.
 *
 * @param hex - The colour.
 * @returns Red, green and blue.
 */
export function unpackColor(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

/**
 * A small deterministic brightness factor per cell, so neighbouring cells of one terrain stay
 * distinguishable without outlines.
 *
 * @param cell - Cell index.
 * @returns A factor between 0.94 and 1.06.
 */
export function cellShade(cell: number): number {
  const mixed = Math.imul(cell + 1, 2654435761) >>> 0;
  return 0.94 + (((mixed >>> 8) % 1000) / 1000) * 0.12;
}

/**
 * Fan-triangulates the polygons of the given cells (convex, as voronoi cells and tiles are) into
 * one mesh: a whole map is a single draw call.
 *
 * @param scene - The map in world coordinates.
 * @param cells - Cells to include, or null for all.
 * @param colorOf - 0xRRGGBB colour of a cell.
 * @param height - World y of the surface.
 * @param shade - Whether to vary the brightness per cell (terrain does, overlays do not).
 * @returns The buffers.
 */
export function buildCellBuffers(
  scene: MapScene,
  cells: readonly number[] | null,
  colorOf: (cell: number) => number,
  height: number,
  shade = false,
): CellBuffers {
  const list = cells ?? scene.polygons.map((_polygon, index) => index);
  let vertexCount = 0;
  let triangleCount = 0;
  for (const cell of list) {
    const corners = scene.polygons[cell]?.length ?? 0;
    if (corners >= 3) {
      vertexCount += corners;
      triangleCount += corners - 2;
    }
  }
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(triangleCount * 3);
  let vertex = 0;
  let triangle = 0;
  for (const cell of list) {
    const polygon = scene.polygons[cell];
    if (polygon === undefined || polygon.length < 3) {
      continue;
    }
    const [red, green, blue] = unpackColor(colorOf(cell));
    const factor = shade ? cellShade(cell) : 1;
    const first = vertex;
    for (const corner of polygon) {
      positions[vertex * 3] = corner.x;
      positions[vertex * 3 + 1] = height;
      positions[vertex * 3 + 2] = corner.z;
      colors[vertex * 3] = Math.min(1, red * factor);
      colors[vertex * 3 + 1] = Math.min(1, green * factor);
      colors[vertex * 3 + 2] = Math.min(1, blue * factor);
      vertex += 1;
    }
    for (let corner = 1; corner < polygon.length - 1; corner += 1) {
      indices[triangle * 3] = first;
      indices[triangle * 3 + 1] = first + corner;
      indices[triangle * 3 + 2] = first + corner + 1;
      triangle += 1;
    }
  }
  return { positions, colors, indices };
}

/**
 * Line segments (pairs of points) along the polygon edges of the given cells.
 *
 * @param scene - The map in world coordinates.
 * @param cells - Cells to outline, or null for all.
 * @param height - World y of the lines.
 * @returns x, y, z per point; two points per segment.
 */
export function buildOutlineBuffer(
  scene: MapScene,
  cells: readonly number[] | null,
  height: number,
): Float32Array {
  const list = cells ?? scene.polygons.map((_polygon, index) => index);
  let segments = 0;
  for (const cell of list) {
    segments += scene.polygons[cell]?.length ?? 0;
  }
  const points = new Float32Array(segments * 6);
  let offset = 0;
  for (const cell of list) {
    const polygon = scene.polygons[cell] ?? [];
    for (const [index, corner] of polygon.entries()) {
      const next = polygon[(index + 1) % polygon.length] ?? corner;
      points.set([corner.x, height, corner.z, next.x, height, next.z], offset);
      offset += 6;
    }
  }
  return points;
}
