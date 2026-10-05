import { GridType } from "./mapTypes";

/**
 * Starting-map size option of `newGame` (spec 007, DECISIONS D-06).
 */
export enum MapSize {
  Small = 0,
  Medium = 1,
  Large = 2,
}

/**
 * Dimensions a {@link MapSize} produces on one grid type.
 */
export type MapDimensions = {
  gridType: GridType;
  cellCount: number;
  width?: number;
  height?: number;
};

const voronoiCellCounts: Record<MapSize, number> = {
  [MapSize.Small]: 600,
  [MapSize.Medium]: 1200,
  [MapSize.Large]: 2400,
};

const squareSizes: Record<MapSize, { width: number; height: number }> = {
  [MapSize.Small]: { width: 30, height: 20 },
  [MapSize.Medium]: { width: 40, height: 30 },
  [MapSize.Large]: { width: 60, height: 40 },
};

/**
 * Maps a size option to concrete map dimensions: voronoi 600 / 1200 / 2400 cells (DECISIONS
 * D-06); square 30x20 / 40x30 / 60x40 tiles, which have the same cell counts.
 *
 * @param size - Requested size.
 * @param gridType - Grid kind of the map to create.
 * @returns Cell count plus `width` and `height` for square maps.
 */
export function mapDimensionsFor(size: MapSize, gridType: GridType): MapDimensions {
  if (gridType === GridType.Voronoi) {
    return { gridType, cellCount: voronoiCellCounts[size] };
  }
  const { width, height } = squareSizes[size];
  return { gridType, cellCount: width * height, width, height };
}
