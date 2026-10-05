import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { MapSize } from "../map/mapSize";
import { generateWorld } from "./generateWorld";
import { minReachablePercent, verifyWorld } from "./verifyWorld";
import { WorldTerrain } from "./WorldTerrain";

function world() {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 42 });
  const generated = generateWorld(engine, MapSize.Small, 42);
  return { map: engine.maps.require(generated.mapId), village: generated.village, generated };
}

describe("verifyWorld", () => {
  it("accepts a generated world", () => {
    const { map, village } = world();
    expect(verifyWorld(map, village)).toEqual([]);
    expect(minReachablePercent).toBe(60);
  });

  it("reports a missing terrain class", () => {
    const { map, village, generated } = world();
    for (const cell of generated.oreCells) {
      map.setTerrain(cell, WorldTerrain.Grassland);
    }
    expect(verifyWorld(map, village)).toEqual([`no ${WorldTerrain.IronOreDeposit} cell`]);
  });

  it("reports ore that the village cannot reach", () => {
    const { map, village, generated } = world();
    for (const cell of generated.oreCells) {
      for (const next of map.neighbors(cell)) {
        if (!generated.oreCells.includes(next)) {
          map.setTerrain(next, WorldTerrain.RockWall);
        }
      }
    }
    expect(verifyWorld(map, village)).toContain(
      `no ${WorldTerrain.IronOreDeposit} cell is reachable from the village`,
    );
  });

  it("reports an enclosed village and a blocked clearing", () => {
    const { map, village } = world();
    for (const cell of village.clearing) {
      for (const next of map.neighbors(cell)) {
        if (!village.clearing.includes(next)) {
          map.setTerrain(next, WorldTerrain.RockWall);
        }
      }
    }
    expect(verifyWorld(map, village).some((problem) => problem.startsWith("only "))).toBe(true);
    map.setTerrain(village.center, WorldTerrain.RockWall);
    expect(verifyWorld(map, village)).toContain("the village clearing is not traversable");
  });
});
