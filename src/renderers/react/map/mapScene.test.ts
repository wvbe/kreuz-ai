import { describe, expect, it } from "vitest";
import { squareViews, voronoiScene } from "../testing/testScenes";
import { buildMapScene } from "./mapScene";

describe("buildMapScene", () => {
  // @covers 024:FR-002
  it("makes a square tile one world unit", () => {
    const { map, geometry } = squareViews(5, 3);
    const scene = buildMapScene(map, geometry);
    expect(scene.scale).toBeCloseTo(0.001);
    expect(scene.centers[0]).toEqual({ x: 0.5, z: 0.5 });
    expect(scene.polygons[1]?.[1]).toEqual({ x: 2, z: 0 });
    expect(scene.terrain).toHaveLength(15);
  });

  // @covers 024:FR-002
  it("sizes a voronoi map by its cell count", () => {
    const { scene } = voronoiScene(42);
    expect(scene.worldSize.x).toBeCloseTo(Math.sqrt(scene.cellCount));
    expect(scene.worldSize.x).toBeCloseTo(scene.worldSize.z);
    for (const center of scene.centers) {
      expect(center.x).toBeGreaterThanOrEqual(0);
      expect(center.x).toBeLessThanOrEqual(scene.worldSize.x);
    }
  });
});
