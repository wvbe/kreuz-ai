import { defaultFindLimit, findTerrainCells, formatCell, formatFoundCells } from "../formatCells";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb } from "./Verb";

/**
 * Map-reading verbs for planning: `find` (cells of a terrain nearest to the village) and `cell`
 * (one cell with its neighbors).
 */
export const cellVerbs: readonly Verb[] = [
  {
    name: "find",
    usage: "find <terrainId> [limit]",
    summary:
      "list the cells of a terrain (fertile_soil, stone_deposit, forest_oak ...) nearest to the village board, with their distance",
    run: (args, { session }) => {
      const [terrainId, limitText] = args;
      const limit = limitText === undefined ? defaultFindLimit : parseCount(limitText);
      if (terrainId === undefined || limit === null || limit < 1 || args.length > 2) {
        return verbFailed("usage: find <terrainId> [limit]");
      }
      const map = session.query.maps().maps[0];
      const view = map === undefined ? null : session.query.map(map.id);
      if (view === null) {
        return verbFailed("there is no map");
      }
      const boards = session.query.run("job-boards", {});
      const board = boards.ok && Array.isArray(boards.data) ? boards.data[0] : undefined;
      const boardCell =
        typeof board === "object" && board !== null && !Array.isArray(board)
          ? board["cellIndex"]
          : undefined;
      const from = typeof boardCell === "number" ? boardCell : 0;
      return verbDone(
        formatFoundCells(terrainId, from, findTerrainCells(view, terrainId, from, limit)),
      );
    },
  },
  {
    name: "cell",
    usage: "cell <mapId> <cell>",
    summary:
      "show one cell: terrain, walk cost, occupants and neighbor cells (a wall ring must cover the neighbors of a room)",
    run: (args, { session }) => {
      const mapId = parseCount(args[0]);
      const cell = parseCount(args[1]);
      if (mapId === null || cell === null || args.length !== 2) {
        return verbFailed("usage: cell <mapId> <cell>");
      }
      const result = session.query.run("cell", { mapId, cell });
      if (!result.ok) {
        return verbFailed(`${result.error.kind}: ${result.error.message}`);
      }
      return verbDone(formatCell(result.data));
    },
  },
];
