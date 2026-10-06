import type { MapGeometryView, MapView } from "../../../game/api/Views";
import type { GroundPoint } from "./cameraMath";

/**
 * One map in world coordinates (tiles on the ground plane), everything the map layers draw and
 * pick from. Built once per map; the engine's integer map units never reach three.js.
 */
export type MapScene = {
  mapId: number;
  /**
   * Whether the map is a voronoi map (irregular cells) or a square grid.
   */
  voronoi: boolean;
  cellCount: number;
  /**
   * Width and depth of the map in world units.
   */
  worldSize: GroundPoint;
  /**
   * World units per map unit.
   */
  scale: number;
  /**
   * Terrain id of every cell.
   */
  terrain: readonly string[];
  /**
   * Representative point of every cell.
   */
  centers: readonly GroundPoint[];
  /**
   * Polygon corners of every cell.
   */
  polygons: readonly (readonly GroundPoint[])[];
};

/**
 * Converts the `map` and `map-geometry` views of one map to world coordinates: a square tile is
 * one world unit wide; a voronoi map is `sqrt(cellCount)` units wide so an average cell is about
 * one unit, whatever the map size.
 *
 * @param map - The `map` view.
 * @param geometry - The `map-geometry` view of the same map.
 * @returns The scene data.
 */
export function buildMapScene(map: MapView, geometry: MapGeometryView): MapScene {
  const square = map.width !== null;
  const side = square ? (map.width ?? 1) : Math.sqrt(map.cellCount);
  const scale = side / Math.max(map.extent.x, 1);
  const toWorld = (point: { x: number; y: number }): GroundPoint => ({
    x: point.x * scale,
    z: point.y * scale,
  });
  return {
    mapId: map.id,
    voronoi: !square,
    cellCount: map.cellCount,
    worldSize: { x: map.extent.x * scale, z: map.extent.y * scale },
    scale,
    terrain: map.terrain,
    centers: map.centers.map(toWorld),
    polygons: geometry.polygons.map((polygon) => polygon.map(toWorld)),
  };
}
