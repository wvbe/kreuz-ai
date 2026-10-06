import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import { buildVoronoiGeometry } from "../map/voronoiGeometry";
import { chooseVillageCenter, layoutVillage } from "./layoutVillage";
import { WorldTerrain } from "./WorldTerrain";

const geometry = buildVoronoiGeometry({ seed: 42, cellCount: 600, relaxPasses: 2 });

function lay(seed: number): { terrain: string[]; layout: ReturnType<typeof layoutVillage> } {
  const stream = Prng.create({ seed }).stream("world.gen");
  const terrain: string[] = new Array<string>(600).fill(WorldTerrain.ForestOak);
  const center = chooseVillageCenter(geometry, stream);
  return { terrain, layout: layoutVillage(geometry, stream, terrain, center) };
}

describe("chooseVillageCenter", () => {
  it("picks one of the cells closest to the middle of the world", () => {
    const stream = Prng.create({ seed: 1 }).stream("world.gen");
    const center = chooseVillageCenter(geometry, stream);
    const point = geometry.centroids[center] ?? { x: 0, y: 0 };
    expect(Math.abs(point.x - 32768)).toBeLessThan(6000);
    expect(Math.abs(point.y - 32768)).toBeLessThan(6000);
    const again = chooseVillageCenter(geometry, Prng.create({ seed: 1 }).stream("world.gen"));
    expect(again).toBe(center);
  });
});

describe("layoutVillage", () => {
  it("clears a two-step clearing around the center and lays roads and plots in it", () => {
    const { terrain, layout } = lay(42);
    expect(layout.clearing[0]).toBe(layout.center);
    expect(layout.clearing.length).toBeGreaterThanOrEqual(10);
    for (const cell of layout.clearing) {
      expect([WorldTerrain.Grassland, WorldTerrain.RoadDirt, WorldTerrain.FertileSoil]).toContain(
        terrain[cell],
      );
    }
    expect(layout.roads).toContain(layout.center);
    expect(layout.roads.every((cell) => terrain[cell] === WorldTerrain.RoadDirt)).toBe(true);
    expect(layout.plots).toHaveLength(4);
    expect(layout.plots.every((cell) => layout.clearing.includes(cell))).toBe(true);
    expect(layout.plots.every((cell) => terrain[cell] === WorldTerrain.FertileSoil)).toBe(true);
  });

  // @covers 004:FR-016a
  // @covers 004:SC-014
  it("builds roads out of adjacent cells (Delaunay edges) and is deterministic", () => {
    const { layout } = lay(7);
    const outside = layout.roads.filter((cell) => cell !== layout.center);
    for (const cell of outside) {
      const next = geometry.adjacency[cell] ?? [];
      expect(next.some((other) => layout.roads.includes(other))).toBe(true);
    }
    expect(lay(7).layout).toEqual(layout);
  });
});
