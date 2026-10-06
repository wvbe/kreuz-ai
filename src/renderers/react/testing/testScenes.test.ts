import { describe, expect, it } from "vitest";
import { squareScene, squareViews, voronoiScene } from "./testScenes";

describe("test scenes", () => {
  it("builds a square map with a polygon per tile", () => {
    const { map, geometry } = squareViews(4, 3);
    expect(map.cellCount).toBe(12);
    expect(geometry.polygons).toHaveLength(12);
    const scene = squareScene(4, 3);
    expect(scene.worldSize).toEqual({ x: 4, z: 3 });
    expect(scene.voronoi).toBe(false);
  });

  it("builds the voronoi scene of a new game", () => {
    const { scene, session } = voronoiScene(42);
    expect(session.hasGame).toBe(true);
    expect(scene.voronoi).toBe(true);
    expect(scene.polygons).toHaveLength(scene.cellCount);
    expect(scene.worldSize.x).toBeCloseTo(Math.sqrt(scene.cellCount));
  });
});
