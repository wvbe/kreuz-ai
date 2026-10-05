import { describe, expect, it } from "vitest";
import { buildVoronoiGeometry } from "../map/voronoiGeometry";
import { carvePath } from "./carvePath";
import { WorldTerrain } from "./WorldTerrain";

const geometry = buildVoronoiGeometry({ seed: 42, cellCount: 600, relaxPasses: 2 });

describe("carvePath", () => {
  it("turns blocking cells on the shortest chain into grassland and keeps the rest", () => {
    const terrain: string[] = new Array<string>(600).fill(WorldTerrain.Mountain);
    terrain[10] = WorldTerrain.RoadDirt;
    const chain = carvePath(geometry, terrain, 10, 500);
    expect(chain[0]).toBe(10);
    expect(chain[chain.length - 1]).toBe(500);
    for (let index = 1; index < chain.length; index += 1) {
      expect(geometry.adjacency[chain[index - 1] ?? 0]).toContain(chain[index]);
    }
    expect(terrain[10]).toBe(WorldTerrain.RoadDirt);
    expect(chain.slice(1).every((cell) => terrain[cell] === WorldTerrain.Grassland)).toBe(true);
    expect(terrain.filter((id) => id === WorldTerrain.Grassland)).toHaveLength(chain.length - 1);
  });

  it("returns a single cell for start equal to goal", () => {
    const terrain: string[] = new Array<string>(600).fill(WorldTerrain.Grassland);
    expect(carvePath(geometry, terrain, 5, 5)).toEqual([5]);
  });
});
