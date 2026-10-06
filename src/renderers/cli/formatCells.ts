import { z } from "zod";
import type { MapView } from "../../game/api/Views";
import type { JsonValue } from "../../game/engine/EventBus";

/**
 * Default number of cells the `find` verb prints.
 */
export const defaultFindLimit = 12;

/**
 * A cell of a terrain with its distance from a reference cell.
 */
export type FoundCell = {
  cell: number;
  /**
   * Straight-line distance between the cell centers, in map units, rounded down.
   */
  distance: number;
};

/**
 * Finds the cells of one terrain nearest to a reference cell (the village center), ties by cell
 * index.
 *
 * @param view - The map view (terrain and cell centers).
 * @param terrainId - Terrain id such as `fertile_soil`.
 * @param from - The reference cell index.
 * @param limit - How many cells at most.
 * @returns Nearest first.
 */
export function findTerrainCells(
  view: MapView,
  terrainId: string,
  from: number,
  limit: number,
): FoundCell[] {
  const origin = view.centers[from];
  if (origin === undefined) {
    return [];
  }
  const found: FoundCell[] = [];
  view.terrain.forEach((terrain, cell) => {
    const center = view.centers[cell];
    if (terrain === terrainId && center !== undefined) {
      const dx = center.x - origin.x;
      const dy = center.y - origin.y;
      found.push({ cell, distance: Math.floor(Math.sqrt(dx * dx + dy * dy)) });
    }
  });
  return found
    .sort((left, right) => left.distance - right.distance || left.cell - right.cell)
    .slice(0, limit);
}

/**
 * Formats the result of {@link findTerrainCells} for the `find` verb.
 *
 * @param terrainId - The terrain searched.
 * @param from - The reference cell.
 * @param cells - The cells found.
 * @returns Output lines.
 */
export function formatFoundCells(
  terrainId: string,
  from: number,
  cells: readonly FoundCell[],
): string[] {
  if (cells.length === 0) {
    return [`no ${terrainId} cells on the map`];
  }
  return [
    `${terrainId}, nearest to cell ${from}:`,
    cells.map((entry) => `${entry.cell} (${entry.distance})`).join(" "),
  ];
}

const cellSchema = z.object({
  mapId: z.number(),
  cellIndex: z.number(),
  terrain: z.string(),
  traversable: z.boolean(),
  moveCost: z.number(),
  blockReason: z.string().nullable(),
  occupants: z.array(z.number()),
  neighbors: z.array(z.number()),
});

/**
 * Formats the `cell` query for the `cell` verb: terrain, walkability, occupants and neighbors
 * (the cells a wall ring must cover to enclose a zone).
 *
 * @param view - Data of the `cell` query.
 * @returns Output lines, empty when the data is not a cell.
 */
export function formatCell(view: JsonValue): string[] {
  const parsed = cellSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const cell = parsed.data;
  const walk = cell.traversable
    ? `walk cost ${cell.moveCost}`
    : `blocked (${cell.blockReason ?? "?"})`;
  return [
    `cell ${cell.mapId}:${cell.cellIndex} ${cell.terrain}, ${walk}`,
    `  neighbors: ${cell.neighbors.join(" ")}`,
    `  occupants: ${cell.occupants.length === 0 ? "none" : cell.occupants.map((id) => `#${id}`).join(" ")}`,
  ];
}
