/**
 * Shared data model of the map module (spec 004, DECISIONS D-05 and D-21).
 */

/**
 * Cell layout of a map. Immutable per map; voronoi is the outdoor default, square the indoor one.
 */
export enum GridType {
  Square = "square",
  Voronoi = "voronoi",
}

/**
 * Why a cell cannot be entered (DECISIONS D-21). The value is the spec 004 reason string.
 */
export enum BlockReason {
  Wall = "wall",
  Water = "water",
  Locked = "locked",
  ImpassableCliff = "impassable_cliff",
  Furniture = "furniture",
}

/**
 * Terrain movement cost classes in cost units per cell entry (DECISIONS section 0, D-04).
 */
export enum MoveCostClass {
  Fastest = 5,
  Fast = 7,
  Normal = 10,
  Slow = 15,
  VerySlow = 25,
}

/**
 * Side of the square voronoi world; sites live in `0..voronoiMaxCoordinate` on both axes.
 */
export const voronoiWorldSize = 65536;

/**
 * Highest voronoi site coordinate.
 */
export const voronoiMaxCoordinate = voronoiWorldSize - 1;

/**
 * Pitch of one square tile in map units (milli-units: a tile is 1000 wide).
 */
export const squareTilePitch = 1000;

/**
 * Lloyd passes used when a voronoi map does not say otherwise (spec 004 generator: 2).
 */
export const defaultRelaxPasses = 2;

/**
 * An integer point in map units: milli-tiles on square maps, `0..65535` on voronoi maps.
 */
export type CellPoint = {
  x: number;
  y: number;
};

/**
 * Derived, never serialized cell geometry (AD9): a pure function of the map params.
 */
export type MapGeometry = {
  gridType: GridType;
  cellCount: number;
  /**
   * Total extent of the map in map units.
   */
  extent: CellPoint;
  /**
   * Representative point (site or tile centre) of every cell.
   */
  centroids: readonly CellPoint[];
  /**
   * Polygon corners of every cell, counter-clockwise, clipped to the map extent.
   */
  polygons: readonly (readonly CellPoint[])[];
  /**
   * Adjacent cells of every cell, ascending cell index.
   */
  adjacency: readonly (readonly number[])[];
  /**
   * Upper bound of the centroid distance between adjacent cells (for admissible A* heuristics).
   */
  stepUnit: number;
};

/**
 * Generation parameters that, with the grid type, fully determine the geometry.
 */
export type MapParams = {
  /**
   * Name of the generator that filled the terrain (`blank` for hand-made maps).
   */
  generator: string;
  /**
   * Seed `0..2^32-1` for the geometry (voronoi) and the generator.
   */
  seed: number;
  /**
   * Voronoi only: number of cells.
   */
  cellCount?: number;
  /**
   * Voronoi only: number of Lloyd relaxation passes (default {@link defaultRelaxPasses}).
   */
  relaxPasses?: number;
};

/**
 * A one-way link from a cell of a map to a cell of another map (sub-map entrance, stairs, ...).
 */
export type MapLink = {
  cell: number;
  targetMapId: number;
  targetCell: number;
};

/**
 * Serialized map (DECISIONS D-05 plus `parentId` and `links`): geometry is not stored.
 */
export type MapState = {
  id: number;
  gridType: GridType;
  width?: number;
  height?: number;
  params: MapParams;
  parentId: number | null;
  cells: { terrain: string }[];
  links: MapLink[];
};

/**
 * Where an entity stands: the content of the `Position` component.
 */
export type MapLocation = {
  mapId: number;
  cellIndex: number;
};
