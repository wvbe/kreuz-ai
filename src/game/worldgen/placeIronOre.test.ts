import { describe, expect, it } from "vitest";
import { Prng } from "../engine/Prng";
import { buildVoronoiGeometry } from "../map/voronoiGeometry";
import { generateOutdoorTerrain } from "./generateOutdoorTerrain";
import { chooseVillageCenter, layoutVillage } from "./layoutVillage";
import { placeIronOre } from "./placeIronOre";
import { WorldTerrain } from "./WorldTerrain";

const geometry = buildVoronoiGeometry({ seed: 42, cellCount: 600, relaxPasses: 2 });

function place(seed: number): {
  terrain: string[];
  ore: number[];
  clearing: number[];
} {
  const stream = Prng.create({ seed }).stream("world.gen");
  const center = chooseVillageCenter(geometry, stream);
  const terrain = generateOutdoorTerrain({ geometry, stream, villageCenter: center });
  const village = layoutVillage(geometry, stream, terrain, center);
  const ore = placeIronOre(geometry, stream, terrain, center, village.clearing);
  return { terrain, ore, clearing: village.clearing };
}

describe("placeIronOre", () => {
  it("writes one to three ore cells at the foot of the mountains, outside the clearing", () => {
    const { terrain, ore, clearing } = place(42);
    expect(ore.length).toBeGreaterThanOrEqual(1);
    expect(ore.length).toBeLessThanOrEqual(3);
    expect([...ore].sort((left, right) => left - right)).toEqual(ore);
    for (const cell of ore) {
      expect(terrain[cell]).toBe(WorldTerrain.IronOreDeposit);
      expect(clearing).not.toContain(cell);
    }
    const first = ore[0] ?? 0;
    const foot = ore.some((cell) =>
      (geometry.adjacency[cell] ?? []).some((next) => terrain[next] === WorldTerrain.Mountain),
    );
    expect(foot).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic and returns nothing without any mountain", () => {
    expect(place(9)).toEqual(place(9));
    const stream = Prng.create({ seed: 1 }).stream("world.gen");
    const flat: string[] = new Array<string>(600).fill(WorldTerrain.Grassland);
    expect(placeIronOre(geometry, stream, flat, 300, [300])).toEqual([]);
    expect(flat.includes(WorldTerrain.IronOreDeposit)).toBe(false);
  });
});
