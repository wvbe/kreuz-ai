import { describe, expect, it } from "vitest";
import { GameSession } from "../../game/api/GameSession";
import { MapSize } from "../../game/map/mapSize";
import { collectZoneMarks } from "./collectZoneMarks";

describe("collectZoneMarks", () => {
  it("is empty without a game and without zones", () => {
    const session = new GameSession(undefined, { entropy: () => 7 });
    expect(collectZoneMarks(session, 1)).toEqual([]);
    session.newGame({ seed: 42, mapSize: MapSize.Small });
    expect(collectZoneMarks(session, 1)).toEqual([]);
  });

  it("reads the zones of one map", () => {
    const session = new GameSession(undefined, { entropy: () => 7 });
    session.newGame({ seed: 42, mapSize: MapSize.Small });
    session.dispatch({ kind: "DesignateZone", zoneTypeId: "stockpile", mapId: 1, cells: [5, 6] });
    session.step(1);
    expect(collectZoneMarks(session, 1)).toEqual([
      { cells: [5, 6], zoneTypeId: "stockpile", active: true },
    ]);
    expect(collectZoneMarks(session, 2)).toEqual([]);
  });
});
