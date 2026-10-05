import type { MapView } from "../../game/api/Views";

/**
 * Character shown for an entity standing on a cell.
 */
export const entityGlyph = "@";

/**
 * Glyph per terrain id of the bundled content pack. Terrains missing here fall back to the first
 * letter of their id (see {@link terrainGlyph}); extend this table when the pack grows.
 */
export const terrainGlyphs: ReadonlyMap<string, string> = new Map([
  ["grassland", "."],
  ["fertile_soil", ","],
  ["forest_oak", "T"],
  ["water_shallow", "~"],
  ["stone_deposit", "o"],
  ["mountain", "^"],
  ["rock_wall", "#"],
  ["iron_ore_deposit", "*"],
  ["cave_floor", ":"],
  ["floor_wood", "_"],
  ["road_dirt", "="],
]);

/**
 * A cell that carries an entity marker.
 */
export type MapMarker = {
  /**
   * Cell index on the rendered map.
   */
  cell: number;
};

/**
 * Size of the character grid a map is rasterized onto.
 */
export type AsciiMapOptions = {
  /**
   * Character columns for voronoi maps (square maps use one column per tile). Default 72.
   */
  columns?: number;
  /**
   * Character rows for voronoi maps (square maps use one row per tile). Default 36.
   */
  rows?: number;
};

/**
 * The glyph of a terrain id.
 *
 * @param terrainId - Terrain id from the content pack.
 * @returns The table glyph, or the id's first letter, or `?` for an empty id.
 */
export function terrainGlyph(terrainId: string): string {
  return terrainGlyphs.get(terrainId) ?? terrainId.charAt(0);
}

/**
 * Renders a map as ASCII, deterministically. Square maps get one character per tile. Voronoi maps
 * are rasterized onto a `columns x rows` grid: every character takes the terrain of the cell
 * whose site is nearest to the character's centre (ties go to the lower cell index). Entity
 * markers overwrite the character that contains their cell's site. A legend follows the grid.
 *
 * @param map - The map view (`centers`, `extent` and `terrain` are what is read).
 * @param markers - Cells that carry entities.
 * @param options - Grid size for voronoi maps.
 * @returns The lines: header, grid rows, legend.
 */
export function renderAsciiMap(
  map: MapView,
  markers: readonly MapMarker[] = [],
  options: AsciiMapOptions = {},
): string[] {
  const square = map.width !== null && map.height !== null;
  const columns = square ? (map.width ?? 1) : (options.columns ?? 72);
  const rows = square ? (map.height ?? 1) : (options.rows ?? 36);
  const grid: string[][] = [];
  const used = new Set<string>();
  for (let row = 0; row < rows; row += 1) {
    const line: string[] = [];
    const pointY = Math.floor(((2 * row + 1) * map.extent.y) / (2 * rows));
    for (let column = 0; column < columns; column += 1) {
      const pointX = Math.floor(((2 * column + 1) * map.extent.x) / (2 * columns));
      const cell = nearestCell(map, pointX, pointY);
      const terrainId = map.terrain[cell] ?? "";
      used.add(terrainId);
      line.push(terrainGlyph(terrainId));
    }
    grid.push(line);
  }
  let markerCount = 0;
  for (const marker of markers) {
    const center = map.centers[marker.cell];
    if (center === undefined) {
      continue;
    }
    const column = Math.min(columns - 1, Math.floor((center.x * columns) / map.extent.x));
    const row = Math.min(rows - 1, Math.floor((center.y * rows) / map.extent.y));
    const line = grid[row];
    if (line !== undefined) {
      line[column] = entityGlyph;
      markerCount += 1;
    }
  }
  const legend = [...used]
    .sort()
    .map((terrainId) => `${terrainGlyph(terrainId)} ${terrainId}`)
    .join("  ");
  return [
    `map ${map.id} (${map.gridType}, ${map.cellCount} cells, ${columns}x${rows} characters)`,
    ...grid.map((line) => line.join("")),
    `legend: ${legend}${markerCount > 0 ? `  ${entityGlyph} entity (${markerCount})` : ""}`,
  ];
}

function nearestCell(map: MapView, pointX: number, pointY: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, center] of map.centers.entries()) {
    const deltaX = center.x - pointX;
    const deltaY = center.y - pointY;
    const distance = deltaX * deltaX + deltaY * deltaY;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}
