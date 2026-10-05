import { describe, expect, it } from "vitest";
import { GameSession } from "../../game/api/GameSession";
import { collectEntityMarkers } from "./collectEntityMarkers";

describe("collectEntityMarkers", () => {
  it("returns the cells of entities positioned on the map", () => {
    const session = new GameSession();
    session.newGame({ seed: 3, mapSize: 0 });
    const peasant = session.engine.store.spawn("peasant", { Position: { mapId: 1, cellIndex: 7 } });
    session.engine.maps.placeEntity(peasant.id, 1, 7);
    expect(collectEntityMarkers(session, 1)).toEqual([{ cell: 7 }]);
    expect(collectEntityMarkers(session, 2)).toEqual([]);
  });

  it("ignores entities without a position", () => {
    const session = new GameSession();
    session.newGame({ seed: 3 });
    expect(collectEntityMarkers(session, 1)).toEqual([]);
  });
});
