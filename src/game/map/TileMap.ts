/**
 * Abstract tile map types shared by voronoi and square-tile implementations.
 */

export enum MapType {
  Voronoi = "voronoi",
  Square = "square",
}

export enum TerrainType {
  Grassland = "grassland",
  Forest = "forest",
  Mountain = "mountain",
  Water = "water",
  Desert = "desert",
  Marsh = "marsh",
  Snow = "snow",
  Hills = "hills",
  Farmland = "farmland",
  Road = "road",
  Stone = "stone",
  Dirt = "dirt",
  Sand = "sand",
  DeepWater = "deep_water",
}

export type Cell = {
  cellId: number;
  terrain: TerrainType;
  elevation: number;
  moisture: number;
  adjacentCells: number[];
  centerX: number;
  centerY: number;
  walkable: boolean;
  zoneId?: string;
};

export type TileMap = {
  mapId: string;
  mapType: MapType;
  cells: Cell[];
  width: number;
  height: number;
  parentMapId?: string;
  entranceCellId?: number;
};

/**
 * Gets a cell by ID from a map.
 */
export function getCell(map: TileMap, cellId: number): Cell | undefined {
  return map.cells[cellId];
}

/**
 * Gets all adjacent cells for a given cell.
 */
export function getAdjacentCells(map: TileMap, cellId: number): Cell[] {
  const cell = map.cells[cellId];
  if (!cell) return [];
  return cell.adjacentCells
    .map((adjacentId) => map.cells[adjacentId])
    .filter((cell): cell is Cell => cell !== undefined);
}

/**
 * Checks if a cell is walkable (for pathfinding).
 */
export function isCellWalkable(map: TileMap, cellId: number): boolean {
  const cell = map.cells[cellId];
  return cell?.walkable ?? false;
}
