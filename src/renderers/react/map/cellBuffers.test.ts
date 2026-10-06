import { describe, expect, it } from "vitest";
import { squareScene, voronoiScene } from "../testing/testScenes";
import { buildCellBuffers, buildOutlineBuffer, cellShade, unpackColor } from "./cellBuffers";

describe("cellBuffers", () => {
  it("unpacks colours and shades deterministically within bounds", () => {
    expect(unpackColor(0xff8000)).toEqual([1, 128 / 255, 0]);
    for (let cell = 0; cell < 500; cell += 1) {
      const shade = cellShade(cell);
      expect(shade).toBeGreaterThanOrEqual(0.94);
      expect(shade).toBeLessThanOrEqual(1.06);
      expect(cellShade(cell)).toBe(shade);
    }
  });

  it("triangulates two triangles per square tile", () => {
    const scene = squareScene(4, 4);
    const buffers = buildCellBuffers(scene, null, () => 0x00ff00, 0.5);
    expect(buffers.positions).toHaveLength(16 * 4 * 3);
    expect(buffers.indices).toHaveLength(16 * 2 * 3);
    expect(buffers.positions[1]).toBe(0.5);
    expect(buffers.colors[1]).toBe(1);
    expect(Math.max(...buffers.indices)).toBe(16 * 4 - 1);
  });

  it("covers every voronoi polygon with corners minus two triangles", () => {
    const { scene } = voronoiScene(42);
    const buffers = buildCellBuffers(scene, null, () => 0x808080, 0, true);
    const corners = scene.polygons.reduce((sum, polygon) => sum + polygon.length, 0);
    expect(buffers.positions).toHaveLength(corners * 3);
    expect(buffers.indices).toHaveLength((corners - 2 * scene.cellCount) * 3);
  });

  it("includes only the requested cells and skips degenerate ones", () => {
    const scene = squareScene(4, 4);
    const buffers = buildCellBuffers(scene, [0, 5, 99], () => 0xffffff, 0);
    expect(buffers.positions).toHaveLength(2 * 4 * 3);
  });

  it("outlines each polygon edge", () => {
    const scene = squareScene(2, 2);
    expect(buildOutlineBuffer(scene, null, 0.1)).toHaveLength(4 * 4 * 6);
    expect(buildOutlineBuffer(scene, [1], 0.1)).toHaveLength(4 * 6);
  });
});
