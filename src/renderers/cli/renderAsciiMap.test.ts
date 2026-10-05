import { describe, expect, it } from "vitest";
import type { MapView } from "../../game/api/Views";
import { entityGlyph, renderAsciiMap, terrainGlyph } from "./renderAsciiMap";

function squareMap(): MapView {
  const terrain = ["grassland", "grassland", "water_shallow", "rock_wall", "forest_oak", "mystery"];
  return {
    id: 2,
    gridType: "square",
    width: 3,
    height: 2,
    parentId: null,
    params: {},
    cellCount: 6,
    terrain,
    centers: terrain.map((_terrain, index) => ({
      x: (index % 3) * 1000 + 500,
      y: Math.floor(index / 3) * 1000 + 500,
    })),
    extent: { x: 3000, y: 2000 },
    links: [],
  };
}

function voronoiMap(): MapView {
  return {
    id: 1,
    gridType: "voronoi",
    width: null,
    height: null,
    parentId: null,
    params: {},
    cellCount: 3,
    terrain: ["grassland", "water_shallow", "mountain"],
    centers: [
      { x: 10000, y: 10000 },
      { x: 50000, y: 10000 },
      { x: 30000, y: 60000 },
    ],
    extent: { x: 65536, y: 65536 },
    links: [],
  };
}

describe("terrainGlyph", () => {
  it("uses the table, then the first letter", () => {
    expect(terrainGlyph("grassland")).toBe(".");
    expect(terrainGlyph("mystery")).toBe("m");
    expect(terrainGlyph("")).toBe("");
  });
});

describe("renderAsciiMap", () => {
  it("draws a square map one character per tile", () => {
    expect(renderAsciiMap(squareMap())).toEqual([
      "map 2 (square, 6 cells, 3x2 characters)",
      "..~",
      "#Tm",
      "legend: T forest_oak  . grassland  m mystery  # rock_wall  ~ water_shallow",
    ]);
  });

  it("places markers on the character containing the cell", () => {
    const lines = renderAsciiMap(squareMap(), [{ cell: 4 }, { cell: 99 }]);
    expect(lines[2]).toBe(`#${entityGlyph}m`);
    expect(lines[3]).toContain(`${entityGlyph} entity (1)`);
  });

  it("rasterizes a voronoi map onto the requested grid by nearest site", () => {
    const lines = renderAsciiMap(voronoiMap(), [], { columns: 8, rows: 4 });
    expect(lines.slice(1, 5)).toEqual(["....~~~~", "....~~~~", ".^^^^^^~", "^^^^^^^^"]);
    expect(renderAsciiMap(voronoiMap(), [], { columns: 8, rows: 4 })).toEqual(
      renderAsciiMap(voronoiMap(), [], { columns: 8, rows: 4 }),
    );
  });

  it("defaults to 72x36 for voronoi maps", () => {
    const lines = renderAsciiMap(voronoiMap());
    expect(lines).toHaveLength(36 + 2);
    expect(lines[1]).toHaveLength(72);
  });
});
