import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import { buildVoronoiGeometry } from "../map/voronoiGeometry";
import { cellSpacing, generateOutdoorTerrain } from "./generateOutdoorTerrain";
import { chooseVillageCenter } from "./layoutVillage";
import { WorldTerrain } from "./WorldTerrain";

const geometry = buildVoronoiGeometry({ seed: 42, cellCount: 600, relaxPasses: 2 });

function paint(seed: number): { terrain: string[]; center: number } {
  const stream = Prng.create({ seed }).stream("world.gen");
  const center = chooseVillageCenter(geometry, stream);
  return { terrain: generateOutdoorTerrain({ geometry, stream, villageCenter: center }), center };
}

describe("cellSpacing", () => {
  it("is the integer square root of area per cell and shrinks with more cells", () => {
    expect(cellSpacing(600)).toBe(2675);
    expect(cellSpacing(2400)).toBe(1337);
    expect(cellSpacing(1200)).toBeLessThan(cellSpacing(600));
  });
});

describe("generateOutdoorTerrain", () => {
  // @covers 004:SC-014
  // @covers 004:FR-016
  it("is a pure function of geometry, stream and village", () => {
    expect(paint(42)).toEqual(paint(42));
    expect(paint(42).terrain).not.toEqual(paint(43).terrain);
  });

  it("paints one registered world terrain per cell with every natural class", () => {
    const { terrain } = paint(42);
    expect(terrain).toHaveLength(600);
    const used = new Set(terrain);
    for (const expected of [
      WorldTerrain.Grassland,
      WorldTerrain.Mountain,
      WorldTerrain.WaterShallow,
      WorldTerrain.ForestOak,
      WorldTerrain.StoneDeposit,
      WorldTerrain.FertileSoil,
    ]) {
      expect(used.has(expected)).toBe(true);
    }
    expect(used.has(WorldTerrain.IronOreDeposit)).toBe(false);
    expect(used.has(WorldTerrain.RoadDirt)).toBe(false);
  });

  it("puts mountains on the edges and keeps water and forest away from the village", () => {
    const { terrain, center } = paint(42);
    const corner = terrain.filter((_, cell) => {
      const point = geometry.centroids[cell] ?? { x: 0, y: 0 };
      return Math.min(point.x, point.y, 65535 - point.x, 65535 - point.y) < 800;
    });
    expect(corner.every((id) => id === WorldTerrain.Mountain)).toBe(true);
    expect(terrain[center]).toBe(WorldTerrain.Grassland);
    for (const next of geometry.adjacency[center] ?? []) {
      expect(terrain[next]).toBe(WorldTerrain.Grassland);
    }
  });

  it("puts fertile soil next to water only", () => {
    const { terrain } = paint(42);
    terrain.forEach((id, cell) => {
      if (id === WorldTerrain.FertileSoil) {
        const next = geometry.adjacency[cell] ?? [];
        expect(next.some((other) => terrain[other] === WorldTerrain.WaterShallow)).toBe(true);
      }
    });
  });
});
