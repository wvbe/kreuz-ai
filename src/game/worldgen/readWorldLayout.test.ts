import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { MapSize } from "../map/mapSize";
import { readWorldLayout } from "./readWorldLayout";
import { WorldTerrain } from "./WorldTerrain";

describe("readWorldLayout", () => {
  it("returns null for a game without a generated map", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 1 });
    expect(readWorldLayout(engine)).toBeNull();
  });

  it("finds the village anchor, the ore and the settlers, also after load", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 42, mapSize: MapSize.Small });
    const layout = readWorldLayout(engine);
    expect(layout?.mapId).toBe(1);
    expect(layout?.villageCell).not.toBeNull();
    expect(layout?.settlerIds).toEqual([3, 4, 5, 6, 7, 8]);
    const map = engine.maps.require(1);
    expect(layout?.oreCells.length).toBeGreaterThan(0);
    for (const cell of layout?.oreCells ?? []) {
      expect(map.terrainAt(cell)).toBe(WorldTerrain.IronOreDeposit);
    }
    const restored = new GameEngine(loadContent(), { entropy: () => 9 });
    restored.loadGame(engine.saveGame());
    expect(readWorldLayout(restored)).toEqual(layout);
  });
});
