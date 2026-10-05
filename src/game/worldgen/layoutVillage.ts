import type { PrngStream } from "../engine/Prng";
import type { CellPoint, MapGeometry } from "../map/mapTypes";
import { voronoiWorldSize } from "../map/mapTypes";
import { distanceSquared } from "./distanceSquared";
import { cellSpacing } from "./generateOutdoorTerrain";
import { WorldTerrain } from "./WorldTerrain";

/**
 * The starting settlement written into a terrain list (spec 004 village pass).
 */
export type VillageLayout = {
  /**
   * Cell of the settlement anchor (job board, first road junction).
   */
  center: number;
  /**
   * Cleared grassland within two cell steps of the center, ordered by step distance then cell
   * index; includes the center, the plots and the road cells inside the clearing.
   */
  clearing: number[];
  /**
   * Dirt road cells, ascending; four spokes that follow the cell adjacency (Delaunay edges).
   */
  roads: number[];
  /**
   * Starter plots: fertile soil cells inside the clearing, ascending.
   */
  plots: number[];
};

const clearingRadiusSteps = 2;
const spokeReachSpacings = 6;
const plotCount = 4;
const centerCandidates = 5;
const impassableForRoads: readonly string[] = [WorldTerrain.WaterShallow, WorldTerrain.Mountain];

/**
 * Picks the settlement cell: one of the few cells whose centre is closest to the middle of the
 * world, drawn from the stream (the world generator keeps the village inland).
 *
 * @param geometry - Geometry of the voronoi map.
 * @param stream - The `world.gen` stream.
 * @returns The cell index.
 */
export function chooseVillageCenter(geometry: MapGeometry, stream: PrngStream): number {
  const middle: CellPoint = { x: voronoiWorldSize / 2, y: voronoiWorldSize / 2 };
  const ranked = geometry.centroids
    .map((point, cell) => ({ cell, distance: distanceSquared(point, middle) }))
    .sort((left, right) => left.distance - right.distance || left.cell - right.cell)
    .slice(0, centerCandidates)
    .map((entry) => entry.cell);
  return stream.choice(ranked);
}

function clearingAround(geometry: MapGeometry, center: number): number[] {
  const depth = new Map<number, number>([[center, 0]]);
  const order = [center];
  for (let head = 0; head < order.length; head += 1) {
    const cell = order[head] as number;
    const steps = depth.get(cell) as number;
    if (steps === clearingRadiusSteps) {
      continue;
    }
    for (const next of geometry.adjacency[cell] as readonly number[]) {
      if (!depth.has(next)) {
        depth.set(next, steps + 1);
        order.push(next);
      }
    }
  }
  return order.sort(
    (left, right) => (depth.get(left) as number) - (depth.get(right) as number) || left - right,
  );
}

function walkSpoke(
  geometry: MapGeometry,
  terrain: readonly string[],
  start: number,
  target: CellPoint,
  length: number,
): number[] {
  const cells: number[] = [];
  const used = new Set<number>([start]);
  let current = start;
  for (let step = 0; step < length; step += 1) {
    let best = -1;
    let bestScore = Number.MAX_SAFE_INTEGER;
    for (const next of geometry.adjacency[current] as readonly number[]) {
      if (used.has(next) || impassableForRoads.includes(terrain[next] as string)) {
        continue;
      }
      const score = distanceSquared(geometry.centroids[next] as CellPoint, target);
      if (score < bestScore) {
        best = next;
        bestScore = score;
      }
    }
    if (best === -1) {
      break;
    }
    used.add(best);
    cells.push(best);
    current = best;
  }
  return cells;
}

/**
 * Writes the starting village into `terrain`: a grassland clearing (two cell steps around the
 * center), four dirt road spokes of 4 to 6 cells that follow the cell adjacency, and up to four
 * fertile-soil starter plots in the clearing next to the roads. Lakes and forests never reach
 * the clearing, so the layout is always traversable.
 *
 * @param geometry - Geometry of the voronoi map.
 * @param stream - The `world.gen` stream.
 * @param terrain - Terrain list to modify in place.
 * @param center - Settlement cell from {@link chooseVillageCenter}.
 * @returns The cells of the clearing, roads and plots.
 */
export function layoutVillage(
  geometry: MapGeometry,
  stream: PrngStream,
  terrain: string[],
  center: number,
): VillageLayout {
  const clearing = clearingAround(geometry, center);
  for (const cell of clearing) {
    terrain[cell] = WorldTerrain.Grassland;
  }
  const origin = geometry.centroids[center] as CellPoint;
  const reach = spokeReachSpacings * cellSpacing(geometry.cellCount);
  const spokes: CellPoint[] = [
    { x: origin.x + reach, y: origin.y },
    { x: origin.x - reach, y: origin.y },
    { x: origin.x, y: origin.y + reach },
    { x: origin.x, y: origin.y - reach },
  ];
  const roads = new Set<number>([center]);
  for (const target of spokes) {
    const cells = walkSpoke(geometry, terrain, center, target, stream.nextInt(4, 6));
    for (const cell of cells) {
      roads.add(cell);
    }
  }
  for (const cell of roads) {
    terrain[cell] = WorldTerrain.RoadDirt;
  }
  const open = clearing.filter((cell) => !roads.has(cell));
  const plots: number[] = [];
  while (plots.length < plotCount && open.length > 0) {
    const [chosen] = open.splice(stream.nextInt(0, open.length - 1), 1);
    plots.push(chosen as number);
  }
  plots.sort((left, right) => left - right);
  for (const cell of plots) {
    terrain[cell] = WorldTerrain.FertileSoil;
  }
  return {
    center,
    clearing,
    roads: [...roads].sort((left, right) => left - right),
    plots,
  };
}
