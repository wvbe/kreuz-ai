import { describe, expect, it } from "vitest";
import { DwellingLevel } from "../content/contentTypes";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";
import { GameEngine } from "../engine/GameEngine";
import {
  isAtOrAbove,
  levelDefinition,
  levelName,
  levelRank,
  nextLevelOf,
  orderedLevels,
  previousLevelOf,
} from "./dwellingLevels";

describe("dwelling levels", () => {
  it("orders the four levels like the enum", () => {
    expect(orderedLevels).toEqual(Object.values(DwellingLevel));
    expect(levelRank(DwellingLevel.Hovel)).toBe(0);
    expect(levelRank(DwellingLevel.BurgherHouse)).toBe(3);
  });

  it("walks up and down the ladder and stops at both ends", () => {
    expect(nextLevelOf(DwellingLevel.Hovel)).toBe(DwellingLevel.Cottage);
    expect(nextLevelOf(DwellingLevel.BurgherHouse)).toBeNull();
    expect(previousLevelOf(DwellingLevel.Cottage)).toBe(DwellingLevel.Hovel);
    expect(previousLevelOf(DwellingLevel.Hovel)).toBeNull();
  });

  it("compares levels", () => {
    expect(isAtOrAbove(DwellingLevel.Cottage, DwellingLevel.Hovel)).toBe(true);
    expect(isAtOrAbove(DwellingLevel.Cottage, DwellingLevel.Cottage)).toBe(true);
    expect(isAtOrAbove(DwellingLevel.Hovel, DwellingLevel.Cottage)).toBe(false);
  });

  it("names the levels", () => {
    expect(orderedLevels.map(levelName)).toEqual([
      "Hovel",
      "Cottage",
      "Timber-Framed House",
      "Burgher House",
    ]);
  });

  it("reads the content record of a level", () => {
    const engine = new GameEngine(loadVillageBakeryContent());
    expect(levelDefinition(engine, DwellingLevel.Hovel).capacity).toBe(2);
    expect(levelDefinition(engine, DwellingLevel.Cottage).unlockTier).toBe("village");
  });
});
