import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { GridType } from "../map/mapTypes";
import { terrainHash } from "./terrainHash";

function blankMap(engine: GameEngine) {
  return engine.maps.createMap({
    gridType: GridType.Square,
    terrainId: "grassland",
    width: 4,
    height: 4,
  });
}

describe("terrainHash", () => {
  it("depends only on the terrain of the cells", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 1 });
    const left = blankMap(engine);
    const right = blankMap(engine);
    expect(terrainHash(left)).toMatch(/^[0-9a-f]{16}$/);
    expect(terrainHash(left)).toBe(terrainHash(right));
    right.setTerrain(3, "forest_oak");
    expect(terrainHash(left)).not.toBe(terrainHash(right));
  });
});
