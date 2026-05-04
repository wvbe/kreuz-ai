/**
 * Square tile map implementation.
 * Grid-based map with 4-connected adjacency and wall edge support.
 */

import { MapType, TerrainType, type Cell, type TileMap } from "./TileMap.js";

export type WallEdge = {
  cellA: number;
  cellB: number;
  hasDoor: boolean;
};

export type SquareTileMapData = {
  map: TileMap;
  walls: WallEdge[];
};

/**
 * Creates a square tile map with the given dimensions.
 */
export function createSquareTileMap(
  mapId: string,
  gridWidth: number,
  gridHeight: number,
  parentMapId?: string,
  entranceCellId?: number,
): SquareTileMapData {
  const cells: Cell[] = [];

  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const cellId = row * gridWidth + col;
      const adjacentCells: number[] = [];

      // 4-connected adjacency (N, E, S, W)
      if (row > 0) adjacentCells.push((row - 1) * gridWidth + col);
      if (col < gridWidth - 1) adjacentCells.push(row * gridWidth + col + 1);
      if (row < gridHeight - 1) adjacentCells.push((row + 1) * gridWidth + col);
      if (col > 0) adjacentCells.push(row * gridWidth + col - 1);

      cells.push({
        cellId,
        terrain: TerrainType.Stone,
        elevation: 0,
        moisture: 0,
        adjacentCells,
        centerX: col + 0.5,
        centerY: row + 0.5,
        walkable: true,
      });
    }
  }

  return {
    map: {
      mapId,
      mapType: MapType.Square,
      cells,
      width: gridWidth,
      height: gridHeight,
      parentMapId,
      entranceCellId,
    },
    walls: [],
  };
}

/**
 * Adds a wall between two adjacent cells.
 * Removes them from each other's adjacency lists for pathfinding purposes.
 */
export function addWall(
  data: SquareTileMapData,
  cellA: number,
  cellB: number,
  hasDoor: boolean = false,
): void {
  data.walls.push({ cellA, cellB, hasDoor });
  if (!hasDoor) {
    // Block traversal
    const cellAData = data.map.cells[cellA];
    const cellBData = data.map.cells[cellB];
    if (cellAData) {
      cellAData.adjacentCells = cellAData.adjacentCells.filter((id) => id !== cellB);
    }
    if (cellBData) {
      cellBData.adjacentCells = cellBData.adjacentCells.filter((id) => id !== cellA);
    }
  }
}

/**
 * Gets the grid coordinates for a cell ID.
 */
export function getCellCoords(
  gridWidth: number,
  cellId: number,
): { col: number; row: number } {
  return {
    col: cellId % gridWidth,
    row: Math.floor(cellId / gridWidth),
  };
}

/**
 * Gets the cell ID for grid coordinates.
 */
export function getCellId(gridWidth: number, col: number, row: number): number {
  return row * gridWidth + col;
}
