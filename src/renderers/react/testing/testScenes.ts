import { GameSession } from "../../../game/api/GameSession";
import type { MapGeometryView, MapView } from "../../../game/api/Views";
import { buildMapScene } from "../map/mapScene";
import type { MapScene } from "../map/mapScene";

/**
 * A square map as the `map` and `map-geometry` views would report it (tiles of 1000 map units),
 * for tests of the map math.
 *
 * @param width - Tiles per row.
 * @param height - Rows.
 * @returns The two views.
 */
export function squareViews(
  width: number,
  height: number,
): { map: MapView; geometry: MapGeometryView } {
  const terrain: string[] = [];
  const centers: { x: number; y: number }[] = [];
  const polygons: { x: number; y: number }[][] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      terrain.push((row + column) % 2 === 0 ? "grassland" : "fertile_soil");
      centers.push({ x: column * 1000 + 500, y: row * 1000 + 500 });
      polygons.push([
        { x: column * 1000, y: row * 1000 },
        { x: column * 1000 + 1000, y: row * 1000 },
        { x: column * 1000 + 1000, y: row * 1000 + 1000 },
        { x: column * 1000, y: row * 1000 + 1000 },
      ]);
    }
  }
  return {
    map: {
      id: 1,
      gridType: "square",
      width,
      height,
      parentId: null,
      params: {},
      cellCount: width * height,
      terrain,
      centers,
      extent: { x: width * 1000, y: height * 1000 },
      links: [],
    },
    geometry: { mapId: 1, polygons },
  };
}

/**
 * The scene of a square map.
 *
 * @param width - Tiles per row.
 * @param height - Rows.
 * @returns The scene.
 */
export function squareScene(width: number, height: number): MapScene {
  const { map, geometry } = squareViews(width, height);
  return buildMapScene(map, geometry);
}

/**
 * The scene of the first map of a fresh game (voronoi, Small) started from a seed.
 *
 * @param seed - Game seed.
 * @returns The session and the scene of map 1.
 */
export function voronoiScene(seed: number): { session: GameSession; scene: MapScene } {
  const session = new GameSession();
  session.newGame({ seed, difficulty: "steady", mapSize: 0 });
  const map = session.query.map(1);
  const geometry = session.query.mapGeometry(1);
  if (map === null || geometry === null) {
    throw new Error("the new game has no map 1");
  }
  return { session, scene: buildMapScene(map, geometry) };
}
