/**
 * Voronoi tile map implementation.
 * Uses Delaunay triangulation for adjacency computation.
 * Cells are irregular polygons defined by seed points.
 */

import { MapType, TerrainType, type Cell, type TileMap } from "./TileMap.js";
import type { PrngState } from "../engine/Prng.js";
import { nextRandom, randomFloat } from "../engine/Prng.js";

export type VoronoiPoint = {
  x: number;
  y: number;
};

/**
 * Creates a voronoi tile map with the given number of cells.
 * Uses Lloyd relaxation for more even cell distribution.
 */
export function createVoronoiTileMap(
  mapId: string,
  cellCount: number,
  width: number,
  height: number,
  prng: PrngState,
): { map: TileMap; prng: PrngState } {
  let currentPrng = prng;
  let points: VoronoiPoint[] = [];

  // Generate random seed points
  for (let index = 0; index < cellCount; index++) {
    const xResult = randomFloat(currentPrng, 0, width);
    currentPrng = xResult.prng;
    const yResult = randomFloat(currentPrng, 0, height);
    currentPrng = yResult.prng;
    points.push({ x: xResult.value, y: yResult.value });
  }

  // Lloyd relaxation (2 iterations for natural-looking distribution)
  for (let iteration = 0; iteration < 2; iteration++) {
    points = lloydRelaxation(points, width, height);
  }

  // Compute Delaunay adjacency
  const adjacency = computeDelaunayAdjacency(points);

  // Create cells
  const cells: Cell[] = points.map((point, index) => ({
    cellId: index,
    terrain: TerrainType.Grassland,
    elevation: 0,
    moisture: 0.5,
    adjacentCells: adjacency[index] ?? [],
    centerX: point.x,
    centerY: point.y,
    walkable: true,
  }));

  return {
    map: {
      mapId,
      mapType: MapType.Voronoi,
      cells,
      width,
      height,
    },
    prng: currentPrng,
  };
}

/**
 * Performs one iteration of Lloyd relaxation.
 * Moves each point toward the centroid of its Voronoi cell.
 */
function lloydRelaxation(points: VoronoiPoint[], width: number, height: number): VoronoiPoint[] {
  // Simple approximation: for each point, average with neighbors
  const adjacency = computeDelaunayAdjacency(points);
  return points.map((point, index) => {
    const neighbors = adjacency[index] ?? [];
    if (neighbors.length === 0) return point;
    let sumX = point.x;
    let sumY = point.y;
    let count = 1;
    for (const neighborIndex of neighbors) {
      const neighbor = points[neighborIndex];
      if (neighbor) {
        sumX += neighbor.x;
        sumY += neighbor.y;
        count++;
      }
    }
    return {
      x: Math.max(0, Math.min(width, sumX / count)),
      y: Math.max(0, Math.min(height, sumY / count)),
    };
  });
}

/**
 * Computes Delaunay adjacency using a simple O(n^2) distance approach.
 * For production, a proper Delaunay triangulation (Bowyer-Watson) would be used.
 * This simplified version connects each point to its nearest neighbors.
 */
function computeDelaunayAdjacency(points: VoronoiPoint[]): number[][] {
  const maxNeighbors = 6;
  const adjacency: number[][] = Array.from({ length: points.length }, () => []);

  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    // Sort all other points by distance
    const distances: Array<{ targetIndex: number; distance: number }> = [];
    for (let other = 0; other < points.length; other++) {
      if (other === index) continue;
      const otherPoint = points[other]!;
      const distanceX = point.x - otherPoint.x;
      const distanceY = point.y - otherPoint.y;
      distances.push({
        targetIndex: other,
        distance: distanceX * distanceX + distanceY * distanceY,
      });
    }
    distances.sort((first, second) => first.distance - second.distance);
    adjacency[index] = distances.slice(0, maxNeighbors).map((entry) => entry.targetIndex);
  }

  // Make adjacency bidirectional
  for (let index = 0; index < points.length; index++) {
    for (const neighbor of adjacency[index]!) {
      if (!adjacency[neighbor]!.includes(index)) {
        adjacency[neighbor]!.push(index);
      }
    }
  }

  return adjacency;
}
