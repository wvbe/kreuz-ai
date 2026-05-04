/**
 * Village layout generator.
 * Places roads, zone seeds, and initial structures on a voronoi map.
 */

import type { TileMap } from "../TileMap.js";
import { TerrainType } from "../TileMap.js";
import type { PrngState } from "../../engine/Prng.js";
import { randomInt, pickRandom, shuffle } from "../../engine/Prng.js";

export type VillageZone = {
  cellId: number;
  zoneType: string;
  label: string;
};

export type VillageLayout = {
  townCenter: number;
  roads: number[];
  zones: VillageZone[];
};

/**
 * Generates a village layout on a voronoi map.
 * Finds a suitable town center, places roads radiating outward, and assigns zone types.
 */
export function generateVillageLayout(
  map: TileMap,
  prng: PrngState,
): { layout: VillageLayout; prng: PrngState } {
  let currentPrng = prng;

  // Find town center: a walkable cell near the map center
  const walkableCells = map.cells.filter((cell) => cell.walkable);
  const centerX = map.width / 2;
  const centerY = map.height / 2;
  walkableCells.sort((cellA, cellB) => {
    const distA = Math.hypot(cellA.centerX - centerX, cellA.centerY - centerY);
    const distB = Math.hypot(cellB.centerX - centerX, cellB.centerY - centerY);
    return distA - distB;
  });

  const townCenter = walkableCells[0]?.cellId ?? 0;

  // Create roads radiating from center (mark cells as road terrain)
  const roads: number[] = [townCenter];
  const visited = new Set<number>([townCenter]);
  const roadQueue = [...(map.cells[townCenter]?.adjacentCells ?? [])];

  // Build roads outward for ~20% of walkable cells
  const maxRoadCells = Math.floor(walkableCells.length * 0.15);
  while (roads.length < maxRoadCells && roadQueue.length > 0) {
    const { value: nextIndex, prng: p1 } = randomInt(currentPrng, 0, roadQueue.length - 1);
    currentPrng = p1;
    const nextCell = roadQueue.splice(nextIndex, 1)[0]!;
    if (visited.has(nextCell)) continue;
    visited.add(nextCell);

    const cell = map.cells[nextCell];
    if (cell && cell.walkable) {
      roads.push(nextCell);
      cell.terrain = TerrainType.Road;
      // Add neighbors to queue
      for (const neighbor of cell.adjacentCells) {
        if (!visited.has(neighbor)) {
          roadQueue.push(neighbor);
        }
      }
    }
  }

  // Assign zones adjacent to roads
  const zoneTypes = [
    "market", "blacksmith", "bakery", "tavern", "church",
    "farm", "woodcutter", "quarry", "residential", "barracks",
  ];
  const zones: VillageZone[] = [];
  const zoneCells = walkableCells.filter(
    (cell) => !roads.includes(cell.cellId) && cell.adjacentCells.some((adj) => roads.includes(adj)),
  );

  const { value: shuffledZoneCells, prng: afterShuffle } = shuffle(currentPrng, zoneCells);
  currentPrng = afterShuffle;

  for (let index = 0; index < Math.min(zoneTypes.length, shuffledZoneCells.length); index++) {
    const cell = shuffledZoneCells[index]!;
    zones.push({
      cellId: cell.cellId,
      zoneType: zoneTypes[index]!,
      label: zoneTypes[index]!,
    });
  }

  return {
    layout: { townCenter, roads, zones },
    prng: currentPrng,
  };
}
