import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/api/GameSession";
import { GridType } from "../../src/game/map/mapTypes";
import { collectEntityMarkers } from "../../src/renderers/cli/collectEntityMarkers";
import { renderAsciiMap } from "../../src/renderers/cli/renderAsciiMap";

// Golden ASCII maps (plan task 1.10). The terrain patterns below are test-local stand-ins for the
// generators of task 2.1; they only exercise the renderer on a seeded Voronoi and a square map.

const terrains = ["grassland", "forest_oak", "water_shallow", "mountain", "fertile_soil"];

function placePeasants(session: GameSession, mapId: number, count: number): void {
  const map = session.engine.maps.require(mapId);
  let placed = 0;
  for (let cell = Math.floor(map.cellCount / 5); placed < count; cell += 37) {
    if (map.isTraversable(cell)) {
      const peasant = session.engine.store.spawn("peasant", {
        Position: { mapId, cellIndex: cell },
      });
      session.engine.maps.placeEntity(peasant.id, mapId, cell);
      placed += 1;
    }
  }
}

function render(session: GameSession, mapId: number): string {
  const view = session.query.map(mapId);
  if (view === null) {
    throw new Error("map missing");
  }
  return renderAsciiMap(view, collectEntityMarkers(session, mapId)).join("\n") + "\n";
}

describe("ASCII map golden files", () => {
  it("renders a seeded Voronoi map", async () => {
    const session = new GameSession();
    session.newGame({ seed: 42, mapSize: 0 });
    const map = session.engine.maps.require(1);
    for (let cell = 0; cell < map.cellCount; cell += 1) {
      const center = map.centroid(cell);
      const band =
        (Math.floor(center.x / 9000) + 2 * Math.floor(center.y / 14000)) % terrains.length;
      map.setTerrain(cell, terrains[band] ?? "grassland");
    }
    placePeasants(session, 1, 4);
    const text = render(session, 1);
    expect(text).toBe(render(session, 1));
    await expect(text).toMatchFileSnapshot("./golden/voronoi-seed42-small.txt");
  });

  it("renders a square map", async () => {
    const session = new GameSession();
    session.newGame({ seed: 7 });
    const map = session.engine.maps.createMap({
      gridType: GridType.Square,
      terrainId: "grassland",
      width: 30,
      height: 20,
    });
    for (let row = 0; row < 20; row += 1) {
      for (let column = 0; column < 30; column += 1) {
        const cell = map.squareCell(column, row);
        if (row === 0 || row === 19 || column === 0 || column === 29) {
          map.setTerrain(cell, "rock_wall");
        } else if (column > 12 && column < 17) {
          map.setTerrain(cell, row === 10 ? "road_dirt" : "water_shallow");
        } else if ((column * 3 + row * 5) % 11 === 0) {
          map.setTerrain(cell, "forest_oak");
        }
      }
    }
    placePeasants(session, map.id, 3);
    await expect(render(session, map.id)).toMatchFileSnapshot("./golden/square-30x20.txt");
  });
});
