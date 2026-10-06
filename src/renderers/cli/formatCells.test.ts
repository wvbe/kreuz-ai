import { describe, expect, it } from "vitest";
import type { MapView } from "../../game/api/Views";
import { findTerrainCells, formatCell, formatFoundCells } from "./formatCells";

const view: MapView = {
  id: 1,
  gridType: "voronoi",
  width: null,
  height: null,
  parentId: null,
  params: {},
  cellCount: 5,
  terrain: ["grassland", "fertile_soil", "fertile_soil", "forest_oak", "fertile_soil"],
  centers: [
    { x: 0, y: 0 },
    { x: 30, y: 40 },
    { x: 10, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 0 },
  ],
  extent: { x: 100, y: 100 },
  links: [],
};

describe("findTerrainCells", () => {
  it("returns the nearest cells of a terrain, ties by cell index, bounded", () => {
    expect(findTerrainCells(view, "fertile_soil", 0, 10)).toEqual([
      { cell: 2, distance: 10 },
      { cell: 4, distance: 10 },
      { cell: 1, distance: 50 },
    ]);
    expect(findTerrainCells(view, "fertile_soil", 0, 1)).toEqual([{ cell: 2, distance: 10 }]);
  });

  it("is empty for an unknown terrain or reference cell", () => {
    expect(findTerrainCells(view, "lava", 0, 5)).toEqual([]);
    expect(findTerrainCells(view, "fertile_soil", 99, 5)).toEqual([]);
  });
});

describe("formatFoundCells", () => {
  it("prints the cells with distances or says there are none", () => {
    expect(formatFoundCells("fertile_soil", 0, [{ cell: 2, distance: 10 }])).toEqual([
      "fertile_soil, nearest to cell 0:",
      "2 (10)",
    ]);
    expect(formatFoundCells("lava", 0, [])).toEqual(["no lava cells on the map"]);
  });
});

describe("formatCell", () => {
  const cell = {
    mapId: 1,
    cellIndex: 7,
    terrain: "grassland",
    traversable: true,
    moveCost: 10,
    blockReason: null,
    occupants: [3],
    neighbors: [6, 8],
  };

  it("prints terrain, neighbors and occupants", () => {
    expect(formatCell(cell)).toEqual([
      "cell 1:7 grassland, walk cost 10",
      "  neighbors: 6 8",
      "  occupants: #3",
    ]);
  });

  it("shows why a cell is blocked and ignores foreign data", () => {
    expect(formatCell({ ...cell, traversable: false, blockReason: "wall", occupants: [] })).toEqual(
      ["cell 1:7 grassland, blocked (wall)", "  neighbors: 6 8", "  occupants: none"],
    );
    expect(formatCell("x")).toEqual([]);
  });
});
