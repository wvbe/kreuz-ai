import { describe, expect, it } from "vitest";
import { squareScene, voronoiScene } from "../testing/testScenes";
import { createCellPicker } from "./cellPicker";

describe("createCellPicker", () => {
  // @covers 024:FR-005 024:FR-002
  it("picks square tiles by position, including the edges of the map", () => {
    const picker = createCellPicker(squareScene(8, 6));
    expect(picker.pick({ x: 0.5, z: 0.5 })).toBe(0);
    expect(picker.pick({ x: 7.5, z: 0.5 })).toBe(7);
    expect(picker.pick({ x: 3.2, z: 4.9 })).toBe(4 * 8 + 3);
    expect(picker.pick({ x: 7.99, z: 5.99 })).toBe(47);
  });

  it("returns null off the map", () => {
    const picker = createCellPicker(squareScene(4, 4));
    expect(picker.pick({ x: -0.1, z: 1 })).toBeNull();
    expect(picker.pick({ x: 1, z: 4.5 })).toBeNull();
  });

  it("resolves a point on a shared edge to one of the touching cells", () => {
    const picker = createCellPicker(squareScene(4, 4));
    expect([0, 1]).toContain(picker.pick({ x: 1, z: 0.5 }));
  });

  // @covers 024:FR-005 024:FR-002
  it("picks the voronoi cell whose polygon holds the point, equal to the nearest site", () => {
    const { scene } = voronoiScene(42);
    const picker = createCellPicker(scene);
    for (const [cell, center] of scene.centers.entries()) {
      expect(picker.pick(center)).toBe(cell);
    }
    for (let step = 0; step < 200; step += 1) {
      const point = {
        x: (((step * 37) % 101) / 101) * scene.worldSize.x,
        z: (((step * 53) % 103) / 103) * scene.worldSize.z,
      };
      let nearest = 0;
      let best = Infinity;
      for (const [cell, center] of scene.centers.entries()) {
        const distance = (center.x - point.x) ** 2 + (center.z - point.z) ** 2;
        if (distance < best) {
          best = distance;
          nearest = cell;
        }
      }
      expect(picker.pick(point)).toBe(nearest);
    }
  });
});
