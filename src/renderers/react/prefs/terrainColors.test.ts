import { describe, expect, it } from "vitest";
import { terrainColor, terrainColors, unknownTerrainColor, zoneColor } from "./terrainColors";

describe("terrain colours", () => {
  it("covers every terrain of the bundled content", () => {
    for (const id of [
      "grassland",
      "fertile_soil",
      "forest_oak",
      "water_shallow",
      "stone_deposit",
      "mountain",
      "rock_wall",
      "iron_ore_deposit",
      "cave_floor",
      "floor_wood",
      "road_dirt",
    ]) {
      expect(terrainColors.has(id)).toBe(true);
      expect(terrainColor(id)).toBe(terrainColors.get(id));
    }
  });

  it("falls back for unknown ids", () => {
    expect(terrainColor("lava")).toBe(unknownTerrainColor);
    expect(zoneColor("stockpile")).not.toBe(zoneColor("farm_field"));
    expect(zoneColor("nothing")).toBe(0xffffff);
  });
});
